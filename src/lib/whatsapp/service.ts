import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaDateKey } from '@/lib/dateUtils';
import {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
  executeAgregarOActualizarProductoWhatsApp,
} from './tools';
import { executeAgregarLoteBulk } from '@/lib/ai/adminTools';
import { parseBatchProductsFromText } from '@/lib/ai/batchParser';

/** Standardizes phone numbers to digits only */
export function normalizePhoneNumber(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/** Check if the phone belongs to the verified business owner */
export function isAdminUser(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  const adminPhone = normalizePhoneNumber(process.env.ADMIN_PHONE_NUMBER || '5352031972');
  return normalized === adminPhone || normalized === '5352031972' || normalized.endsWith('52031972');
}

/** In-memory conversation turns per phone (15-minute sliding window) */
interface ChatTurn {
  sender: string;
  text: string;
  time: number;
}

const conversationHistories = new Map<string, ChatTurn[]>();

function getChatHistory(phone: string): ChatTurn[] {
  const now = Date.now();
  const list = conversationHistories.get(phone) || [];
  const recent = list.filter((t) => now - t.time < 15 * 60 * 1000);
  conversationHistories.set(phone, recent);
  return recent;
}

function appendChatHistory(phone: string, sender: string, text: string) {
  const list = getChatHistory(phone);
  list.push({ sender, text, time: Date.now() });
  if (list.length > 8) list.splice(0, list.length - 8);
  conversationHistories.set(phone, list);
}

/** Parses direct price change commands in natural Spanish */
function parseDirectPriceCommand(text: string): { model: string; price: number } | null {
  const clean = text.trim().replace(/[.!?¿?]+$/, '');

  // 1: (cambiar|actualizar|poner|subir|bajar) (el)? precio (de)? (la|el)? <model> a <price>
  let m = clean.match(/(?:cambiar|actualizar|poner|subir|bajar)\s+(?:el\s+)?precio\s+(?:de\s+)?(?:la\s+|el\s+)?(.+?)\s+a\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (m && m[1] && m[2]) {
    return { model: m[1].trim(), price: parseFloat(m[2]) };
  }

  // 2: precio (de)? (la|el)? <model> (cambiar|poner|actualizar)? a <price>
  m = clean.match(/precio\s+(?:de\s+)?(?:la\s+|el\s+)?(.+?)\s+(?:cambiar|poner|actualizar)?\s*a\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (m && m[1] && m[2]) {
    return { model: m[1].trim(), price: parseFloat(m[2]) };
  }

  // 3: <model> cambiar precio a <price>
  m = clean.match(/(.+?)\s+cambiar\s+precio\s+a\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (m && m[1] && m[2]) {
    return { model: m[1].trim(), price: parseFloat(m[2]) };
  }

  // 4: poner <model> en/a <price>
  m = clean.match(/poner\s+(?:la\s+|el\s+)?(.+?)\s+(?:en|a)\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (m && m[1] && m[2]) {
    return { model: m[1].trim(), price: parseFloat(m[2]) };
  }

  return null;
}

/** Parses direct stock query in natural Spanish */
function parseDirectStockQuery(text: string): string | null {
  const clean = text.trim().replace(/[.!?¿?]+$/, '');
  const m = clean.match(/(?:cuanto\s+stock\s+queda\s+de|stock\s+de|cuantas\s+quedan\s+de|tienes\s+stock\s+de|disponibilidad\s+de|cuanto\s+queda\s+de)\s+(?:la\s+|el\s+)?(.+)/i);
  if (m && m[1]) return m[1].trim();
  return null;
}

/** Sends a message to a WhatsApp user via Whapi.cloud Gateway or Meta Cloud API */
export async function sendWhatsAppMessage(to: string, messageText: string): Promise<boolean> {
  const whapiToken = process.env.WHAPI_TOKEN;
  const metaToken = process.env.WHATSAPP_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // 1. Preferred: Whapi.cloud Gateway
  if (whapiToken) {
    const rawTo = (to || '').trim();
    const destination = rawTo.includes('@') ? rawTo : `${normalizePhoneNumber(rawTo)}@s.whatsapp.net`;
    const url = 'https://gate.whapi.cloud/messages/text';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${whapiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: destination,
          body: messageText,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('[Whapi send error]', data);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[Whapi network error]', err);
      return false;
    }
  }

  // 2. Fallback: Meta Cloud API
  if (metaToken && metaPhoneId) {
    const cleanTo = normalizePhoneNumber(to);
    const url = `https://graph.facebook.com/v20.0/${metaPhoneId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${metaToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanTo,
          type: 'text',
          text: {
            preview_url: false,
            body: messageText,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error('[WhatsApp Meta API error]', data);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[WhatsApp Meta send error]', err);
      return false;
    }
  }

  console.warn('[WhatsApp] Neither WHAPI_TOKEN nor Meta credentials (WHATSAPP_TOKEN) are set in environment.');
  return false;
}

/** Processes an incoming WhatsApp text message through Gemini with Admin/Client security isolation */
export async function processWhatsAppAiMessage(userMessage: string, senderPhone: string): Promise<string> {
  await connectToDatabase();
  const isAdmin = isAdminUser(senderPhone);
  const cleanPrompt = (userMessage || '').trim();
  const promptLower = cleanPrompt.toLowerCase();
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // =========================================================================
  // PIPELINE A: ADMINISTRADOR / DUEÑO (+53 52031972)
  // =========================================================================
  if (isAdmin) {
    // -----------------------------------------------------------------------
    // FAST-PATH 0: BATCH PRODUCT INGESTION (WhatsApp paste of 2 to 500+ items)
    // Instant execution in < 1s with 0% chance of AI failure or token cutoff
    // -----------------------------------------------------------------------
    const parsedBatch = parseBatchProductsFromText(cleanPrompt);
    if (parsedBatch.length >= 2) {
      console.log(`[WhatsApp Inbound] Admin Batch Ingestion detected: ${parsedBatch.length} products`);
      const result = await executeAgregarLoteBulk(parsedBatch);
      appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(senderPhone, 'Asistente', result.message);
      return result.message;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 1: DIRECT PRICE UPDATE COMMAND
    // Instant execution in < 50ms with 0% chance of AI failure
    // -----------------------------------------------------------------------
    const directPrice = parseDirectPriceCommand(cleanPrompt);
    if (directPrice) {
      const result = await executeActualizarPrecioProducto(directPrice.model, directPrice.price);
      appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(senderPhone, 'Asistente', result.message);
      return result.message;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 2: DIRECT STOCK QUERY
    // -----------------------------------------------------------------------
    const directStock = parseDirectStockQuery(cleanPrompt);
    if (directStock) {
      const product = await findProductSmart(directStock);
      let reply: string;
      if (product) {
        reply =
          `📦 *${product.marca} ${product.modelo} (${product.calidad})*\n\n` +
          `• Precio de venta: *$${product.precio.toFixed(2)} USD* 💵\n` +
          `• Stock en almacén: *${product.stock} unidades* ${product.stock > 0 ? '✅ Disponible' : '⚠️ Agotado'}`;
      } else {
        reply = `❌ No encontré ningún producto que coincida con "${directStock}" en el catálogo.`;
      }
      appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(senderPhone, 'Asistente', reply);
      return reply;
    }

    // -----------------------------------------------------------------------
    // Fetch live business data for context & analytics
    // -----------------------------------------------------------------------
    const [sales, products, mermasHistory] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Product.find({}).lean(),
      StockHistory.find({ type: 'merma' }).sort({ createdAt: -1 }).lean(),
    ]);

    // Compute Cuba dates
    const now = new Date();
    const havanaTodayKey = getHavanaDateKey(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const havanaYesterdayKey = getHavanaDateKey(yesterdayDate);
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const [curYear, curMonth] = havanaTodayKey.split('-');

    const calcTotals = (saleList: any[]) => {
      let usd = 0;
      let cup = 0;
      let paidUSD = 0;
      let count = saleList.length;
      let itemsCount = 0;

      saleList.forEach((s) => {
        if (s.currency === 'CUP') {
          cup += s.totalCUP || 0;
        } else {
          usd += s.totalUSD || 0;
          if (s.paid) paidUSD += s.totalUSD || 0;
        }
        (s.items || []).forEach((i: any) => {
          itemsCount += i.qty || 0;
        });
      });
      return { usd, cup, paidUSD, count, itemsCount };
    };

    const todaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaTodayKey);
    const yesterdaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaYesterdayKey);
    const weekSales = sales.filter((s) => new Date(s.createdAt).getTime() >= weekStart);
    const monthSales = sales.filter((s) => {
      const [sYear, sMonth] = getHavanaDateKey(s.createdAt).split('-');
      return sYear === curYear && sMonth === curMonth;
    });

    const todayTot = calcTotals(todaySales);
    const yesterdayTot = calcTotals(yesterdaySales);
    const weekTot = calcTotals(weekSales);
    const monthTot = calcTotals(monthSales);
    const allTot = calcTotals(sales);

    // Unpaid sales / Debtors
    const unpaidSales = sales.filter((s) => !s.paid);
    const debtorsSummary = unpaidSales.map((s) => ({
      orden: s.orderNumber,
      cliente: s.clientName || 'Consumidor Final',
      articulos: (s.items || []).map((i: any) => `${i.qty}x ${i.marca} ${i.modelo} (${i.calidad})`).join(', '),
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      moneda: s.currency,
      fecha: getHavanaDateKey(s.createdAt),
      nota: s.notes || '',
    }));

    // -----------------------------------------------------------------------
    // FAST-PATH 3: DIRECT DEBTORS QUERY ("Quien me debe", "deudores")
    // -----------------------------------------------------------------------
    if (
      promptLower.includes('quien me debe') ||
      promptLower.includes('quién me debe') ||
      promptLower.includes('quien debe') ||
      promptLower === 'deudores' ||
      promptLower.includes('cuentas por cobrar') ||
      promptLower.includes('cobros pendientes')
    ) {
      appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
      if (debtorsSummary.length === 0) {
        const reply = '🎉 *¡Excelentes noticias Osvaldo!* No hay clientes con deudas pendientes en este momento. Todas las órdenes están saldadas al 100%.';
        appendChatHistory(senderPhone, 'Asistente', reply);
        return reply;
      }
      const lines = debtorsSummary.map(
        (d) =>
          `👤 *${d.cliente}* (Orden #${d.orden})\n   ↳ Monto: *${d.moneda === 'CUP' ? `${d.totalCUP?.toLocaleString()} CUP` : `$${d.totalUSD?.toFixed(2)} USD`}*\n   ↳ Productos: _${d.articulos}_${d.nota ? `\n   ↳ Nota: _${d.nota}_` : ''} (Fecha: ${d.fecha})`
      );
      const totalUSD = debtorsSummary.reduce((acc, d) => acc + (d.totalUSD || 0), 0);
      const reply = `📋 *Cuentas Pendientes de Cobro (${debtorsSummary.length} órdenes)*:\n\n${lines.join('\n\n')}\n\n💵 *Total pendiente:* *$${totalUSD.toFixed(2)} USD*`;
      appendChatHistory(senderPhone, 'Asistente', reply);
      return reply;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 4: DIRECT TODAY SALES QUERY ("Cuanto vendi hoy", "ventas hoy")
    // -----------------------------------------------------------------------
    if (
      promptLower === 'cuanto vendi hoy' ||
      promptLower === 'cuánto vendí hoy' ||
      promptLower === 'ventas hoy' ||
      promptLower === 'ventas de hoy' ||
      promptLower.includes('cuanto se vendio hoy') ||
      promptLower.includes('balance hoy')
    ) {
      appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
      const reply =
        `📊 *Ventas de Hoy (${havanaTodayKey})*\n\n` +
        `• Total en USD: *$${todayTot.usd.toFixed(2)} USD*\n` +
        `• Total en CUP: *${todayTot.cup.toLocaleString()} CUP*\n` +
        `• Órdenes realizadas: *${todayTot.count}*\n` +
        `• Repuestos vendidos: *${todayTot.itemsCount} unidades*\n` +
        (todayTot.usd > 0 || todayTot.cup > 0 ? '🔥 ¡Excelente ritmo!' : '📦 Aún no hay ventas registradas el día de hoy.');
      appendChatHistory(senderPhone, 'Asistente', reply);
      return reply;
    }

    // Mermas summary
    const totalMermaUnits = mermasHistory.reduce((acc, m) => acc + (m.qty || 0), 0);
    const mermasMap: Record<string, { producto: string; units: number; reasons: string[] }> = {};
    mermasHistory.forEach((m) => {
      const name = m.productName || 'Desconocido';
      if (!mermasMap[name]) {
        mermasMap[name] = { producto: name, units: 0, reasons: [] };
      }
      mermasMap[name].units += m.qty || 0;
      if (m.reason && !mermasMap[name].reasons.includes(m.reason)) {
        mermasMap[name].reasons.push(m.reason);
      }
    });
    const topMermas = Object.values(mermasMap).sort((a, b) => b.units - a.units);

    // Top sellers
    const modelSalesMap: Record<string, { modelo: string; marca: string; units: number }> = {};
    sales.forEach((s) => {
      (s.items || []).forEach((item: any) => {
        const key = `${item.marca} ${item.modelo}`;
        if (!modelSalesMap[key]) {
          modelSalesMap[key] = { modelo: item.modelo, marca: item.marca, units: 0 };
        }
        modelSalesMap[key].units += item.qty || 0;
      });
    });
    const topModels = Object.values(modelSalesMap).sort((a, b) => b.units - a.units).slice(0, 6);

    const adminContext = {
      rolUsuario: 'DUEÑO_ADMINISTRADOR (Osvaldo)',
      hoy: {
        fecha: havanaTodayKey,
        ventasUSD: todayTot.usd,
        ventasCUP: todayTot.cup,
        ordenes: todayTot.count,
        repuestosVendidos: todayTot.itemsCount,
      },
      ayer: {
        fecha: havanaYesterdayKey,
        ventasUSD: yesterdayTot.usd,
        ventasCUP: yesterdayTot.cup,
        ordenes: yesterdayTot.count,
        repuestosVendidos: yesterdayTot.itemsCount,
      },
      esteMes: {
        ventasUSD: monthTot.usd,
        ventasCUP: monthTot.cup,
        ordenes: monthTot.count,
      },
      historicoTotal: {
        ventasUSD: allTot.usd,
        ventasCUP: allTot.cup,
        ordenes: allTot.count,
      },
      deudoresPendientes: debtorsSummary,
      mermas: {
        totalPiezasBaja: totalMermaUnits,
        rankingFallas: topMermas.slice(0, 5),
      },
      topMasVendidos: topModels,
      inventarioTotalModelos: products.length,
      inventarioAgotados: products.filter((p) => p.stock === 0).length,
      catalogoProductos: products.map((p) => ({
        marca: p.marca,
        modelo: p.modelo,
        calidad: p.calidad,
        precioUSD: p.precio,
        stock: p.stock,
        disponibilidad: p.stock > 0 ? `${p.stock} uds disponibles` : 'Agotado (0 stock)',
      })),
    };

    const adminInstruction = `Eres el asistente ejecutivo y mano derecha de Osvaldo en su negocio "EL ARCA DISPLAY CLUB".
Estás chateando con él directamente en su WhatsApp personal (+53 52031972).

DIRECTRICES DE ESTILO:
1. Habla de forma completamente natural, directa y cercana (de tú a tú, como su socio de taller).
2. Formatea tus respuestas exclusivamente para WhatsApp: usa negritas con un solo asterisco (*texto*), viñetas con guiones (-) y emojis útiles.
3. NO uses tablas de markdown con barras (|) ni almohadillas (###).
4. Tienes el catálogo completo de productos en "catalogoProductos". Si Osvaldo te pregunta por el precio o stock de cualquier modelo (ej: Redmi 9A, Samsung A04, iPhone 11 Pro, etc.), dale el precio exacto en USD y cuántas unidades quedan en almacén.
5. Recuerda el contexto del "HISTORIAL DE CONVERSACIÓN RECIENTE". Si Osvaldo dice "cambiar el precio a 13" o "cuántas quedan de esa", identifica qué producto estaban hablando en los mensajes anteriores.

INSTRUCCIÓN PARA EJECUTAR ACCIONES REALES EN LA BASE DE DATOS:
Si Osvaldo te pide cambiar un precio, registrar venta, ajustar stock o marcar cobro, INCLUYE la etiqueta de acción correspondiente:
- Para cambiar precio: [ACCION:ACTUALIZAR_PRECIO:MODELO:NUEVO_PRECIO_USD] (ej: [ACCION:ACTUALIZAR_PRECIO:Redmi 9A:13])
- Para marcar orden pagada: [ACCION:MARCAR_PAGADO:CODIGO_ORDEN] (ej: [ACCION:MARCAR_PAGADO:0828QQL01])
- Para marcar orden pendiente: [ACCION:MARCAR_PENDIENTE:CODIGO_ORDEN]
- Para sumar o restar stock: [ACCION:AJUSTAR_STOCK:MODELO:CANTIDAD] (ej: [ACCION:AJUSTAR_STOCK:Redmi 9A:10])
- Para registrar venta rápida: [ACCION:VENTA_RAPIDA:CLIENTE:MODELO:CANTIDAD:MONEDA:PAGADO] (ej: [ACCION:VENTA_RAPIDA:Ivan:Redmi 9A:1:USD:true])
- Para agregar o reingresar pantallas: [ACCION:AGREGAR_PRODUCTO:MARCA:MODELO:CALIDAD:PRECIO:CANTIDAD] (ej: [ACCION:AGREGAR_PRODUCTO:SAMSUNG:A04:ORIGINAL C/M:14:5]). Si la pantalla ya existe en el catálogo, el sistema sumará automáticamente el stock al existente y la reactivará si estaba en 0 o agotada.

REGLA ESTRICTA DE FORMATO:
Tanto la MARCA como el MODELO y la CALIDAD deben estar SIEMPRE 100% EN MAYÚSCULAS en cualquier acción.

Si es una consulta normal de información (precios, stock, ventas, etc.), responde directamente sin etiquetas de acción.`;

    if (!geminiApiKey) {
      return '⚠️ GEMINI_API_KEY no está configurada en las variables de entorno del servidor.';
    }

    // Build embedded chat history to guarantee 100% compliant single-turn payload for Gemini API
    const history = getChatHistory(senderPhone);
    const historyBlock =
      history.length > 0
        ? `HISTORIAL DE LA CONVERSACIÓN RECIENTE:\n${history.map((h) => `${h.sender}: "${h.text}"`).join('\n')}\n\n`
        : '';

    const payloadText =
      `DATOS REALES DEL NEGOCIO:\n${JSON.stringify(adminContext, null, 2)}\n\n` +
      `${historyBlock}` +
      `MENSAJE ACTUAL DE OSVALDO:\n"${cleanPrompt}"`;

    const candidateModels = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash'];
    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: payloadText }] }],
            systemInstruction: { parts: [{ text: adminInstruction }] },
            generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (candidateText) {
            // Check for Action Tags execution with tolerant regexes
            const matchPagado = candidateText.match(/\[ACCION:MARCAR_PAGADO\s*:\s*#?([a-zA-Z0-9]+)\s*\]/i);
            if (matchPagado) {
              const result = await executeMarcarOrdenPagada(matchPagado[1].trim());
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            const matchPendiente = candidateText.match(/\[ACCION:MARCAR_PENDIENTE\s*:\s*#?([a-zA-Z0-9]+)\s*\]/i);
            if (matchPendiente) {
              const result = await executeMarcarOrdenPendiente(matchPendiente[1].trim());
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            const matchPrecio = candidateText.match(/\[ACCION:ACTUALIZAR_PRECIO\s*:\s*([^:]+?)\s*:\s*[\$]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:USD|usd)?\s*\]/i);
            if (matchPrecio) {
              const result = await executeActualizarPrecioProducto(matchPrecio[1].trim(), parseFloat(matchPrecio[2]));
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            const matchStock = candidateText.match(/\[ACCION:AJUSTAR_STOCK\s*:\s*([^:]+?)\s*:\s*([+-]?[0-9]+)\s*\]/i);
            if (matchStock) {
              const result = await executeAjustarStockProducto(matchStock[1].trim(), parseInt(matchStock[2], 10));
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            const matchVenta = candidateText.match(/\[ACCION:VENTA_RAPIDA\s*:\s*([^:]+?)\s*:\s*([^:]+?)\s*:\s*([0-9]+)\s*:\s*(USD|CUP)\s*:\s*(true|false)\s*\]/i);
            if (matchVenta) {
              const result = await executeRegistrarVentaRapida({
                cliente: matchVenta[1].trim(),
                modeloProducto: matchVenta[2].trim(),
                cantidad: parseInt(matchVenta[3], 10),
                moneda: matchVenta[4].trim().toUpperCase() as 'USD' | 'CUP',
                pagado: matchVenta[5].toLowerCase() === 'true',
              });
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            const matchAgregar = candidateText.match(/\[ACCION:AGREGAR_PRODUCTO\s*:\s*([^:]+?)\s*:\s*([^:]+?)\s*:\s*([^:]+?)\s*:\s*([0-9]+(?:\.[0-9]+)?)\s*:\s*([0-9]+)\s*\]/i);
            if (matchAgregar) {
              const result = await executeAgregarOActualizarProductoWhatsApp({
                marca: matchAgregar[1].trim().toUpperCase(),
                modelo: matchAgregar[2].trim().toUpperCase(),
                calidad: matchAgregar[3].trim().toUpperCase(),
                precio: parseFloat(matchAgregar[4]),
                cantidad: parseInt(matchAgregar[5], 10),
              });
              appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
              appendChatHistory(senderPhone, 'Asistente', result.message);
              return result.message;
            }

            appendChatHistory(senderPhone, 'Osvaldo', cleanPrompt);
            appendChatHistory(senderPhone, 'Asistente', candidateText);
            return candidateText;
          }
        } else {
          const errText = await res.text();
          console.warn(`[Gemini Admin query status ${res.status} on ${model}]:`, errText);
        }
      } catch (err) {
        console.warn(`[Gemini Admin query error on ${model}]:`, err);
      }
    }

    return '⚠️ La IA tardó en responder. Si deseas cambiar un precio o consultar stock, puedes pedirlo directamente: *"Precio de [modelo] cambiar a [precio]"* o *"Stock de [modelo]"*.';
  }

  // =========================================================================
  // PIPELINE B: CLIENTES Y TÉCNICOS EXTERNOS (AISLAMIENTO TOTAL DE SEGURIDAD)
  // =========================================================================
  const activeProducts = await Product.find({ isHidden: false })
    .select('marca modelo calidad precio stock')
    .lean();

  const publicCatalog = activeProducts.map((p) => ({
    marca: p.marca,
    modelo: p.modelo,
    calidad: p.calidad,
    precioUSD: p.precio,
    stockDisponible: p.stock > 0 ? `${p.stock} unidades` : 'Agotado',
  }));

  const clientInstruction = `Eres el asesor de ventas y atención al cliente de "EL ARCA DISPLAY CLUB" (taller y distribuidora de pantallas de celulares).
Estás respondiendo a un cliente o técnico por WhatsApp.

REGLAS DE SEGURIDAD Y PRIVACIDAD ESTRICTAS (OBLIGATORIAS):
1. NUNCA menciones ventas del negocio, ganancias, deudores, cuentas por cobrar ni mermas. Esos datos NO existen para ti.
2. Si el cliente pregunta cosas ajenas al catálogo o sobre finanzas, di amablemente que eres el asesor de repuestos y pantallas disponibles.
3. Da información clara y cordial: precios en dólares USD, modelos compatibles, calidades disponibles (Original, Incell, OLED, etc.) y si hay stock.
4. Usa formato de WhatsApp con negritas (*texto*), viñetas con guiones (-) y emojis amables. Sé breve y profesional.`;

  if (!geminiApiKey) {
    return '¡Hola! En este momento nuestro sistema de atención automatizada está en mantenimiento. Por favor escríbenos en unos minutos.';
  }

  const clientHistory = getChatHistory(senderPhone);
  const clientHistoryBlock =
    clientHistory.length > 0
      ? `HISTORIAL DE LA CONVERSACIÓN RECIENTE:\n${clientHistory.map((h) => `${h.sender}: "${h.text}"`).join('\n')}\n\n`
      : '';

  const clientPayload =
    `CATÁLOGO PÚBLICO ACTUAL:\n${JSON.stringify(publicCatalog, null, 2)}\n\n` +
    `${clientHistoryBlock}` +
    `PREGUNTA DEL CLIENTE:\n"${cleanPrompt}"`;

  const candidateModels = ['gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash'];
  for (const model of candidateModels) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: clientPayload }] }],
          systemInstruction: { parts: [{ text: clientInstruction }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          appendChatHistory(senderPhone, 'Cliente', cleanPrompt);
          appendChatHistory(senderPhone, 'Asistente', text);
          return text;
        }
      }
    } catch (err) {
      console.warn(`[Gemini Client query failed on ${model}]`, err);
    }
  }

  return '¡Hola! En este momento no pude consultar el inventario. Por favor escribe de nuevo en un minuto y con gusto te atiendo.';
}
