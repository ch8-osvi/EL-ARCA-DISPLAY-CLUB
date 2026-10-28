import { refundAmounts } from "@/lib/refundAmounts";
import { roundCupPrice } from "@/lib/searchUtils";
import { requestFingerprint } from "@/lib/security/request-fingerprint";
import { dailySalesPipeline, EMPTY_DAILY_SALES } from "@/lib/salesSummary";
import type { RefundDestination } from "@/lib/refundDestinations";
import { productCategory } from "@/lib/categories";
import { atomicResponse } from "@/lib/security/atomic-response";
import { requireAdmin } from "@/lib/security/admin";
import { getActiveExchangeRate } from "@/lib/exchangeRate";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongoose";
import { Sale } from "@/lib/models/Sale";
import { Product } from "@/lib/models/Product";
import { StockHistory } from "@/lib/models/StockHistory";
import { getHavanaMonthDay } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

/** Generates order number: MMDD + 3 random letters + product count (zero-padded to 2) in Cuba timezone */
function generateOrderNumber(totalItems: number): string {
  const { mm, dd } = getHavanaMonthDay();
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26)),
  ).join("");
  const count = String(totalItems).padStart(2, "0");
  return `${mm}${dd}${letters}${count}`;
}

/**
 * GET /api/sales
 * Returns all sales sorted newest first, plus daily summary metrics (gross, refunds, net).
 */
async function handleGET() {
  try {
    await connectToDatabase();

    const [sales, daily, totalCount] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1, _id: -1 }).limit(201).lean(),
      Sale.aggregate(dailySalesPipeline()),
      Sale.countDocuments({}),
    ]);
    return NextResponse.json({
      success: true,
      sales: sales.slice(0, 200),
      historyLimited: sales.length > 200,
      totalCount,
      daily: daily[0] || EMPTY_DAILY_SALES,
    });
  } catch (err) {
    console.error("[sales GET]", err);
    return NextResponse.json(
      { success: false, error: "Error obteniendo ventas" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sales
 * Actions:
 *  - create: registers a sale, deducts stock, records movements
 *  - toggle-paid: toggles paid status on an existing sale
 *  - refund: processes partial or total return, restores stock, logs reason & returns audit
 */
async function handlePOST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json(
        { success: false, error: "Solicitud inválida" },
        { status: 400 },
      );
    const { action, requestId } = body;
    if (
      requestId !== undefined &&
      (typeof requestId !== "string" ||
        !/^[a-z0-9:_-]{8,100}$/i.test(requestId))
    )
      return NextResponse.json(
        { success: false, error: "Identificador de operación inválido" },
        { status: 400 },
      );
    const requestHash = requestFingerprint(
      Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== "requestId"),
      ),
    );

    // --------------------------------------------------------
    // ACTION: CREATE SALE
    // --------------------------------------------------------
    if (action === "create") {
      const { clientName, items, currency, exchangeRate, paid, notes } = body;

      if (
        !Array.isArray(items) ||
        items.length === 0 ||
        items.length > 100 ||
        (currency !== undefined && !["USD", "CUP"].includes(currency)) ||
        (paid !== undefined && typeof paid !== "boolean") ||
        (clientName !== undefined &&
          (typeof clientName !== "string" || clientName.length > 200)) ||
        (notes !== undefined &&
          (typeof notes !== "string" || notes.length > 4000))
      )
        return NextResponse.json(
          {
            success: false,
            error:
              "Datos de venta inválidos (máximo 100 productos, moneda USD/CUP y pago booleano)",
          },
          { status: 400 },
        );
      const productIds = new Set<string>();
      for (const item of items) {
        if (
          !item ||
          typeof item.productId !== "string" ||
          !item.productId.trim() ||
          item.productId.length > 200 ||
          !Number.isSafeInteger(item.qty) ||
          item.qty < 1 ||
          item.qty > 10000 ||
          !Number.isFinite(item.precioUSD) ||
          item.precioUSD < 0 ||
          productIds.has(item.productId)
        )
          return NextResponse.json(
            {
              success: false,
              error:
                "Producto, cantidad o precio inválido; agrupa las unidades del mismo producto en una sola línea",
            },
            { status: 400 },
          );
        productIds.add(item.productId);
      }

      if (requestId) {
        const existing = await Sale.findOne({ requestId });
        if (existing)
          return existing.requestHash === requestHash
            ? NextResponse.json({
                success: true,
                sale: existing,
                replayed: true,
              })
            : NextResponse.json(
                {
                  success: false,
                  error:
                    "El identificador ya corresponde a otra venta. Revisa el historial.",
                },
                { status: 409 },
              );
      }
      const activeRate = await getActiveExchangeRate();
      if (!activeRate)
        return NextResponse.json(
          { success: false, error: "Configura la tasa antes de facturar" },
          { status: 503 },
        );
      if (exchangeRate !== activeRate.rate)
        return NextResponse.json(
          {
            success: false,
            error: "La tasa cambió. Actualiza el POS antes de facturar.",
          },
          { status: 409 },
        );
      const rateNum = activeRate.rate;

      // Validate and deduct stock for each item atomically
      const processedItems: any[] = [];
      for (const item of items) {
        const { productId, qty } = item;
        if (
          !productId ||
          !Number.isSafeInteger(qty) ||
          qty < 1 ||
          qty > 10000 ||
          !Number.isFinite(item.precioUSD) ||
          item.precioUSD < 0
        ) {
          return NextResponse.json(
            { success: false, error: `Ítem inválido: ${JSON.stringify(item)}` },
            { status: 400 },
          );
        }

        const product = await Product.findOne({ id: productId });
        if (!product) {
          return NextResponse.json(
            { success: false, error: `Producto no encontrado: ${productId}` },
            { status: 404 },
          );
        }
        if (product.isHidden)
          return NextResponse.json(
            { success: false, error: "Reactiva el producto antes de venderlo" },
            { status: 409 },
          );
        if (product.stock < qty) {
          return NextResponse.json(
            {
              success: false,
              error: `Stock insuficiente para ${product.marca} ${product.modelo}. Disponible: ${product.stock}, solicitado: ${qty}`,
            },
            { status: 409 },
          );
        }

        const stockBefore = product.stock;

        // 🚨 ACTUALIZACIÓN ATÓMICA ($inc) PARA EVITAR RACE CONDITIONS 🚨
        const updatedProduct = await Product.findOneAndUpdate(
          { id: productId, stock: { $gte: qty } },
          {
            $inc: { stock: -qty },
          },
          { returnDocument: "after" },
        );

        if (!updatedProduct) {
          return NextResponse.json(
            {
              success: false,
              error: `Error de concurrencia: El stock de ${product.marca} ${product.modelo} cambió mientras se procesaba la orden.`,
            },
            { status: 409 },
          );
        }

        // Record stock movement
        await StockHistory.create({
          productId: product.id,
          productName: `${product.marca} ${product.modelo} (${product.calidad})`,
          type: "salida",
          qty,
          stockBefore,
          stockAfter: updatedProduct.stock,
          reason: `Venta POS`,
        });

        const subtotalUSD = parseFloat((item.precioUSD * qty).toFixed(2));
        processedItems.push({
          productId,
          marca: product.marca,
          modelo: product.modelo,
          calidad: product.calidad,
          categoria: productCategory(product.categoria),
          qty,
          returnedQty: 0,
          precioUSD: item.precioUSD,
          subtotalUSD,
        });
      }

      // Calculate totals
      const totalItemsCount = processedItems.reduce((acc, i) => acc + i.qty, 0);
      const subtotalUSD = parseFloat(
        processedItems.reduce((acc, i) => acc + i.subtotalUSD, 0).toFixed(2),
      );
      const totalUSD = subtotalUSD;

      const totalCUP = roundCupPrice(totalUSD, rateNum);

      // Generate unique order number (retry up to 5 times on collision)
      let orderNumber = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        orderNumber = generateOrderNumber(totalItemsCount);
        const exists = await Sale.findOne({ orderNumber });
        if (!exists) break;
      }

      const sale = await Sale.create({
        ...(requestId ? { requestId, requestHash } : {}),
        orderNumber,
        clientName: clientName || "Consumidor Final",
        items: processedItems,
        currency: currency || "USD",
        exchangeRate: rateNum,
        subtotalUSD,
        totalUSD,
        totalCUP,
        paid: paid !== undefined ? paid : true,
        notes: notes || "",
        status: "COMPLETED",
        totalRefundedUSD: 0,
        totalRefundedCUP: 0,
        refunds: [],
      });

      return NextResponse.json({ success: true, sale });
    }

    // --------------------------------------------------------
    // ACTION: REFUND / RETURN ITEM(S)
    // --------------------------------------------------------
    if (action === "refund") {
      const { saleId, returns, reason } = body;

      if (
        typeof saleId !== "string" ||
        !/^[a-f0-9]{24}$/i.test(saleId) ||
        !Array.isArray(returns) ||
        returns.length === 0 ||
        returns.length > 100
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "saleId y lista de devoluciones son requeridos",
          },
          { status: 400 },
        );
      }
      if (
        typeof reason !== "string" ||
        !reason.trim() ||
        reason.length > 1000
      ) {
        return NextResponse.json(
          { success: false, error: "Debes indicar el motivo de la devolución" },
          { status: 400 },
        );
      }

      const sale = await Sale.findById(saleId);
      if (!sale) {
        return NextResponse.json(
          { success: false, error: "Venta no encontrada" },
          { status: 404 },
        );
      }

      const previousRefunds = requestId
        ? sale.refunds.filter((row) => row.requestId === requestId)
        : [];
      if (previousRefunds.length) {
        if (previousRefunds.some((row) => row.requestHash !== requestHash))
          return NextResponse.json(
            {
              success: false,
              error: "El identificador ya corresponde a otra devolución",
            },
            { status: 409 },
          );
        return NextResponse.json({
          success: true,
          replayed: true,
          message:
            "Esta devolución ya estaba registrada; se recuperó sin duplicar movimientos.",
          sale,
          refundLogs: previousRefunds,
          totalRefundUSD: Number(
            previousRefunds.reduce((n, row) => n + row.refundUSD, 0).toFixed(2),
          ),
          totalRefundCUP: Number(
            previousRefunds.reduce((n, row) => n + row.refundCUP, 0).toFixed(2),
          ),
        });
      }
      if (["CANCELLED", "REFUNDED"].includes(sale.status))
        return NextResponse.json(
          { success: false, error: "La orden ya está anulada o devuelta" },
          { status: 409 },
        );
      const returnIds = new Set<string>();
      for (const ret of returns) {
        if (
          !ret ||
          typeof ret.productId !== "string" ||
          !ret.productId.trim() ||
          returnIds.has(ret.productId) ||
          !Number.isSafeInteger(ret.qty) ||
          ret.qty < 1 ||
          ret.qty > 10000 ||
          (ret.destination !== undefined &&
            !["stock", "merma"].includes(ret.destination))
        )
          return NextResponse.json(
            {
              success: false,
              error: "Cantidad, producto o destino de devolución inválido",
            },
            { status: 400 },
          );
        returnIds.add(ret.productId);
      }
      let totalBatchRefundUSD = 0;
      let totalBatchRefundCUP = 0;
      const refundLogs: any[] = [];

      for (const ret of returns) {
        const { productId, qty } = ret;
        const qtyNum = Number(qty);
        if (
          !productId ||
          !Number.isSafeInteger(qtyNum) ||
          qtyNum < 1 ||
          qtyNum > 10000
        )
          return NextResponse.json(
            { success: false, error: "Cantidad inválida para devolución" },
            { status: 400 },
          );

        const item = sale.items.find((i) => i.productId === productId);
        if (!item) {
          return NextResponse.json(
            {
              success: false,
              error: `El producto con ID ${productId} no está en esta orden`,
            },
            { status: 400 },
          );
        }

        const currentlyReturned = item.returnedQty || 0;
        const availableToReturn = item.qty - currentlyReturned;

        if (qtyNum > availableToReturn) {
          return NextResponse.json(
            {
              success: false,
              error: `No puedes devolver ${qtyNum} unidades de ${item.marca} ${item.modelo}. Máximo disponible para devolución: ${availableToReturn}`,
            },
            { status: 400 },
          );
        }

        const amounts = refundAmounts(sale, item, qtyNum, {
          usd: totalBatchRefundUSD,
          cup: totalBatchRefundCUP,
        });
        const itemRefundUSD = amounts.usd;
        const itemRefundCUP = amounts.cup;
        item.returnedQty = currentlyReturned + qtyNum;

        totalBatchRefundUSD += itemRefundUSD;
        totalBatchRefundCUP += itemRefundCUP;

        const product = await Product.findOne({ id: productId });
        const itemDestination: RefundDestination =
          ret.destination === "merma"
            ? "merma"
            : product
              ? "stock"
              : "retirado";

        const logEntry = {
          ...(requestId ? { requestId, requestHash } : {}),
          productId,
          marca: item.marca,
          modelo: item.modelo,
          calidad: item.calidad,
          categoria: productCategory(item.categoria),
          qty: qtyNum,
          refundUSD: itemRefundUSD,
          refundCUP: itemRefundCUP,
          reason: reason.trim(),
          destination: itemDestination,
          createdAt: new Date(),
        };

        sale.refunds.push(logEntry);
        refundLogs.push(logEntry);

        // Fetch product
        if (product) {
          const stockBefore = product.stock;

          if (itemDestination === "stock") {
            // Reincorporate good units into sellable stock atomically
            const updatedProduct = await Product.findOneAndUpdate(
              { id: productId },
              {
                $inc: { stock: qtyNum },
              },
              { returnDocument: "after" },
            );

            const stockAfter = updatedProduct
              ? updatedProduct.stock
              : stockBefore + qtyNum;

            // Record in StockHistory as 'entrada'
            await StockHistory.create({
              productId: product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type: "entrada",
              qty: qtyNum,
              stockBefore,
              stockAfter: stockAfter,
              reason: `Devolución Orden #${sale.orderNumber}: ${reason.trim()} [Reintegrado a Stock]`,
            });
          } else {
            // MERMA: Defective / Broken part. Do NOT increase sellable stock!
            await StockHistory.create({
              productId: product.id,
              productName: `${product.marca} ${product.modelo} (${product.calidad})`,
              type: "merma",
              qty: qtyNum,
              stockBefore,
              stockAfter: stockBefore,
              reason: `Devolución Orden #${sale.orderNumber}: ${reason.trim()} [MERMA / ROTO / DEFECTUOSO - No apto para venta]`,
            });
          }
        } else {
          await StockHistory.create({
            productId,
            productName: `[${productCategory(item.categoria)}] ${item.marca} ${item.modelo} (${item.calidad})`,
            type: itemDestination === "merma" ? "merma" : "retirado",
            qty: qtyNum,
            stockBefore: 0,
            stockAfter: 0,
            reason: `Devolución Orden #${sale.orderNumber}: ${reason.trim()} [Producto eliminado; no se recrea ni repone stock]`,
          });
        }
      }

      // Update sale refunded totals
      sale.totalRefundedUSD = parseFloat(
        ((sale.totalRefundedUSD || 0) + totalBatchRefundUSD).toFixed(2),
      );
      sale.totalRefundedCUP = parseFloat(
        ((sale.totalRefundedCUP || 0) + totalBatchRefundCUP).toFixed(2),
      );

      // Calculate status
      const totalPurchased = sale.items.reduce((acc, i) => acc + i.qty, 0);
      const totalReturned = sale.items.reduce(
        (acc, i) => acc + (i.returnedQty || 0),
        0,
      );

      if (totalReturned >= totalPurchased) {
        sale.status = "REFUNDED";
      } else if (totalReturned > 0) {
        sale.status = "PARTIALLY_REFUNDED";
      }

      await sale.save();

      return NextResponse.json({
        success: true,
        message: refundLogs.some((log) => log.destination === "retirado")
          ? "Devolución procesada. Las unidades de productos eliminados quedan fuera del inventario; no se recrearon productos ni se repuso su stock."
          : "Devolución procesada. Los movimientos se registraron según el destino indicado.",
        sale,
        refundLogs,
        totalRefundUSD: totalBatchRefundUSD,
        totalRefundCUP: totalBatchRefundCUP,
      });
    }

    // --------------------------------------------------------
    // ACTION: TOGGLE PAID
    // --------------------------------------------------------
    if (action === "toggle-paid") {
      const { saleId } = body;
      if (typeof saleId !== "string" || !/^[a-f0-9]{24}$/i.test(saleId)) {
        return NextResponse.json(
          { success: false, error: "saleId requerido" },
          { status: 400 },
        );
      }
      const sale = await Sale.findById(saleId);
      if (!sale) {
        return NextResponse.json(
          { success: false, error: "Venta no encontrada" },
          { status: 404 },
        );
      }
      if (["CANCELLED", "REFUNDED"].includes(sale.status))
        return NextResponse.json(
          { success: false, error: "La orden está anulada o devuelta" },
          { status: 409 },
        );
      sale.paid = !sale.paid;
      await sale.save();
      return NextResponse.json({ success: true, sale });
    }

    return NextResponse.json(
      { success: false, error: "Acción no válida" },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof SyntaxError)
      return NextResponse.json(
        { success: false, error: "JSON inválido" },
        { status: 400 },
      );
    console.error("[sales POST]", err);
    return NextResponse.json(
      { success: false, error: "Error procesando solicitud de venta" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return (handleGET as any)(req, context);
}

export async function POST(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return atomicResponse(() => (handlePOST as any)(req.clone(), context));
}
