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
  executeAgregarLoteBulk,
  executeActualizarCalidadProducto,
  executeModificarProducto,
  executeOcultarProducto,
  executeOcultarLote,
  executeCrearOrdenMulti,
  executeAnularOrden,
  executeActualizarTasaCambio,
} from '@/lib/ai/adminTools';
import {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from '@/lib/whatsapp/tools';
import { ExchangeRate } from '@/lib/models/ExchangeRate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatHistoryEntry {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// ─── Action Tag Parser (Robust Brace-Balanced) ───────────────────────────────

/**
 * Extracts all [ACCION:TYPE:{...}] tags from the AI response.
 * Uses brace-counting instead of a greedy regex so nested JSON objects
 * like {"items":[{...}]} are captured correctly without leaving residual text.
 */
function extractActionTags(text: string): Array<{ full: string; type: string; jsonStr: string }> {
  const results: Array<{ full: string; type: string; jsonStr: string }> = [];
  const prefix = '[ACCION:';
  let searchFrom = 0;

  while (true) {
    const tagStart = text.indexOf(prefix, searchFrom);
    if (tagStart === -1) break;

    // Find the colon after the action type name
    const typeStart = tagStart + prefix.length;
    const colonIdx = text.indexOf(':', typeStart);
    if (colonIdx === -1) { searchFrom = tagStart + 1; continue; }

    const actionType = text.slice(typeStart, colonIdx).trim();
    if (!actionType || !/^[A-Z_]+$/.test(actionType)) { searchFrom = tagStart + 1; continue; }

    // Now find the JSON object using brace counting
    const jsonStart = text.indexOf('{', colonIdx);
    if (jsonStart === -1) { searchFrom = tagStart + 1; continue; }

    let depth = 0;
    let jsonEnd = -1;
    for (let i = jsonStart; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
    }

    if (jsonEnd === -1) { searchFrom = tagStart + 1; continue; }

    // Find the closing ] of the tag; allow only whitespace between } and ]
    const closingBracket = text.indexOf(']', jsonEnd + 1);
    if (closingBracket === -1) { searchFrom = tagStart + 1; continue; }
    const betweenText = text.slice(jsonEnd + 1, closingBracket);
    if (betweenText.trim() !== '') { searchFrom = tagStart + 1; continue; }

    const fullMatch = text.slice(tagStart, closingBracket + 1);
    const jsonStr = text.slice(jsonStart, jsonEnd + 1);

    results.push({ full: fullMatch, type: actionType, jsonStr });
    searchFrom = closingBracket + 1;
  }
  return results;
}

async function executeActions(
  response: string
): Promise<{ cleanedResponse: string; actionResults: string[] }> {
  const actionResults: string[] = [];
  let cleanedResponse = response;

  const tags = extractActionTags(response);

  for (const tag of tags) {
    let payload: Record<string, unknown> = {};

    try {
      payload = JSON.parse(tag.jsonStr);
    } catch {
      console.error(`[AI Action Parser] Failed to parse JSON for action ${tag.type}:`, tag.jsonStr);
      actionResults.push(`⚠️ Error interno al procesar la acción ${tag.type}. El formato del JSON generado es inválido.`);
      cleanedResponse = cleanedResponse.replace(tag.full, '').trim();
      continue;
    }

    let result: { success: boolean; message: string } | null = null;

    switch (tag.type) {
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
      case 'ANULAR_ORDEN': {
        result = await executeAnularOrden(
          String(payload.orderNumber ?? ''),
          payload.motivo ? String(payload.motivo) : undefined
        );
        break;
      }
      case 'ACTUALIZAR_TASA_CAMBIO': {
        result = await executeActualizarTasaCambio(Number(payload.nuevaTasa ?? 0));
        break;
      }
      case 'AGREGAR_PRODUCTO': {
        result = await executeAgregarProducto({
          marca: String(payload.marca ?? '').toUpperCase().trim(),
          modelo: String(payload.modelo ?? '').toUpperCase().trim(),
          calidad: String(payload.calidad ?? 'ORIGINAL C/M').toUpperCase().trim(),
          precio: Number(payload.precio ?? 0),
          stock: payload.stock ? Number(payload.stock) : undefined,
        });
        break;
      }
      case 'AGREGAR_LOTE': {
        const lote = Array.isArray(payload.productos) ? payload.productos : [];
        result = await executeAgregarProductosLote(
          lote.map((p: Record<string, unknown>) => ({
            marca:   String(p.marca   ?? '').toUpperCase().trim(),
            modelo:  String(p.modelo  ?? '').toUpperCase().trim(),
            calidad: String(p.calidad ?? 'ORIGINAL C/M').toUpperCase().trim(),
            precio:  Number(p.precio  ?? 0),
            stock:   p.stock ? Number(p.stock) : undefined,
          }))
        );
        break;
      }
      case 'AGREGAR_LOTE_BULK': {
        // Large batch (50-500 products): delegates to the bulk function with batched insertMany
        const lote = Array.isArray(payload.productos) ? payload.productos : [];
        result = await executeAgregarLoteBulk(
          lote.map((p: Record<string, unknown>) => ({
            marca:   String(p.marca   ?? '').toUpperCase().trim(),
            modelo:  String(p.modelo  ?? '').toUpperCase().trim(),
            calidad: String(p.calidad ?? 'ORIGINAL C/M').toUpperCase().trim(),
            precio:  Number(p.precio  ?? 0),
            stock:   p.stock ? Number(p.stock) : undefined,
          }))
        );
        break;
      }
      case 'OCULTAR_PRODUCTO': {
        result = await executeOcultarProducto(String(payload.queryProducto ?? ''));
        break;
      }
      case 'MODIFICAR_PRODUCTO': {
        result = await executeModificarProducto({
          queryProducto: String(payload.queryProducto ?? ''),
          nuevaMarca: payload.nuevaMarca ? String(payload.nuevaMarca).toUpperCase().trim() : undefined,
          nuevoModelo: payload.nuevoModelo ? String(payload.nuevoModelo).toUpperCase().trim() : undefined,
          nuevaCalidad: payload.nuevaCalidad ? String(payload.nuevaCalidad).toUpperCase().trim() : undefined,
          nuevoPrecio: payload.nuevoPrecio ? Number(payload.nuevoPrecio) : undefined,
        });
        break;
      }
      case 'OCULTAR_LOTE': {
        const queries = Array.isArray(payload.queries) ? payload.queries.map(String) : [];
        result = await executeOcultarLote(queries);
        break;
      }
      default:
        actionResults.push(`⚠️ Acción desconocida: ${tag.type}`);
    }

    if (result) {
      actionResults.push(result.message);
    }

    // Remove the action tag from the response text
    cleanedResponse = cleanedResponse.replace(tag.full, '').trim();
  }

  // Final cleanup: remove any leftover partial action tag fragments that may appear
  // e.g. trailing ,"currency":"CUP"...} or [ACCION:... without closing ]
  cleanedResponse = cleanedResponse
    .replace(/\[ACCION:[^\]]{0,500}$/gm, '')  // unclosed tags at end of lines
    .replace(/,\s*"[a-zA-Z_]+":\s*[^\n,}{\]]{0,200}(?=[\n]|$)/g, '') // stray JSON fragments
    .replace(/\n{3,}/g, '\n\n') // collapse excessive newlines
    .trim();

  return {
    cleanedResponse,
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

    const [sales, products, mermasHistory, rateDoc] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Product.find({ isHidden: false }).lean(),
      StockHistory.find({ type: 'merma' }).sort({ createdAt: -1 }).lean(),
      ExchangeRate.findOne().sort({ updatedAt: -1 }).lean() as Promise<{ rate: number } | null>,
    ]);
    const currentExchangeRate = rateDoc?.rate || 'No configurada (⚠️ AVISO: El sistema requiere configurar la tasa primero)';

    // ── 2. Compute date boundaries (Cuba timezone) ────────────────────────────

    const now = new Date();
    const havanaTodayKey = getHavanaDateKey(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const havanaYesterdayKey = getHavanaDateKey(yesterdayDate);
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const [curYear, curMonth] = havanaTodayKey.split('-');

    // ── 3. Segment sales (ignoring CANCELLED sales) ───────────────────────────

    const activeSales = sales.filter((s) => s.status !== 'CANCELLED');
    const todaySales = activeSales.filter((s) => getHavanaDateKey(s.createdAt) === havanaTodayKey);
    const yesterdaySales = activeSales.filter((s) => getHavanaDateKey(s.createdAt) === havanaYesterdayKey);
    const weekSales = activeSales.filter((s) => new Date(s.createdAt).getTime() >= weekStart);
    const monthSales = activeSales.filter((s) => {
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
    const allTot = calcTotals(activeSales);

    // ── 4. Pending / Debtors (excluding CANCELLED) ─────────────────────────────

    const unpaidSales = sales.filter((s) => !s.paid && s.status !== 'CANCELLED');
    const debtorsSummary = unpaidSales.map((s) => ({
      orderNumber: s.orderNumber,
      client: s.clientName || 'Consumidor Final',
      articulos: (s.items || []).map((i: any) => `${i.qty}x ${i.marca} ${i.modelo} (${i.calidad})`).join(', '),
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      currency: s.currency,
      date: new Date(s.createdAt).toLocaleDateString('es-ES'),
      notes: s.notes || '',
    }));

    // ── 5. Product rankings ───────────────────────────────────────────────────

    const modelSalesMap: Record<string, { modelo: string; marca: string; units: number; revenueUSD: number }> = {};
    activeSales.forEach((s) => {
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
      const daySales = activeSales.filter((s) => getHavanaDateKey(s.createdAt) === dateKey);
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
      estado: s.status,
    }));

    // ── 8. Best sales day ─────────────────────────────────────────────────────

    const daySalesMap: Record<string, { date: string; usd: number; cup: number; count: number }> = {};
    activeSales.forEach((s) => {
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
      negocio: 'EL ARCA DISPLAY CLUB (Venta y distribución de pantallas de celulares en Cuba)',
      monedas: 'USD (Dólares en efectivo) y CUP (Pesos cubanos)',
      tasaCambioActualUSD_CUP: currentExchangeRate,
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
Eres el socio y copiloto de máxima confianza del administrador de la tienda. Puedes CONSULTAR datos y MODIFICAR la base de datos en tiempo real.

═══════════════════════════════════════════════════════════════
🧠 DICCIONARIO SEMÁNTICO, ABREVIATURAS Y COMPATIBILIDADES
═══════════════════════════════════════════════════════════════
1. ABREVIATURAS DE MARCAS Y MODELOS:
   • "rm" o "redmi" = Xiaomi Redmi (ej: "rm 9a" = "Redmi 9A").
   • "sm" o "sam" = Samsung Galaxy (ej: "sm a32" = "Samsung A32").
   • "ip" o "iph" = Apple iPhone (ej: "ip 11" = "iPhone 11").
   • "moto" = Motorola.
   • "inf" = Infinix.
   • "tec" = Tecno.
   • "pco" = Poco.
   • "hw" = Huawei.

2. MARCOS Y CALIDADES:
   • "c/m", "cm" o "con marco" = Pantalla con marco preinstalado (chasis).
   • "s/m", "sin marco" = Pantalla sin marco (solo display y táctil).
   • "incell" = Calidad LCD compatible económica.
   • "oled" / "amoled" = Calidad OLED de alta gama.
   • "orig" / "original" = Calidad Original / Servicio Oficial.
   • "copia" / "compatible" = Calidad genérica compatible.

3. DETECCIÓN DE COMPATIBILIDADES MULTIMODELO (MUY IMPORTANTE):
   En el catálogo de repuestos, muchos displays son compatibles con múltiples modelos a la vez, listados con barras separadoras "/" (por ejemplo: "Samsung A12 / A02 / A32 5G / M12 ORIGINAL").
   • Cuando el usuario pregunte por la disponibilidad o precio de cualquier modelo (ej: "¿Cuántas Samsung A32 5G hay disponibles?"):
     a) Revisa minuciosamente el catálogo buscando TANTO los productos cuyo modelo sea exactamente ese, COMO los productos compatibles compartidos que incluyan ese modelo entre barras "/".
     b) Presenta al usuario TODAS las opciones existentes de forma clara y ordenada:
        - Título completo en inventario.
        - Calidad (con/sin marco, original, incell, etc.).
        - Precio unitario en USD.
        - Unidades disponibles en stock.
     c) Calcula y declara de forma destacada el TOTAL de pantallas compatibles disponibles en inventario.
     d) Pregúntale amablemente si desea registrar alguna venta o hacer un ajuste de stock de alguna de las opciones.

═══════════════════════════════════════════════════════════════
⚠️ REGLA DE ORO DE CLARIFICACIÓN ANTE OPCIONES MÚLTIPLES
═══════════════════════════════════════════════════════════════
Si el usuario solicita una ACCIÓN MUTABLE (vender, cambiar precio, cambiar calidad, ajustar stock) para un modelo que tiene VARIAS opciones o variantes en el catálogo (por ejemplo: Con Marco y Sin Marco, o Original e Incell) y el usuario NO ha especificado cuál de ellas quiere:
• **ESTÁ ESTRICTAMENTE PROHIBIDO EJECUTAR UNA ACCIÓN AL AZAR O ASUMIR UNA OPCIÓN**.
• En lugar de ejecutar la acción, debes responder amablemente mostrando las variantes disponibles con su stock y precio actual, y preguntarle:
  "Para [Modelo] tenemos las siguientes opciones en inventario:
  1. [Opción A] ($[Precio] USD - [Stock] uds disponibles)
  2. [Opción B] ($[Precio] USD - [Stock] uds disponibles)
  ¿Cuál de las opciones deseas [vender / ajustar / modificar]?"
• ÚNICAMENTE emitirás la etiqueta [ACCION:...] cuando el usuario especifique cuál desea o cuando solo exista una coincidencia unívoca en el inventario.

═══════════════════════════════════════════════════════════════
📋 ASISTENCIA ANTE PARÁMETROS INCOMPLETOS
═══════════════════════════════════════════════════════════════
• Si el usuario dice "marca una orden como pagada" o "anula una orden" sin dar el código:
  Revisa "ordenesPendientesCobro" o "ultimasVentasRegistradas" del contexto, muéstrale las órdenes más recientes con su código (#...) y cliente, y pregúntale cuál desea marcar o anular.
• Si el usuario dice "ajustar stock" o "cambiar precio" sin decir qué producto o cuánto:
  Pregúntale qué modelo y qué cantidad o nuevo precio desea aplicar.

═══════════════════════════════════════════════════════════════
🔠 REGLA ESTRICTA DE MAYÚSCULAS PARA PRODUCTOS
═══════════════════════════════════════════════════════════════
Tanto la MARCA como el MODELO y la CALIDAD de cualquier producto deben escribirse SIEMPRE Y OBLIGATORIAMENTE 100% EN MAYÚSCULAS (ejemplos: "SAMSUNG", "REDMI NOTE 11", "IPHONE 13 PRO MAX", "MOTO G22", "INFINIX HOT 12 PLAY"). Nunca uses minúsculas en marcas ni modelos al agregarlos o modificarlos.

═══════════════════════════════════════════════════════════════
🔄 REGLA DE REINGRESO / SUMA INTELIGENTE DE STOCK EN PRODUCTOS EXISTENTES
═══════════════════════════════════════════════════════════════
Si el usuario solicita agregar un producto que ya existe en el catálogo, el sistema NO lo rechaza ni crea un duplicado: SUMA automáticamente las unidades al stock existente y reactiva el producto si estaba en stock 0 o en estado agotado/oculto. Explícale al usuario con total claridad y profesionalismo que el sistema sumará el stock al producto existente.

═══════════════════════════════════════════════════════════════
⚠️ REGLA OBLIGATORIA: CONFIRMACIÓN ANTES DE AGREGAR PRODUCTOS
═══════════════════════════════════════════════════════════════
Esta regla aplica a AGREGAR_PRODUCTO, AGREGAR_LOTE y AGREGAR_LOTE_BULK.

**PASO 1 — MOSTRAR RESUMEN ANTES DE EJECUTAR**
Antes de emitir cualquier etiqueta [ACCION:AGREGAR_...], muestra siempre un resumen:

  📦 PRODUCTOS A AGREGAR:
  • [Marca] [Modelo] [Calidad] — $[Precio] USD — Stock: [N] uds
  • ...
  Total: N producto(s)

  ¿Confirmas el alta de estos productos? (responde 'sí' para proceder)

**PASO 2 — EJECUTAR SOLO CON CONFIRMACIÓN**
Solo cuando el usuario responda afirmativamente emite la etiqueta [ACCION:...].

**REGLA DE TAMAÑO DE LOTE:**
  • 1 producto      → usa AGREGAR_PRODUCTO
  • 2–15 productos  → usa AGREGAR_LOTE
  • 16–500 productos → usa AGREGAR_LOTE_BULK
  • >500 productos  → pide al usuario dividir en grupos de máximo 500

**REGLA DE EDICIÓN Y UNDO MASIVO:**
Si el usuario dice "me equivoqué, el producto es marca X o vale Y", **NO** lo borres. Usa 'MODIFICAR_PRODUCTO' para corregir todos sus atributos de una vez.
Si el usuario dice "cancela todo lo que acabo de agregar", revisa tu historial para ver qué productos agregaste en tu último mensaje, y usa 'OCULTAR_LOTE' con esa lista de productos.

═══════════════════════════════════════════════════════════════
⚠️ REGLA OBLIGATORIA: SEGURIDAD ANTI-PLANTILLAS
═══════════════════════════════════════════════════════════════
Si el mensaje del usuario contiene textos entre corchetes literalmente como "[Modelo exacto]", "[Código de Orden]", "[Cantidad]", o similares (indicando que envió una plantilla sin rellenar los datos):
**RECHAZA INMEDIATAMENTE** la ejecución de cualquier herramienta. No intentes adivinar ni buscar productos u órdenes. Responde pidiendo al usuario que especifique los datos exactos.

⚠️ REGLA OBLIGATORIA: CONFIRMACIÓN ANTES DE REGISTRAR VENTAS U ÓRDENES
═══════════════════════════════════════════════════════════════
Esta regla tiene PRIORIDAD ABSOLUTA sobre cualquier otra indicación.

Cuando el usuario solicite registrar una venta, crear una orden, o usar CREAR_ORDEN / VENTA_RAPIDA:

**PASO 1 — RECOPILAR DATOS FALTANTES (si aplica)**
Si el mensaje del usuario no especifica alguno de estos campos, pregunta amablemente antes de continuar:
  • Nombre del cliente (o confirmar "Consumidor Final")
  • Moneda de cobro: USD o CUP
  • Estado de pago: PAGADA ahora o PENDIENTE (a crédito)
  • Alguna nota especial (opcional)

**PASO 2 — MOSTRAR RESUMEN DE CONFIRMACIÓN**
Una vez que tengas todos los datos necesarios, presenta un resumen claro ANTES de ejecutar la acción:

  💳 RESUMEN DE VENTA:
  • Producto: [nombre completo]
  • Cantidad: [n] unidades
  • Cliente: [nombre]
  • Precio unitario: $X.XX USD
  • Total: $X.XX USD (o XXXX CUP)
  • Moneda cobro: [USD / CUP]
  • Estado: [PAGADA ✅ / PENDIENTE ⏳]

  Responde 'sí', 'confirmar', 'dale' o 'ok' para registrar la venta.

**PASO 3 — EJECUTAR SOLO CON CONFIRMACIÓN**
Solo cuando el usuario responda afirmativamente ("sí", "confirmar", "dale", "ok", "procede", "s", "yes", "listo") emite la etiqueta [ACCION:CREAR_ORDEN:...] o [ACCION:VENTA_RAPIDA:...].
NUNCA emitas la etiqueta de acción de venta en la primera respuesta.

═══════════════════════════════════════════════════════════════
🔥 CAPACIDADES DE GESTIÓN (MUTACIONES EN BASE DE DATOS)
═══════════════════════════════════════════════════════════════
Cuando ejecutes una acción de gestión tras tener todos los datos necesarios, incluye en tu respuesta la etiqueta de acción con este formato exacto:

[ACCION:TIPO:{"campo":"valor"}]

ACCIONES DISPONIBLES:

1. CREAR_ORDEN — Para ventas multi-producto:
[ACCION:CREAR_ORDEN:{"clientName":"Nombre","items":[{"productQuery":"samsung a04 c/m","qty":2,"precioOverride":null}],"currency":"USD","paid":true,"notes":"Opcional"}]

2. VENTA_RAPIDA — Para venta de UN producto:
[ACCION:VENTA_RAPIDA:{"cliente":"Taller Mario","modeloProducto":"Redmi 9A C/M","cantidad":1,"moneda":"USD","pagado":true}]

3. ACTUALIZAR_PRECIO — Cambiar precio de un producto:
[ACCION:ACTUALIZAR_PRECIO:{"queryProducto":"Samsung A04 C/M","nuevoPrecioUSD":15.50}]

4. ACTUALIZAR_CALIDAD — Cambiar calidad de un producto:
[ACCION:ACTUALIZAR_CALIDAD:{"queryProducto":"Redmi 9A","nuevaCalidad":"ORIGINAL C/M"}]

5. AJUSTAR_STOCK — Sumar o restar stock en almacén:
[ACCION:AJUSTAR_STOCK:{"queryProducto":"iPhone 11","cantidadAgregada":5,"motivo":"Compra proveedor"}]
(usa número negativo para restar: "cantidadAgregada":-2)

6. MARCAR_PAGADA — Marcar orden como pagada:
[ACCION:MARCAR_PAGADA:{"orderNumber":"0920ABC01"}]

7. MARCAR_PENDIENTE — Marcar orden como pendiente (a crédito):
[ACCION:MARCAR_PENDIENTE:{"orderNumber":"0920ABC01"}]

8. ANULAR_ORDEN — Cancelar orden y reintegrar stock al almacén:
[ACCION:ANULAR_ORDEN:{"orderNumber":"0920ABC01","motivo":"Cancelada por el cliente"}]

9. ACTUALIZAR_TASA_CAMBIO — Modificar tasa oficial USD/CUP de la tienda:
[ACCION:ACTUALIZAR_TASA_CAMBIO:{"nuevaTasa":330}]

10. AGREGAR_PRODUCTO — Agregar un producto al catálogo (máx. 1 producto por acción):
[ACCION:AGREGAR_PRODUCTO:{"marca":"SAMSUNG","modelo":"Galaxy A14","calidad":"ORIGINAL C/M","precio":25.00,"stock":3}]

11. AGREGAR_LOTE — Agregar entre 2 y 15 productos a la vez:
[ACCION:AGREGAR_LOTE:{"productos":[{"marca":"SAMSUNG","modelo":"A04","calidad":"ORIGINAL C/M","precio":13.00,"stock":5},{"marca":"XIAOMI","modelo":"Redmi 9C","calidad":"COMPATIBLE","precio":8.00,"stock":3}]}]

12. AGREGAR_LOTE_BULK — Agregar entre 16 y 500 productos en una sola operación masiva:
[ACCION:AGREGAR_LOTE_BULK:{"productos":[{"marca":"SAMSUNG","modelo":"A14","calidad":"ORIGINAL C/M","precio":15.00,"stock":2},{"marca":"XIAOMI","modelo":"Redmi 12C","calidad":"ORIGINAL S/M","precio":12.00,"stock":5},...]}]

13. OCULTAR_PRODUCTO — Ocultar un solo producto del catálogo público:
[ACCION:OCULTAR_PRODUCTO:{"queryProducto":"Redmi Note 7"}]

14. MODIFICAR_PRODUCTO — Corregir atributos de un producto (marca, modelo, calidad, precio):
[ACCION:MODIFICAR_PRODUCTO:{"queryProducto":"samung a14", "nuevaMarca":"SAMSUNG", "nuevoModelo":"Galaxy A14", "nuevoPrecio":20}]

15. OCULTAR_LOTE — Ocultar múltiples productos a la vez (ideal para UNDO de lotes agregados por error):
[ACCION:OCULTAR_LOTE:{"queries":["SAMSUNG A14", "XIAOMI Redmi 9A"]}]

═══════════════════════════════════════════════════════════════
📋 CATÁLOGO ACTUAL (para búsquedas inteligentes de productos)
═══════════════════════════════════════════════════════════════
${catalogContext}

═══════════════════════════════════════════════════════════════
DIRECTRICES DE TONO Y ESTILO (OBLIGATORIO)
═══════════════════════════════════════════════════════════════
1. Habla de forma NATURAL, cercana y directa (de tú a tú, como un socio de confianza).
2. NUNCA uses "Estimado", fórmulas frías o robóticas.
3. Ve directo al grano sin introducciones largas ni rodeos.
4. Cuando ejecutes una acción, explica brevemente lo que estás haciendo y añade la etiqueta [ACCION:...].
5. NO uses tablas de markdown con barras verticales. Usa listas limpias con emojis y viñetas.
6. Para consultas analíticas o de tasas, usa los datos del contexto en tiempo real.
7. La tasa de cambio actual del negocio es 1 USD = ${currentExchangeRate} CUP.
8. FORMATO DE NÚMEROS: Escribe siempre cantidades completas, como "7 unidades", "3 unidades disponibles", "Stock: 7". NO pongas asteriscos (**) alrededor de números solos sin contexto; úsalos solo para frases completas en negrita.`;
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
    // As of 2026, previous models are deprecated. Google recommends gemini-3.6-flash.
    const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.0-flash'];

    let candidateText = '';
    const allErrors: string[] = [];
    
    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: systemInstruction }],
            },
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
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: 4096,
            },
          }),
        });

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (candidateText) break;
        } else if (geminiRes.status === 429) {
          isQuotaExceeded = true;
          allErrors.push(`[${model}] Rate Limit 429`);
          console.warn(`Model ${model} hit rate limit (429).`);
        } else {
          const errorText = await geminiRes.text();
          const errStr = `[${model} - ${geminiRes.status}] ${errorText}`;
          allErrors.push(errStr);
          console.error(`Gemini API Error for model ${model}:`, errStr);
        }
      } catch (modelErr: any) {
        const errStr = `Exception for ${model}: ${modelErr.message || String(modelErr)}`;
        allErrors.push(errStr);
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
        { success: false, error: `La IA no pudo generar una respuesta. Detalle del error de Google: ${allErrors.join(' | ')}` },
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
