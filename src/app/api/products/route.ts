import { atomicResponse } from "@/lib/security/atomic-response";
import { requireAdmin } from "@/lib/security/admin";
import { NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongoose";
import { Product } from "@/lib/models/Product";
import { StockHistory } from "@/lib/models/StockHistory";
import { Sale } from "@/lib/models/Sale";
import seedProducts from "@/data/products_seed.json";
import {
  productCategory,
  categoryFilter,
  assertProductNumbers,
} from "@/lib/categories";
import { importCatalog } from "@/lib/catalogImport";

export const dynamic = "force-dynamic"; // Evita que Next.js guarde la respuesta en caché

// Make sure we connect to the DB
async function handleGET(request: Request) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const includeEmpty = searchParams.get("all") === "true";

    // Por defecto solo repuestos activos con stock > 0 (para catálogo comercial y /admin)
    // Los agotados viven en /admin/pos/inventario
    const baseFilter = includeEmpty
      ? { isHidden: false }
      : { isHidden: false, stock: { $gt: 0 } };
    let queryFilter: any = baseFilter;
    if (searchParams.has("categoria")) {
      try {
        queryFilter = {
          $and: [
            baseFilter,
            categoryFilter(productCategory(searchParams.get("categoria"))),
          ],
        };
      } catch {
        return NextResponse.json(
          { success: false, error: "Categoría inválida" },
          { status: 400 },
        );
      }
    }

    // Fetch active products
    const [activeProducts, deletedCount, topSales] = await Promise.all([
      Product.find(queryFilter).sort({ createdAt: -1 }).lean(),
      Product.countDocuments({ isHidden: true, stock: { $gt: 0 } }),
      Sale.aggregate([
        { $match: { status: { $ne: "CANCELLED" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productId",
            totalSold: { $sum: "$items.qty" },
          },
        },
        { $sort: { totalSold: -1 } },
        { $limit: 15 },
      ]).catch(() => []),
    ]);

    const topSoldMap = new Map<string, number>();
    if (Array.isArray(topSales)) {
      for (const item of topSales) {
        if (item._id && item.totalSold > 0) {
          topSoldMap.set(String(item._id), item.totalSold);
        }
      }
    }

    const enrichedProducts = activeProducts.map((p) => ({
      ...p,
      categoria: productCategory(p.categoria),
      salesCount: topSoldMap.get(p.id) || 0,
      isTopSeller: topSoldMap.has(p.id),
    }));

    return NextResponse.json({
      success: true,
      count: enrichedProducts.length,
      deletedCount,
      products: enrichedProducts,
    });
  } catch (error) {
    console.error("API GET Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error obteniendo productos de la base de datos",
      },
      { status: 500 },
    );
  }
}

async function handlePOST(request: Request) {
  try {
    await connectToDatabase();

    const body = await request.json();
    const { action, id, product, initialList } = body;
    try {
      if (action === "add" && product) {
        product.categoria = productCategory(product.categoria);
        assertProductNumbers(product.precio ?? 0, product.stock ?? 1);
        if (!String(product.modelo || "").trim())
          throw new Error("Modelo obligatorio");
      }
      if (["update", "unhide"].includes(action)) {
        assertProductNumbers(body.precio ?? 0, body.stock ?? 0);
        if (body.categoria !== undefined)
          body.categoria = productCategory(body.categoria);
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Datos inválidos",
        },
        { status: 400 },
      );
    }

    // -----------------------------------------
    // ACTION: DELETE (SOFT DELETE)
    // -----------------------------------------
    if (action === "delete" && id) {
      await Product.findOneAndUpdate({ id }, { isHidden: true });

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();
      const deletedCount = await Product.countDocuments({
        isHidden: true,
        stock: { $gt: 0 },
      });

      return NextResponse.json({
        success: true,
        message: "Producto ocultado en la base de datos globalmente",
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: UNHIDE (Restore a hidden product)
    // -----------------------------------------
    if (action === "unhide" && id) {
      const updateData: Record<string, any> = { isHidden: false };
      if (body.stock !== undefined && !isNaN(Number(body.stock))) {
        updateData.stock = Math.max(0, Number(body.stock));
      }

      const previous = await Product.findOne({ id });
      if (!previous)
        return NextResponse.json(
          { success: false, error: "Producto no encontrado" },
          { status: 404 },
        );
      await Product.findOneAndUpdate({ id }, { $set: updateData });
      if (updateData.stock !== undefined && updateData.stock !== previous.stock)
        await StockHistory.create({
          productId: id,
          productName: `[${productCategory(previous.categoria)}] ${previous.marca} ${previous.modelo} ${previous.calidad}`,
          type: updateData.stock > previous.stock ? "entrada" : "salida",
          qty: Math.abs(updateData.stock - previous.stock),
          stockBefore: previous.stock,
          stockAfter: updateData.stock,
          reason: "Ajuste al recuperar producto oculto",
        });

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();
      const deletedCount = await Product.countDocuments({
        isHidden: true,
        stock: { $gt: 0 },
      });

      return NextResponse.json({
        success: true,
        message: "Producto restaurado al catálogo activo",
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: DELETE-PERMANENT (Hard delete)
    // -----------------------------------------
    if (action === "delete-permanent" && id) {
      if (body.confirmPermanent !== true)
        return NextResponse.json(
          {
            success: false,
            error:
              "Confirma la eliminación definitiva del producto antes de continuar.",
          },
          { status: 409 },
        );
      if (typeof id !== "string")
        return NextResponse.json(
          { success: false, error: "ID de producto inválido" },
          { status: 400 },
        );
      const removed = await Product.findOneAndDelete({ id });
      if (!removed)
        return NextResponse.json(
          { success: false, error: "Producto no encontrado" },
          { status: 404 },
        );
      if (removed.stock > 0)
        await StockHistory.create({
          productId: removed.id,
          productName: `[${productCategory(removed.categoria)}] ${removed.marca} ${removed.modelo} (${removed.calidad})`,
          type: "salida",
          qty: removed.stock,
          stockBefore: removed.stock,
          stockAfter: 0,
          reason:
            "Eliminación definitiva del producto confirmada desde inventario. Ventas y movimientos anteriores conservados.",
        });

      const deletedCount = await Product.countDocuments({
        isHidden: true,
        stock: { $gt: 0 },
      });

      return NextResponse.json({
        success: true,
        message:
          "Producto eliminado del catálogo y del inventario. Su historial se conserva.",
        retainedHistory: true,
        deletedCount,
      });
    }

    // -----------------------------------------
    // ACTION: RESTORE (Reset to Seed)
    // -----------------------------------------
    if (action === "restore") {
      if ((await Sale.exists({})) || (await StockHistory.exists({})))
        return NextResponse.json(
          {
            success: false,
            error:
              "No se puede reiniciar un catálogo con movimientos o ventas. Usa la importación para actualizarlo.",
          },
          { status: 409 },
        );
      // Clear entire collection
      await Product.deleteMany({});

      // Insert Seed Data enforcing uppercase
      const newProducts = seedProducts.map((p: any) => ({
        ...p,
        marca: (p.marca || "VARIOS").toUpperCase().trim(),
        modelo: (p.modelo || "").toUpperCase().trim(),
        calidad: (p.calidad || "ORIGINAL").toUpperCase().trim(),
        isHidden: false,
      }));
      await Product.insertMany(newProducts);

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();

      return NextResponse.json({
        success: true,
        message:
          "Catálogo restaurado al estado original en la base de datos (con marcas y modelos en mayúsculas)",
        count: activeProducts.length,
        deletedCount: 0,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: ADD (with smart duplicate stock sum & auto-unhide)
    // -----------------------------------------
    if (action === "add" && product) {
      const marcaUp = (product.marca || "VARIOS").toUpperCase().trim();
      const modeloUp = (product.modelo || "NUEVO MODELO").toUpperCase().trim();
      const calidadUp = (product.calidad || "ORIGINAL").toUpperCase().trim();
      const newStock = product.stock ?? 1;
      const newPrecio = Math.max(0, Number(product.precio) || 0);

      // Check if product already exists (including hidden or stock 0 ones)
      const existingProduct = await Product.findOne({
        ...categoryFilter(product.categoria),
        marca: marcaUp,
        modelo: {
          $regex: new RegExp(
            `^${modeloUp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
        calidad: calidadUp,
      });

      let savedProduct;
      let wasUpdated = false;

      if (existingProduct) {
        wasUpdated = true;
        const stockBefore = existingProduct.stock || 0;
        const stockAfter = stockBefore + newStock;

        existingProduct.stock = stockAfter;
        if (newPrecio > 0) {
          existingProduct.precio = newPrecio;
        }

        savedProduct = await existingProduct.save();

        if (newStock > 0) {
          await StockHistory.create({
            productId: existingProduct.id,
            productName: `${existingProduct.marca} ${existingProduct.modelo} (${existingProduct.calidad})`,
            type: "entrada",
            qty: newStock,
            stockBefore,
            stockAfter,
            reason:
              "Reingreso de producto existente (Suma automática de stock)",
          });
        }
      } else {
        const customId = `display-custom-${Date.now()}`;
        savedProduct = await Product.create({
          categoria: product.categoria,
          id: customId,
          marca: marcaUp,
          modelo: modeloUp,
          calidad: calidadUp,
          precio: newPrecio,
          stock: newStock,
          isHidden: false,
        });

        if (newStock > 0) {
          await StockHistory.create({
            productId: customId,
            productName: `${marcaUp} ${modeloUp} (${calidadUp})`,
            type: "entrada",
            qty: newStock,
            stockBefore: 0,
            stockAfter: newStock,
            reason: "Alta de nuevo producto en catálogo",
          });
        }
      }

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();
      const deletedCount = await Product.countDocuments({
        isHidden: true,
        stock: { $gt: 0 },
      });

      return NextResponse.json({
        success: true,
        message: wasUpdated
          ? `Producto existente reconocido: se sumaron +${newStock} uds al stock (Total: ${savedProduct.stock} uds) conservando su visibilidad actual.`
          : "Nuevo producto agregado globalmente a la base de datos",
        product: savedProduct,
        wasUpdated,
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: UPDATE (Edit existing display)
    // -----------------------------------------
    if (action === "update" && id) {
      const updateData: Record<string, any> = {};
      if (body.precio !== undefined)
        updateData.precio = Math.max(0, Number(body.precio));
      if (body.stock !== undefined) {
        const s = Math.max(0, Number(body.stock));
        updateData.stock = s;
      }
      if (body.calidad)
        updateData.calidad = String(body.calidad).toUpperCase().trim();
      if (body.modelo)
        updateData.modelo = String(body.modelo).toUpperCase().trim();
      if (body.marca)
        updateData.marca = String(body.marca).toUpperCase().trim();
      if (body.categoria !== undefined) updateData.categoria = body.categoria;

      const previous = await Product.findOne({ id });
      if (!previous)
        return NextResponse.json(
          { success: false, error: "Producto no encontrado" },
          { status: 404 },
        );
      const identity = {
        marca: updateData.marca ?? previous.marca,
        modelo: updateData.modelo ?? previous.modelo,
        calidad: updateData.calidad ?? previous.calidad,
      };
      const collision = await Product.exists({
        id: { $ne: id },
        ...identity,
        ...categoryFilter(
          productCategory(updateData.categoria ?? previous.categoria),
        ),
      });
      if (collision)
        return NextResponse.json(
          {
            success: false,
            error: "Ya existe ese modelo y calidad en la categoría elegida",
          },
          { status: 409 },
        );

      const updatedDoc = await Product.findOneAndUpdate(
        { id },
        { $set: updateData },
        { returnDocument: "after", runValidators: true },
      );

      if (!updatedDoc) {
        return NextResponse.json(
          { success: false, error: "Producto no encontrado para actualizar" },
          { status: 404 },
        );
      }

      if (updateData.stock !== undefined && updateData.stock !== previous.stock)
        await StockHistory.create({
          productId: id,
          productName: `[${productCategory(updatedDoc.categoria)}] ${updatedDoc.marca} ${updatedDoc.modelo} ${updatedDoc.calidad}`,
          type: updateData.stock > previous.stock ? "entrada" : "salida",
          qty: Math.abs(updateData.stock - previous.stock),
          stockBefore: previous.stock,
          stockAfter: updateData.stock,
          reason: "Ajuste desde edición de producto",
        });

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();
      const deletedCount = await Product.countDocuments({
        isHidden: true,
        stock: { $gt: 0 },
      });

      return NextResponse.json({
        success: true,
        message: `Producto ${updatedDoc.modelo} actualizado correctamente en la base de datos`,
        product: updatedDoc,
        count: activeProducts.length,
        deletedCount,
        products: activeProducts,
      });
    }

    // -----------------------------------------
    // ACTION: SYNC (Upload new Excel)
    // -----------------------------------------
    if (action === "sync" && Array.isArray(initialList)) {
      try {
        await importCatalog(initialList);
      } catch (error) {
        return NextResponse.json(
          {
            success: false,
            error: error instanceof Error ? error.message : "Archivo inválido",
          },
          { status: 400 },
        );
      }

      const activeProducts = await Product.find({ isHidden: false })
        .sort({ createdAt: -1 })
        .lean();

      return NextResponse.json({
        success: true,
        message: "Catálogo sincronizado exitosamente con el Excel en la BD",
        count: activeProducts.length,
        deletedCount: await Product.countDocuments({ isHidden: true }),
        products: activeProducts,
      });
    }

    return NextResponse.json(
      { success: false, error: "Acción no válida" },
      { status: 400 },
    );
  } catch (error) {
    console.error("API POST Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error procesando solicitud en la base de datos",
      },
      { status: 500 },
    );
  }
}

async function handleDELETE(request: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "ID de producto requerido" },
        { status: 400 },
      );
    }

    await Product.findOneAndUpdate({ id }, { isHidden: true });

    const activeProducts = await Product.find({ isHidden: false })
      .sort({ createdAt: -1 })
      .lean();
    const deletedCount = await Product.countDocuments({
      isHidden: true,
      stock: { $gt: 0 },
    });

    return NextResponse.json({
      success: true,
      message: `Producto ${id} ocultado`,
      count: activeProducts.length,
      deletedCount,
      products: activeProducts,
    });
  } catch (error) {
    console.error("API DELETE Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error procesando eliminación en la base de datos",
      },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, context: any) {
  if (new URL(req.url).searchParams.has("all")) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  return (handleGET as any)(req, context);
}

export async function POST(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return atomicResponse(() => (handlePOST as any)(req.clone(), context));
}

export async function DELETE(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return atomicResponse(() => (handleDELETE as any)(req.clone(), context));
}
