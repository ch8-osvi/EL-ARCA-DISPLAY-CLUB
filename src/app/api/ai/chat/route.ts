import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaDateKey, getHavanaDaysAgoKey } from '@/lib/dateUtils';
import {
  getCatalogoForContext,
  getDeudores,
  getVentasHoy,
  executeAgregarProducto,
  executeAgregarProductosLote,
  executeActualizarCalidadProducto,
  executeOcultarProducto,
  executeCrearOrdenMulti,
} from '@/lib/ai/adminTools';
import {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from '@/lib/whatsapp/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// ─── Action Tag Parser ────────────────────────────────────────────────────────

const ACTION_REGEX = /\[ACCION:([A-Z_]+):([\s\S]*?)\]/g;

async function executeActions(
  response: string
): Promise<{ cleanedResponse: string; actionResults: string[] }> {
  const actionResults: string[] = [];
  let cleanedResponse = response;

  const matches = [...response.matchAll(ACTION_REGEX)];

  for (const match of matches) {
    const actionType = match[1];
    let payload: Record<string, unknown> = {};

    try {
      payload = JSON.parse(match[2]);
    } catch {
      actionResults.push(`⚠️ No pude parsear la acción ${actionType}.`);
      cleanedResponse = cleanedResponse.replace(match[0], '');
      continue;
    }

    let result: { success: boolean; message: string } | null = null;

    switch (actionType) {
      case 'CREAR_ORDEN': {
        result = await executeCrearOrdenMulti({
          clientName: String(payload.clientName ?? 'Consumidor Final'),
          items: Array.isArray(payload.items) ? payload.items : [],
          currency: payload.currency === 'CUP' ? 'CUP' : 'USD',
          paid: payload.paid !== false,
          notes: payload.notes ? String(payload.notes) : undefined,
        });
        break;
      }
      case 'VENTA_RAPIDA': {
        result = await executeRegistrarVentaRapida({
          cliente: String(payload.cliente ?? 'Consumidor Final'),
          modeloProducto: String(payload.modeloProducto ?? ''),
          cantidad: Number(payload.cantidad ?? 1),
          moneda: payload.moneda === 'CUP' ? 'CUP' : 'USD',
          pagado: payload.pagado !== false,
        });
        break;
      }
      case 'ACTUALIZAR_PRECIO': {
        result = await executeActualizarPrecioProducto(
          String(payload.queryProducto ?? ''),
          Number(payload.nuevoPrecioUSD ?? 0)
        );
        break;
      }
      case 'ACTUALIZAR_CALIDAD': {
        result = await executeActualizarCalidadProducto(
          String(payload.queryProducto ?? ''),
          String(payload.nuevaCalidad ?? '')
        );
        break;
      }
      case 'AJUSTAR_STOCK': {
        result = await executeAjustarStockProducto(
          String(payload.queryProducto ?? ''),
          Number(payload.cantidadAgregada ?? 0),
          payload.motivo ? String(payload.motivo) : undefined
        );
        break;
      }
      case 'MARCAR_PAGADA': {
        result = await executeMarcarOrdenPagada(String(payload.orderNumber ?? ''));
        break;
      }
      case 'MARCAR_PENDIENTE': {
        result = await executeMarcarOrdenPendiente(String(payload.orderNumber ?? ''));
        break;
      }
      case 'AGREGAR_PRODUCTO': {
        result = await executeAgregarProducto({
          marca: String(payload.marca ?? ''),
          modelo: String(payload.modelo ?? ''),
          calidad: String(payload.calidad ?? 'ORIGINAL C/M'),
          precio: Number(payload.precio ?? 0),
          stock: payload.stock ? Number(payload.stock) : undefined,
        });
        break;
      }
      case 'AGREGAR_LOTE': {
        const lote = Array.isArray(payload.productos) ? payload.productos : [];
        result = await executeAgregarProductosLote(
          lote.map((p: Record<string, unknown>) => ({
            marca: String(p.marca ?? ''),
            modelo: String(p.modelo ?? ''),
            calidad: String(p.calidad ?? 'ORIGINAL C/M'),
            precio: Number(p.precio ?? 0),
            stock: p.stock ? Number(p.stock) : undefined,
          }))
        );
        break;
      }
      case 'OCULTAR_PRODUCTO': {
        result = await executeOcultarProducto(String(payload.queryProducto ?? ''));
        break;
      }
      default:
        actionResults.push(`⚠️ Acción desconocida: ${actionType}`);
    }

    if (result) {
      actionResults.push(result.message);
    }

    // Remove the action tag from the response text
    cleanedResponse = cleanedResponse.replace(match[0], '');
  }

  return {
    cleanedResponse: cleanedResponse.trim(),
    actionResults,
  };
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/ai/chat
 * Asistente IA omnipotente para El Arca Display Club.
 * - Analíticas en tiempo real (ventas, deudores, stock, mermas)
 * - Mutaciones: crear órdenes, actualizar precios, agregar productos, etc.
 * - Soporte para historial de conversación multi-turno
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { prompt, history = [] } = body as {
      prompt: string;
      history?: ChatHistoryEntry[];
    };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: 'La pregunta no puede estar vacía' },
        { status: 400 }
      );
    }

    const cleanPrompt = prompt.trim();

    // ── 1. Fetch live data ────────────────────────────────────────────────────

    const [sales, products, mermasHistory] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Product.find({ isHidden: false }).lean(),
      StockHistory.find({ type: 'merma' }).sort({ createdAt: -1 }).lean(),
    ]);

    // ── 2. Compute date boundaries (Cuba timezone) ────────────────────────────

    const now = new Date();
    const havanaTodayKey = getHavanaDateKey(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const havanaYesterdayKey = getHavanaDateKey(yesterdayDate);
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const [curYear, curMonth] = havanaTodayKey.split('-');

    // ── 3. Segment sales ──────────────────────────────────────────────────────

    const todaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaTodayKey);
    const yesterdaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaYesterdayKey);
    const weekSales = sales.filter((s) => new Date(s.createdAt).getTime() >= weekStart);
    const monthSales = sales.filter((s) => {
      const [sYear, sMonth] = getHavanaDateKey(s.createdAt).split('-');
      return sYear === curYear && sMonth === curMonth;
    });

    const calcTotals = (saleList: typeof sales) => {
      let usd = 0, cup = 0, paidUSD = 0, paidCUP = 0, pendingUSD = 0, itemsCount = 0;
      saleList.forEach((s) => {
        if (s.currency === 'CUP') {
          cup += s.totalCUP || 0;
          if (s.paid) paidCUP += s.totalCUP || 0;
        } else {
          usd += s.totalUSD || 0;
          if (s.paid) paidUSD += s.totalUSD || 0;
          else pendingUSD += s.totalUSD || 0;
        }
        (s.items || []).forEach((i: { qty?: number }) => { itemsCount += i.qty || 0; });
      });
      return { usd, cup, paidUSD, paidCUP, pendingUSD, count: saleList.length, itemsCount };
    };

    const todayTot = calcTotals(todaySales);
    const yesterdayTot = calcTotals(yesterdaySales);
    const weekTot = calcTotals(weekSales);
    const monthTot = calcTotals(monthSales);
    const allTot = calcTotals(sales);

    // ── 4. Pending / Debtors ──────────────────────────────────────────────────

    const unpaidSales = sales.filter((s) => !s.paid);
    const debtorsSummary = unpaidSales.map((s) => ({
      orderNumber: s.orderNumber,
      client: s.clientName || 'Consumidor Final',
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      currency: s.currency,
      date: new Date(s.createdAt).toLocaleDateString('es-ES'),
      notes: s.notes || '',
    }));

    // ── 5. Product rankings ───────────────────────────────────────────────────

    const modelSalesMap: Record<string, { modelo: string; marca: string; units: number; revenueUSD: number }> = {};
    sales.forEach((s) => {
      (s.items || []).forEach((item: { marca?: string; modelo?: string; qty?: number; precioUSD?: number }) => {
        const key = `${item.marca || 'VARIOS'} - ${item.modelo || 'Desconocido'}`;
        if (!modelSalesMap[key]) {
          modelSalesMap[key] = { modelo: item.modelo || 'Desconocido', marca: item.marca || 'VARIOS', units: 0, revenueUSD: 0 };
        }
        modelSalesMap[key].units += item.qty || 0;
        modelSalesMap[key].revenueUSD += (item.precioUSD || 0) * (item.qty || 0);
      });
    });
    const topModels = Object.values(modelSalesMap).sort((a, b) => b.units - a.units);

    // ── 6. Daily breakdown (last 14 days) ────────────────────────────────────

    const last14DaysSummary = [];
    for (let i = 0; i < 14; i++) {
      const dateKey = getHavanaDaysAgoKey(i);
      const daySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === dateKey);
      const totals = calcTotals(daySales);
      let label = `Hace ${i} días`;
      if (i === 0) label = 'Hoy';
      else if (i === 1) label = 'Ayer';
      else if (i === 2) label = 'Hace 2 días';
      else if (i === 3) label = 'Hace 3 días';
      last14DaysSummary.push({ fecha: dateKey, etiqueta: label, ventasUSD: totals.usd, ventasCUP: totals.cup, ordenes: totals.count, repuestosVendidos: totals.itemsCount });
    }

    // ── 7. Recent sales details (last 25) ────────────────────────────────────

    const recentSalesDetails = sales.slice(0, 25).map((s) => ({
      orden: s.orderNumber,
      fecha: getHavanaDateKey(s.createdAt),
      cliente: s.clientName || 'Consumidor Final',
      articulos: (s.items || []).map((i: { qty?: number; marca?: string; modelo?: string; calidad?: string }) =>
        `${i.qty}x ${i.marca} ${i.modelo} (${i.calidad})`
      ).join(', '),
      moneda: s.currency,
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      cobrado: s.paid ? 'SÍ' : 'PENDIENTE',
    }));

    // ── 8. Best sales day ─────────────────────────────────────────────────────

    const daySalesMap: Record<string, { date: string; usd: number; cup: number; count: number }> = {};
    sales.forEach((s) => {
      const dateKey = getHavanaDateKey(s.createdAt);
      if (!daySalesMap[dateKey]) daySalesMap[dateKey] = { date: dateKey, usd: 0, cup: 0, count: 0 };
      daySalesMap[dateKey].count += 1;
      if (s.currency === 'CUP') daySalesMap[dateKey].cup += s.totalCUP || 0;
      else daySalesMap[dateKey].usd += s.totalUSD || 0;
    });
    const bestDay = Object.values(daySalesMap).sort((a, b) => b.usd - a.usd)[0] || null;

    // ── 9. Inventory status ───────────────────────────────────────────────────

    const lowStockProducts = products.filter((p) => p.stock <= 2 && p.stock > 0);
    const outOfStockProducts = products.filter((p) => p.stock === 0);
    const totalInventoryValue = products.reduce((acc, p) => acc + p.precio * (p.stock || 0), 0);

    // ── 10. Mermas breakdown ──────────────────────────────────────────────────

    const totalMermaUnits = (mermasHistory || []).reduce((acc: number, m) => acc + (m.qty || 0), 0);
    const mermasByProductMap: Record<string, { producto: string; units: number; reasons: string[]; lastDate: string }> = {};
    (mermasHistory || []).forEach((m) => {
      const name = m.productName || 'Desconocido';
      if (!mermasByProductMap[name]) mermasByProductMap[name] = { producto: name, units: 0, reasons: [], lastDate: m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-ES') : '' };
      mermasByProductMap[name].units += m.qty || 0;
      if (m.reason) {
        const cleanReason = m.reason.replace(' [MERMA / ROTO / DEFECTUOSO - No apto para venta]', '').replace(/Devolución Orden #[^:]+:\s*/i, '').trim();
        if (cleanReason && !mermasByProductMap[name].reasons.includes(cleanReason)) mermasByProductMap[name].reasons.push(cleanReason);
      }
    });
    const topMermas = Object.values(mermasByProductMap).sort((a, b) => b.units - a.units);

    // ── 11. Load product catalog for action context ───────────────────────────

    const catalogContext = await getCatalogoForContext();

    // ── 12. Build context payload ─────────────────────────────────────────────

    const contextPayload = {
      negocio: 'EL ARCA DISPLAY CLUB (Venta y distribución de pantallas de celulares)',
      monedas: 'USD (Dólares en efectivo) y CUP (Pesos cubanos)',
      hoy: { fecha: havanaTodayKey, ventasUSD: todayTot.usd, ventasCUP: todayTot.cup, ordenes: todayTot.count, repuestosVendidos: todayTot.itemsCount, pendienteUSD: todayTot.pendingUSD },
      ayer: { fecha: havanaYesterdayKey, ventasUSD: yesterdayTot.usd, ventasCUP: yesterdayTot.cup, ordenes: yesterdayTot.count, repuestosVendidos: yesterdayTot.itemsCount },
      desgloseDiarioUltimos14Dias: last14DaysSummary,
      ultimasVentasRegistradas: recentSalesDetails,
      ultimos7DiasAcumulado: { ventasUSD: weekTot.usd, ventasCUP: weekTot.cup, ordenes: weekTot.count },
      esteMesAcumulado: { ventasUSD: monthTot.usd, ventasCUP: monthTot.cup, ordenes: monthTot.count },
      historicoTotal: { ventasUSD: allTot.usd, ventasCUP: allTot.cup, ordenesTotales: allTot.count },
      diaRecordHistorico: bestDay ? `Día ${bestDay.date} con $${bestDay.usd.toFixed(2)} USD y ${bestDay.count} órdenes` : 'Sin datos suficientes',
      ordenesPendientesCobro: debtorsSummary,
      top3ModelosMasVendidos: topModels.slice(0, 5),
      inventario: { totalModelosActivos: products.length, valorTotalInventarioUSD: totalInventoryValue.toFixed(2), modelosAgotados: outOfStockProducts.length, modelosBajoStock: lowStockProducts.length },
      mermasYGarantias: {
        totalBajasMermasUds: totalMermaUnits,
        rankingModelosConProblemas: topMermas.map((m) => ({ modelo: m.producto, unidadesEnMerma: m.units, motivosRegistrados: m.reasons, fechaUltimaBaja: m.lastDate })),
        ultimosRegistrosDetallados: (mermasHistory || []).slice(0, 15).map((m) => ({ producto: m.productName, cantidad: m.qty, motivo: m.reason, fecha: m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-ES') : '' })),
      },
    };

    // ── 13. Build system instruction ──────────────────────────────────────────

    const systemInstruction = `Eres el Asistente de Gestión IA Omnipotente de "EL ARCA DISPLAY CLUB" (tienda líder de pantallas y repuestos de teléfonos celulares en Cuba).
Eres el socio de confianza del administrador Osvaldo. Puedes CONSULTAR y MODIFICAR la base de datos en tiempo real.

═══════════════════════════════════════════════════════════════
🔥 CAPACIDADES DE GESTIÓN (MUTACIONES EN BASE DE DATOS)
═══════════════════════════════════════════════════════════════

Cuando el usuario solicite una acción de gestión, debes incluir en tu respuesta UNA o VARIAS etiquetas de acción con este formato exacto:

[ACCION:TIPO:{"campo":"valor"}]

ACCIONES DISPONIBLES:

1. CREAR_ORDEN — Para ventas multi-producto:
[ACCION:CREAR_ORDEN:{"clientName":"Nombre","items":[{"productQuery":"samsung a04","qty":2,"precioOverride":null}],"currency":"USD","paid":true,"notes":"Opcional"}]

2. VENTA_RAPIDA — Para venta de UN producto:
[ACCION:VENTA_RAPIDA:{"cliente":"Taller Mario","modeloProducto":"Redmi 9A","cantidad":1,"moneda":"USD","pagado":true}]

3. ACTUALIZAR_PRECIO — Cambiar precio de un producto:
[ACCION:ACTUALIZAR_PRECIO:{"queryProducto":"Samsung A04","nuevoPrecioUSD":15.50}]

4. ACTUALIZAR_CALIDAD — Cambiar calidad de un producto:
[ACCION:ACTUALIZAR_CALIDAD:{"queryProducto":"Redmi 9A","nuevaCalidad":"COMPATIBLE"}]

5. AJUSTAR_STOCK — Sumar o restar stock:
[ACCION:AJUSTAR_STOCK:{"queryProducto":"iPhone 11","cantidadAgregada":5,"motivo":"Compra proveedor"}]
(usa número negativo para restar: "cantidadAgregada":-2)

6. MARCAR_PAGADA — Marcar orden como pagada:
[ACCION:MARCAR_PAGADA:{"orderNumber":"0920ABC01"}]

7. MARCAR_PENDIENTE — Marcar orden como pendiente:
[ACCION:MARCAR_PENDIENTE:{"orderNumber":"0920ABC01"}]

8. AGREGAR_PRODUCTO — Agregar un producto al catálogo:
[ACCION:AGREGAR_PRODUCTO:{"marca":"SAMSUNG","modelo":"Galaxy A14","calidad":"ORIGINAL C/M","precio":25.00,"stock":3}]

9. AGREGAR_LOTE — Agregar múltiples productos:
[ACCION:AGREGAR_LOTE:{"productos":[{"marca":"SAMSUNG","modelo":"A04","calidad":"ORIGINAL C/M","precio":13.00,"stock":5},{"marca":"XIAOMI","modelo":"Redmi 9C","calidad":"COMPATIBLE","precio":8.00,"stock":3}]}]

10. OCULTAR_PRODUCTO — Ocultar del catálogo público:
[ACCION:OCULTAR_PRODUCTO:{"queryProducto":"Redmi Note 7"}]

═══════════════════════════════════════════════════════════════
📋 CATÁLOGO ACTUAL (para búsquedas inteligentes de productos)
═══════════════════════════════════════════════════════════════
${catalogContext}

═══════════════════════════════════════════════════════════════
DIRECTRICES DE TONO Y ESTILO (OBLIGATORIO)
═══════════════════════════════════════════════════════════════
1. Habla de forma NATURAL, cercana y directa (de tú a tú, como un socio de confianza).
2. NUNCA uses "Estimado", fórmulas frías o robóticas.
3. Ve directo al grano sin introducciones largas.
4. Cuando ejecutes una acción, primero explica brevemente lo que harás, luego incluye la etiqueta de acción.
5. NO uses tablas de markdown con barras verticales. Usa listas limpias con emojis y viñetas.
6. Para consultas analíticas, usa los datos del contexto en tiempo real proporcionado.
7. Si el usuario pide agregar una LISTA de productos, usa AGREGAR_LOTE con todos los productos juntos.
8. Para crear una orden de venta, siempre descuenta el stock y genera el número de orden.`;

    // ── 14. Build Gemini history ──────────────────────────────────────────────

    const rawHistory = (history || [])
      .slice(-10) // Keep last 10 turns for context
      .map((h: ChatHistoryEntry) => ({
        role: h.role,
        parts: h.parts,
      }));

    // Sanitize history: ensure it starts with 'user' and alternates strictly
    const geminiHistory: { role: 'user' | 'model'; parts: { text: string }[] }[] = [];
    let expectedRole = 'user';

    for (const msg of rawHistory) {
      if (msg.role === expectedRole) {
        geminiHistory.push(msg);
        expectedRole = expectedRole === 'user' ? 'model' : 'user';
      }
    }

    // Ensure the history ends with 'model' so the new 'user' prompt alternates correctly
    if (geminiHistory.length > 0 && geminiHistory[geminiHistory.length - 1].role === 'user') {
      geminiHistory.pop();
    }

    // ── 15. Call Gemini ───────────────────────────────────────────────────────

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { success: false, error: 'No se ha configurado la variable GEMINI_API_KEY en el servidor. Agrégala en las variables de entorno de Vercel.' },
        { status: 500 }
      );
    }

    let isQuotaExceeded = false;
    const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

    let candidateText = '';
    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              ...geminiHistory,
              {
                role: 'user',
                parts: [
                  {
                    text: `Contexto de la tienda en tiempo real:\n${JSON.stringify(contextPayload, null, 2)}\n\nSolicitud del administrador: "${cleanPrompt}"`,
                  },
                ],
              },
            ],
            systemInstruction: {
              parts: [{ text: systemInstruction }],
            },
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 2048,
            },
          }),
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (candidateText) break;
        } else if (geminiRes.status === 429) {
          isQuotaExceeded = true;
          console.warn(`Model ${model} hit rate limit (429).`);
        } else {
          const errorText = await geminiRes.text();
          console.error(`Gemini API Error for model ${model}: [${geminiRes.status}] ${errorText}`);
        }
      } catch (modelErr) {
        console.warn(`Error querying model ${model}:`, modelErr);
      }
    }

    if (!candidateText) {
      if (isQuotaExceeded) {
        return NextResponse.json(
          { success: false, isQuotaExceeded: true, error: 'Has alcanzado el límite de 15 consultas por minuto de Google Gemini. Por favor espera unos segundos y vuelve a preguntar.' },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { success: false, error: 'La IA no pudo generar una respuesta en este momento. Por favor intenta nuevamente.' },
        { status: 503 }
      );
    }

    // ── 16. Execute any actions found in response ──────────────────────────────

    const { cleanedResponse, actionResults } = await executeActions(candidateText);

    // Build final response: combine cleaned AI response with action results
    let finalAnswer = cleanedResponse;
    if (actionResults.length > 0) {
      finalAnswer = (cleanedResponse ? cleanedResponse + '\n\n' : '') + actionResults.join('\n\n');
    }

    return NextResponse.json({
      success: true,
      answer: finalAnswer.trim(),
      source: 'gemini',
      hasActions: actionResults.length > 0,
    });
  } catch (error) {
    console.error('[ai chat error]', error);
    return NextResponse.json(
      { success: false, error: 'Error procesando consulta de IA' },
      { status: 500 }
    );
  }
}
