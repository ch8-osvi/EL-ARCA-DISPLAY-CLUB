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
import { executeAgregarLoteBulk, executeFusionarProductos, getCatalogoForContext } from '@/lib/ai/adminTools';
import { parseBatchProductsFromText } from '@/lib/ai/batchParser';
import { getActiveExchangeRate } from '@/lib/exchangeRate';
import { roundCupPrice } from '@/lib/searchUtils';
import { WhatsAppLog } from '@/lib/models/WhatsAppLog';
import { getWhatsAppConfig } from '@/lib/models/WhatsAppConfig';
import {
  extractActionTags,
  executeActions,
  isDuplicateQuery,
  parseMergeCommand,
  isCupConversionQuery,
  detectBrandInPrompt,
  isInventoryAggregateQuery,
} from '@/lib/ai/actionExecutor';
import { detectDuplicates } from '@/lib/duplicateDetector';
import { getCanonicalBrand } from '@/lib/brandUtils';

/** Standardizes phone numbers to digits only */
export function normalizePhoneNumber(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/** Resolves WhatsApp internal LIDs (Linked Device Identifiers) to real telephone numbers */
export function resolveCanonicalPhone(phone: string): string {
  const clean = normalizePhoneNumber(phone);
  // WhatsApp LID asignado por Baileys al dispositivo de Osvaldo (+53 52031972)
  if (clean === '113198191661280') {
    return '5352031972';
  }
  return clean;
}

/** Check if the phone belongs to the verified business owner or dynamic admins */
export async function isPhoneAuthorizedAdmin(phone: string): Promise<boolean> {
  const normalized = resolveCanonicalPhone(phone);
  if (!normalized) return false;
  if (
    normalized === '5352031972' ||
    normalized.endsWith('52031972') ||
    normalized === '113198191661280'
  ) {
    return true;
  }
  const envAdmin = normalizePhoneNumber(process.env.ADMIN_PHONE_NUMBER || '');
  if (envAdmin && (normalized === envAdmin || normalized.endsWith(envAdmin))) return true;
  try {
    const config = await getWhatsAppConfig();
    return (config.adminPhones || []).some((p) => {
      const clean = resolveCanonicalPhone(p);
      return clean === normalized || normalized.endsWith(clean);
    });
  } catch {
    return false;
  }
}

/** Check if the phone is blacklisted/blocked */
export async function isPhoneBlacklisted(phone: string): Promise<boolean> {
  const normalized = resolveCanonicalPhone(phone);
  if (!normalized) return false;
  try {
    const config = await getWhatsAppConfig();
    return (config.blacklistedPhones || []).some((p) => {
      const clean = resolveCanonicalPhone(p);
      return clean === normalized || normalized.endsWith(clean);
    });
  } catch {
    return false;
  }
}

/** Legacy sync helper */
export function isAdminUser(phone: string): boolean {
  const normalized = resolveCanonicalPhone(phone);
  const adminPhone = normalizePhoneNumber(process.env.ADMIN_PHONE_NUMBER || '5352031972');
  return (
    normalized === adminPhone ||
    normalized === '5352031972' ||
    normalized.endsWith('52031972') ||
    normalized === '113198191661280'
  );
}

/** Helper to log WhatsApp conversation turns to MongoDB */
export async function logInteraction(
  senderPhone: string,
  role: 'admin' | 'client',
  userMessage: string,
  botReply: string,
  responseTimeMs: number,
  actionExecuted = ''
) {
  try {
    const canonical = resolveCanonicalPhone(senderPhone);
    const resolvedRole = (await isPhoneAuthorizedAdmin(canonical)) ? 'admin' : role;
    await WhatsAppLog.create({
      senderPhone: canonical,
      role: resolvedRole,
      userMessage,
      botReply,
      actionExecuted,
      responseTimeMs,
    });
  } catch (err) {
    console.warn('[WhatsApp Log Warning]', err);
  }
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

/** Sends a message to a WhatsApp user via Baileys Bridge, Whapi.cloud Gateway or Meta Cloud API */
export async function sendWhatsAppMessage(to: string, messageText: string): Promise<boolean> {
  const isVercelCloud = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  const configuredBridgeUrl = process.env.WHATSAPP_BRIDGE_URL;
  // Solo usar localhost si estamos en desarrollo local o si fue configurado explícitamente
  const bridgeUrl = configuredBridgeUrl || (!isVercelCloud ? 'http://localhost:7860' : null);
  const bridgeSecret = process.env.WHATSAPP_BRIDGE_SECRET || 'el_arca_bridge_secret_2026';
  const whapiToken = process.env.WHAPI_TOKEN;
  const metaToken = process.env.WHATSAPP_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // 0. Preferred: Local/Cloud Baileys Bridge
  if (bridgeUrl) {
    try {
      const cleanTo = normalizePhoneNumber(to);
      const res = await fetch(`${bridgeUrl.replace(/\/$/, '')}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: bridgeSecret,
          to: cleanTo,
          text: messageText,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Si el puente local no responde o falla, continúa con los otros proveedores
    }
  }

  // 1. Fallback: Whapi.cloud Gateway
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
  const startTime = Date.now();
  await connectToDatabase();

  const cleanPhone = resolveCanonicalPhone(senderPhone);

  // 1. Blacklist check (Bloqueo de números)
  if (await isPhoneBlacklisted(cleanPhone)) {
    console.log(`[WhatsApp Bot] Número en lista negra: +${cleanPhone}. Mensaje ignorado.`);
    return '';
  }

  const isAdmin = await isPhoneAuthorizedAdmin(cleanPhone);
  const cleanPrompt = (userMessage || '').trim();
  const promptLower = cleanPrompt.toLowerCase();
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  // Tasa de cambio activa desde la base de datos de El Arca
  const rateDoc = await getActiveExchangeRate();
  const currentExchangeRate = rateDoc && rateDoc.rate ? rateDoc.rate : 340;

  // PREGUNTA DIRECTA DE IDENTIDAD: "¿Soy administrador?", "¿Quién soy?"
  if (
    promptLower.includes('soy administrador') ||
    promptLower.includes('soy admin') ||
    promptLower === 'quien soy' ||
    promptLower === 'quién soy'
  ) {
    let reply: string;
    if (isAdmin) {
      reply =
        `👑 *¡Hola Osvaldo!* Sí, estás reconocido como *Administrador* de El Arca Display Club.\n\n` +
        `Tienes acceso total para:\n` +
        `• *Cambiar precios:* _"cambiar precio de [modelo] a [precio]"_\n` +
        `• *Consultar stock real:* _"stock de [modelo]"_\n` +
        `• *Ver finanzas:* _"cuanto vendi hoy"_, _"deudores"_\n` +
        `• *Registrar ventas y lotes masivos.*`;
    } else {
      reply =
        `👋 Hola. Este número está registrado como *Cliente / Técnico* de El Arca Display Club.\n\n` +
        `Tienes acceso a todo nuestro catálogo de pantallas, disponibilidad y precios vigentes.\n\n` +
        `¿Qué modelo estás buscando hoy?`;
    }
    await logInteraction(cleanPhone, isAdmin ? 'admin' : 'client', cleanPrompt, reply, Date.now() - startTime);
    return reply;
  }

  // =========================================================================
  // PIPELINE A: ADMINISTRADOR / DUEÑO (+53 52031972 o Admins Configurados)
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
      appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(cleanPhone, 'Asistente', result.message);
      await logInteraction(cleanPhone, 'admin', cleanPrompt, result.message, Date.now() - startTime, 'AGREGAR_LOTE');
      return result.message;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 1: DIRECT PRICE UPDATE COMMAND
    // Instant execution in < 50ms with 0% chance of AI failure
    // -----------------------------------------------------------------------
    const directPrice = parseDirectPriceCommand(cleanPrompt);
    if (directPrice) {
      const result = await executeActualizarPrecioProducto(directPrice.model, directPrice.price);
      appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(cleanPhone, 'Asistente', result.message);
      await logInteraction(cleanPhone, 'admin', cleanPrompt, result.message, Date.now() - startTime, 'ACTUALIZAR_PRECIO');
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
        const cupEq = roundCupPrice(product.precio, currentExchangeRate);
        reply =
          `📦 *${product.marca} ${product.modelo} (${product.calidad})*\n\n` +
          `• Precio de venta: *$${product.precio.toFixed(2)} USD* (${Number.isFinite(cupEq) ? `*$${cupEq.toLocaleString()} CUP* a tasa 1x${currentExchangeRate}` : ''})\n` +
          `• Stock en almacén: *${product.stock} unidades* ${product.stock > 0 ? '✅ Disponible' : '⚠️ Agotado'}`;
      } else {
        reply = `❌ No encontré ningún producto que coincida con "${directStock}" en el catálogo.`;
      }
      appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(cleanPhone, 'Asistente', reply);
      await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'CONSULTA_STOCK');
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
      await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'VENTAS_HOY');
      return reply;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 5: DUPLICATE DETECTION ("mostrar duplicados", "hay duplicados?")
    // -----------------------------------------------------------------------
    if (isDuplicateQuery(cleanPrompt)) {
      const detected = detectDuplicates(products as any, 75);
      let reply: string;
      if (detected.length === 0) {
        reply = `✅ *Inventario Verificado y Libre de Duplicados*\n\nRevisé todo el catálogo activo (${products.length} productos) y no se detectan repuestos multi-compatibles ni pantallas duplicadas sin unificar.\n\nTodo el stock está completamente limpio y al día.`;
      } else {
        const lines = [
          `🔍 *Detecté ${detected.length} posible${detected.length === 1 ? '' : 's'} par${detected.length === 1 ? '' : 'es'} de repuestos duplicados:*\n`,
        ];
        detected.forEach((dp, idx) => {
          const pA = dp.productA;
          const pB = dp.productB;
          const combinedStock = (pA.stock || 0) + (pB.stock || 0);
          lines.push(
            `*${idx + 1}. [${pA.marca}] Coincidencia: ${dp.score}%*\n` +
            `   • *Opción A:* \`${pA.modelo}\` (${pA.calidad}) — *${pA.stock} uds* ($${pA.precio} USD)\n` +
            `   • *Opción B:* \`${pB.modelo}\` (${pB.calidad}) — *${pB.stock} uds* ($${pB.precio} USD)\n` +
            `   • *Stock unificado total:* *${combinedStock} unidades* | *Motivo:* ${dp.reasons.join(', ')}`
          );
        });
        lines.push(`\n💡 *Para unir:* Respóndeme *"une el par 1"* o *"fusiona el par 2 dejando la opción B"*.`);
        reply = lines.join('\n');
      }
      appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
      appendChatHistory(cleanPhone, 'Asistente', reply);
      await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'DETECTAR_DUPLICADOS');
      return reply;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 6: DIRECT MERGE COMMAND ("une el par 1")
    // -----------------------------------------------------------------------
    const looksLikeMerge = /(?:une|unir|fusiona|fusionar)\s+(?:el\s+)?par\s+\d+/i.test(cleanPrompt);
    if (looksLikeMerge) {
      const mergeCmd = parseMergeCommand(cleanPrompt, detectDuplicates(products as any, 75));
      if (mergeCmd) {
        const res = await executeFusionarProductos({
          queryPrincipal: mergeCmd.queryPrincipal,
          querySecundario: mergeCmd.querySecundario,
          nuevoModelo: mergeCmd.nuevoModelo,
          nuevoPrecio: mergeCmd.nuevoPrecio,
        });
        appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
        appendChatHistory(cleanPhone, 'Asistente', res.message);
        await logInteraction(cleanPhone, 'admin', cleanPrompt, res.message, Date.now() - startTime, 'FUSIONAR_PRODUCTOS');
        return res.message;
      }
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 7: CONVERSATIONAL CUP CONVERSION
    // -----------------------------------------------------------------------
    if (isCupConversionQuery(cleanPrompt)) {
      const recentAssistantTexts = (getChatHistory(cleanPhone) || [])
        .slice(-4)
        .reverse()
        .map((h) => h.text || '')
        .join(' ');
      const usdMatch = recentAssistantTexts.match(/\$(\d+(?:\.\d+)?)/);
      if (usdMatch) {
        const usdVal = parseFloat(usdMatch[1]);
        const cupVal = roundCupPrice(usdVal, currentExchangeRate);
        const reply = `💵 *Conversión a CUP (Pesos Cubanos)*\n\nTomando el precio de *$${usdVal.toFixed(2)} USD* y la tasa oficial actual de *1 USD = ${currentExchangeRate} CUP*:\n\n• *Precio en CUP:* *${cupVal.toLocaleString()} CUP*`;
        appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
        appendChatHistory(cleanPhone, 'Asistente', reply);
        await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'CONVERSION_CUP');
        return reply;
      }
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 8: INVENTORY AND BRAND EXACT AUDIT
    // -----------------------------------------------------------------------
    const invCheck = isInventoryAggregateQuery(cleanPrompt);
    if (invCheck.isAggregate) {
      const availableProds = products.filter((p) => p.stock > 0);
      const outOfStockProds = products.filter((p) => p.stock === 0);
      const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);

      if (invCheck.brand) {
        const brandKey = invCheck.brand.toUpperCase();
        const brandProds = products.filter((p) => getCanonicalBrand(p.marca) === brandKey || p.marca.toUpperCase().includes(brandKey));
        const brandAvail = brandProds.filter((p) => p.stock > 0);
        const brandUnits = brandProds.reduce((acc, p) => acc + (p.stock || 0), 0);
        const brandAgot = brandProds.filter((p) => p.stock === 0);

        let reply =
          `📊 *Auditoría Exacta de Inventario — ${invCheck.brand}*\n\n` +
          `• Modelos disponibles con stock: *${brandAvail.length} modelos*\n` +
          `• Total unidades físicas: *${brandUnits} unidades*\n` +
          `• Modelos agotados: *${brandAgot.length} modelos* (de ${brandProds.length} registrados)\n\n` +
          `📋 *Modelos en stock:*\n` +
          brandAvail.map((p) => `• *${p.modelo}* (${p.calidad}) — *${p.stock} uds* ($${p.precio} USD)`).join('\n');

        appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
        appendChatHistory(cleanPhone, 'Asistente', reply);
        await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'AUDITORIA_INVENTARIO');
        return reply;
      } else {
        const reply =
          `📊 *Auditoría General de Inventario — Toda la Tienda*\n\n` +
          `• Modelos disponibles con stock: *${availableProds.length} modelos*\n` +
          `• Total de unidades físicas en stock: *${totalUnits} unidades*\n` +
          `• Modelos agotados (stock 0): *${outOfStockProds.length} modelos* (de ${products.length} totales en catálogo)`;

        appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
        appendChatHistory(cleanPhone, 'Asistente', reply);
        await logInteraction(cleanPhone, 'admin', cleanPrompt, reply, Date.now() - startTime, 'AUDITORIA_INVENTARIO');
        return reply;
      }
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
    };

    const catalogContext = await getCatalogoForContext();

    const adminInstruction = `Eres el Asistente Ejecutivo IA y socio de máxima confianza de Osvaldo en su negocio "EL ARCA DISPLAY CLUB" (taller especializado y distribuidora de pantallas de celulares en Cienfuegos, Cuba).
Estás chateando con él directamente en su WhatsApp.

═══════════════════════════════════════════════════════════════
🧠 DICCIONARIO SEMÁNTICO, ABREVIATURAS Y COMPATIBILIDADES
═══════════════════════════════════════════════════════════════
1. ABREVIATURAS DE MARCAS Y MODELOS:
   • "rm" o "redmi" = Xiaomi Redmi (ej: "rm 9a" = "Redmi 9A", "rm note 11" = "Redmi Note 11").
   • "sm" o "sam" = Samsung Galaxy (ej: "sm a32" = "Samsung A32", "sam a12" = "Samsung A12").
   • "ip" o "iph" = Apple iPhone (ej: "ip 11" = "iPhone 11").
   • "moto" = Motorola.
   • "inf" = Infinix.
   • "tec" = Tecno.
   • "pco" = Poco.
   • "hw" = Huawei / Honor.

2. MARCOS Y CALIDADES:
   • "c/m", "cm" o "con marco" = Pantalla con marco preinstalado (chasis).
   • "s/m", "sin marco" = Pantalla sin marco (solo display y táctil).
   • "incell" = Calidad LCD compatible económica.
   • "oled" / "amoled" = Calidad OLED de alta gama.
   • "orig" / "original" = Calidad Original / Servicio Oficial.

3. DETECCIÓN DE COMPATIBILIDADES MULTIMODELO (MUY IMPORTANTE):
   En el catálogo de repuestos, muchas pantallas son compatibles con varios modelos a la vez, listados con barras separadoras "/" (ej: "Samsung A12 / A125 / A127 / A02 / A32 5G / M12").
   Si Osvaldo pregunta por cualquiera de esos modelos, identifícalo de inmediato y ofrece los datos con total exactitud.

═══════════════════════════════════════════════════════════════
⚡ INSTRUCCIÓN PARA EJECUTAR ACCIONES REALES EN LA BASE DE DATOS
═══════════════════════════════════════════════════════════════
Cuando Osvaldo solicite una acción operativa o de gestión, emite de inmediato la etiqueta de acción correspondiente en formato JSON estricto:
- Crear orden completa: [ACCION:CREAR_ORDEN:{"clientName":"...","items":[{"modelo":"...","calidad":"...","precio":X,"qty":N}],"currency":"USD"|"CUP","paid":true|false}]
- Venta rápida: [ACCION:VENTA_RAPIDA:{"cliente":"...","modeloProducto":"...","cantidad":N,"moneda":"USD"|"CUP","pagado":true|false}]
- Cambiar precio: [ACCION:ACTUALIZAR_PRECIO:{"queryProducto":"...","nuevoPrecioUSD":X}]
- Cambiar calidad: [ACCION:ACTUALIZAR_CALIDAD:{"queryProducto":"...","nuevaCalidad":"..."}]
- Ajustar stock: [ACCION:AJUSTAR_STOCK:{"queryProducto":"...","cantidadAgregada":N,"motivo":"..."}]
- Marcar pagada: [ACCION:MARCAR_PAGADA:{"orderNumber":"..."}]
- Marcar pendiente: [ACCION:MARCAR_PENDIENTE:{"orderNumber":"..."}]
- Anular orden: [ACCION:ANULAR_ORDEN:{"orderNumber":"...","motivo":"..."}]
- Cambiar tasa de cambio: [ACCION:ACTUALIZAR_TASA_CAMBIO:{"nuevaTasa":X}]
- Agregar 1 producto: [ACCION:AGREGAR_PRODUCTO:{"marca":"...","modelo":"...","calidad":"...","precio":X,"stock":N}]
- Agregar lote: [ACCION:AGREGAR_LOTE:{"productos":[{"marca":"...","modelo":"...","calidad":"...","precio":X,"stock":N}]}]
- Ocultar producto: [ACCION:OCULTAR_PRODUCTO:{"queryProducto":"..."}]
- Modificar producto: [ACCION:MODIFICAR_PRODUCTO:{"queryProducto":"...","nuevoModelo":"...","nuevaCalidad":"...","nuevoPrecio":X}]
- Fusionar duplicados: [ACCION:FUSIONAR_PRODUCTOS:{"queryPrincipal":"...","querySecundario":"...","nuevoModelo":"...","nuevoPrecio":X}]

DIRECTRICES DE ESTILO PARA WHATSAPP:
1. Responde de forma natural, humana y ejecutiva de socio de taller.
2. Usa negritas (*texto*), viñetas con guiones (-) y emojis sobrios. NUNCA tablas markdown (|) ni encabezados con ###.
3. Si solo es una consulta de información, responde amablemente sin etiquetas de acción.`;

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
      `CATÁLOGO DE PRODUCTOS (AUDITADO EN TIEMPO REAL):\n${catalogContext}\n\n` +
      `${historyBlock}` +
      `MENSAJE ACTUAL DE OSVALDO:\n"${cleanPrompt}"`;

    const candidateModels = [
      'gemini-flash-lite-latest',
      'gemini-3.6-flash',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    
    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      if (i > 0) await sleep(1000);
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(18000),
          body: JSON.stringify({
            system_instruction: { parts: [{ text: adminInstruction }] },
            contents: [{ role: 'user', parts: [{ text: payloadText }] }],
            generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (candidateText) {
            const { cleanedResponse, actionResults, executedActionTypes } = await executeActions(candidateText);

            let replyText = candidateText;
            let actionName = executedActionTypes.join(', ');

            if (actionResults.length > 0) {
              replyText = actionResults.join('\n\n') + (cleanedResponse ? `\n\n${cleanedResponse}` : '');
            } else {
              // Backward-compatible fallback for legacy colon action regexes
              const matchPagado = candidateText.match(/\[ACCION:MARCAR_PAGADO\s*:\s*#?([a-zA-Z0-9]+)\s*\]/i);
              if (matchPagado) {
                const res = await executeMarcarOrdenPagada(matchPagado[1].trim());
                replyText = res.message;
                actionName = 'MARCAR_PAGADA';
              }
              const matchPrecio = candidateText.match(/\[ACCION:ACTUALIZAR_PRECIO\s*:\s*([^:]+?)\s*:\s*[\$]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:USD|usd)?\s*\]/i);
              if (matchPrecio) {
                const res = await executeActualizarPrecioProducto(matchPrecio[1].trim(), parseFloat(matchPrecio[2]));
                replyText = res.message;
                actionName = 'ACTUALIZAR_PRECIO';
              }
              const matchStock = candidateText.match(/\[ACCION:AJUSTAR_STOCK\s*:\s*([^:]+?)\s*:\s*([+-]?[0-9]+)\s*\]/i);
              if (matchStock) {
                const res = await executeAjustarStockProducto(matchStock[1].trim(), parseInt(matchStock[2], 10));
                replyText = res.message;
                actionName = 'AJUSTAR_STOCK';
              }
            }

            appendChatHistory(cleanPhone, 'Osvaldo', cleanPrompt);
            appendChatHistory(cleanPhone, 'Asistente', replyText);
            await logInteraction(cleanPhone, 'admin', cleanPrompt, replyText, Date.now() - startTime, actionName || 'CONSULTA');
            return replyText;
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

  // Fast-Path: Conversión rápida de precios a CUP para clientes
  if (isCupConversionQuery(cleanPrompt)) {
    const recentHistory = getChatHistory(cleanPhone);
    const recentTexts = recentHistory.slice(-4).reverse().map((h) => h.text).join(' ');
    const usdMatch = recentTexts.match(/\$(\d+(?:\.\d+)?)/);
    let reply = '';
    if (usdMatch) {
      const usdVal = parseFloat(usdMatch[1]);
      const cupVal = roundCupPrice(usdVal, currentExchangeRate);
      reply = `💵 El precio en pesos cubanos (CUP) es de *$${cupVal.toLocaleString()} CUP* (calculado con nuestra tasa oficial del día de *1 USD = ${currentExchangeRate} CUP*).\n\n¿Te gustaría apartar esta pantalla o pasar a recogerla por el taller?`;
    } else {
      reply = `💵 Nuestra tasa de cambio oficial hoy en El Arca Display Club es de *1 USD = ${currentExchangeRate} CUP*. Aceptamos pagos en efectivo y transferencias bancarias en CUP.\n\n¿Qué modelo de pantalla estás buscando para darte el precio exacto?`;
    }
    const finalReply = `${reply}\n\n_Mensaje generado automáticamente por el asistente IA de El Arca Display Club_`;
    appendChatHistory(cleanPhone, 'Cliente', cleanPrompt);
    appendChatHistory(cleanPhone, 'Asistente', finalReply);
    await logInteraction(cleanPhone, 'client', cleanPrompt, finalReply, Date.now() - startTime, 'CONVERSION_CUP');
    return finalReply;
  }

  // Carga del catálogo completo (incluyendo modelos en 0 para saber si están temporalmente agotados)
  const activeProducts = await Product.find({ isHidden: false })
    .select('marca modelo calidad precio stock')
    .lean();

  const catalogLines = activeProducts.map((p) => {
    const cupPrice = roundCupPrice(p.precio, currentExchangeRate);
    const status = p.stock <= 0 ? 'Agotado temporalmente' : p.stock <= 2 ? 'Últimas unidades' : 'Disponible';
    return `• ${p.marca} ${p.modelo} (${p.calidad}): $${p.precio.toFixed(2)} USD (~$${Number.isFinite(cupPrice) ? cupPrice.toLocaleString() : 0} CUP) [${status}]`;
  });

  const clientHistory = getChatHistory(cleanPhone);
  const isOngoing = clientHistory.length > 0;

  const clientInstruction = `Eres el asesor técnico de ventas y atención al cliente de "EL ARCA DISPLAY CLUB" (taller especializado y distribuidora de pantallas de teléfonos celulares en Cienfuegos, Cuba).
Estás chateando en tiempo real con un cliente o técnico por WhatsApp.

TASA OFICIAL DE CAMBIO HOY EN EL ARCA: 1 USD = ${currentExchangeRate} CUP.
ESTADO DE LA CONVERSACIÓN: ${
    isOngoing
      ? 'CONVERSACIÓN EN CURSO (PROHIBIDO volver a saludar con "¡Hola! Bienvenido...". Habla directo, cordial y fluido como una persona real).'
      : 'PRIMER CONTACTO (Saluda amablemente y breve: "¡Hola! 👋 Bienvenido a EL ARCA DISPLAY CLUB 📱").'
  }

═══════════════════════════════════════════════════════════════
🧠 DICCIONARIO SEMÁNTICO Y ABREVIATURAS POPULARES EN CUBA
═══════════════════════════════════════════════════════════════
Reconoce y comprende con total soltura los modismos y abreviaturas técnicas de los clientes en Cuba:
• "rm" o "redmi" = Xiaomi Redmi (ej: "rm 9a", "rm note 11").
• "sam" o "sm" = Samsung Galaxy (ej: "sam a12", "sm a32").
• "ip" o "iph" = Apple iPhone (ej: "ip 11", "ip xr").
• "moto" = Motorola.
• "inf" = Infinix.
• "tec" = Tecno.
• "pco" = Poco.
• "hw" = Huawei / Honor.
• "c/m", "cm", "con marco" = Pantalla con marco preinstalado (chasis).
• "s/m", "sin marco" = Pantalla sin marco (solo display y táctil).
• "incell" = Calidad LCD compatible económica y funcional.
• "oled" / "amoled" = Calidad OLED de gama alta con colores vivos y negros puros.
• "original" = Calidad Original / Servicio Oficial de máxima fidelidad.
• "display", "pantalla", "tactil", "lcd", "modulo", "vidrio" = Repuesto de pantalla completa.

═══════════════════════════════════════════════════════════════
🔄 COMPATIBILIDADES MULTIMODELO (MUY IMPORTANTE)
═══════════════════════════════════════════════════════════════
En el catálogo, muchas pantallas son compatibles con varios modelos a la vez, listados con barras separadoras "/" (por ejemplo: "Samsung A12 / A125 / A127 / A02 / A32 5G / M12").
• Si un cliente te pregunta por "Samsung A02" o "A32 5G", DEBES reconocer de inmediato que este display multi-compatible le sirve a su equipo al 100%. Explícaselo con confianza: *"¡Sí, tenemos pantalla para Samsung A02! Es el módulo original compatible con Samsung A12 / A02 / A32 5G / M12..."*.

═══════════════════════════════════════════════════════════════
🔒 REGLAS ESTRICTAS DE INFORMACIÓN Y PRIVACIDAD
═══════════════════════════════════════════════════════════════
1. PRIVACIDAD DE STOCK: NUNCA digas números exactos de unidades ("quedan 14", "hay 3 unidades"). Di únicamente:
   - "Stock disponible 🟢" (si hay existencia normal).
   - "⚠️ Bajo stock (últimas unidades disponibles)" (si quedan 1 o 2).
   - "❌ Agotado temporalmente" (si el producto está en catálogo pero en stock 0).
2. PRECIOS: Muestra SIEMPRE el precio en USD acompañado de su equivalente calculado en CUP al cambio oficial del día de 1x${currentExchangeRate}. Ejemplo: "*$12 USD* (~*$${(12 * currentExchangeRate).toLocaleString()} CUP*)".
3. UBICACIÓN REAL: Nuestro taller central y almacén está ubicado en Cienfuegos, Cuba. Si preguntan por envíos, explica que coordinamos envíos interprovinciales a otras provincias de Cuba. NUNCA digas que estamos en La Habana.
4. TALLER E INSTALACIÓN: Contamos con taller especializado en Cienfuegos para montaje y cambio de pantalla con garantía, o vendemos la pieza suelta para que la instale su técnico de confianza.
5. GARANTÍA: Todas nuestras pantallas cuentan con garantía de prueba en taller con flex sin retirar sellos ni plásticos protectores antes de pegar.
6. MÉTODOS DE PAGO: Aceptamos USD en efectivo, CUP en efectivo y transferencias en CUP según la tasa del día.
7. SEGURIDAD: NUNCA menciones finanzas, deudas, ganancias ni costos de compra del negocio.
8. TONO: Humano, cálido, ágil, educado y profesional. Evita responder con listas robóticas estáticas. Conversa con naturalidad.`;

  if (!geminiApiKey) {
    return '¡Hola! En este momento nuestro sistema de atención automatizada está en mantenimiento. Por favor escríbenos en unos minutos.';
  }

  const clientHistoryBlock =
    clientHistory.length > 0
      ? `HISTORIAL DE LA CONVERSACIÓN RECIENTE:\n${clientHistory.map((h) => `${h.sender}: "${h.text}"`).join('\n')}\n\n`
      : '';

  const clientPayload =
    `CATÁLOGO DISPONIBLE DE PANTALLAS (Tasa oficial: 1 USD = ${currentExchangeRate} CUP):\n${catalogLines.join('\n')}\n\n` +
    `${clientHistoryBlock}` +
    `MENSAJE DEL CLIENTE:\n"${cleanPrompt}"`;

  const candidateModels = [
    'gemini-flash-lite-latest',
    'gemini-3.6-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < candidateModels.length; i++) {
    const model = candidateModels[i];
    if (i > 0) await sleep(1000);
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(18000),
        body: JSON.stringify({
          system_instruction: { parts: [{ text: clientInstruction }] },
          contents: [{ role: 'user', parts: [{ text: clientPayload }] }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 800 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const finalReply = `${text.trim()}\n\n_Mensaje generado automáticamente por el asistente IA de El Arca Display Club_`;
          appendChatHistory(cleanPhone, 'Cliente', cleanPrompt);
          appendChatHistory(cleanPhone, 'Asistente', finalReply);
          await logInteraction(cleanPhone, 'client', cleanPrompt, finalReply, Date.now() - startTime);
          return finalReply;
        }
      }
    } catch (err) {
      console.warn(`[Gemini Client query failed on ${model}]`, err);
    }
  }

  const fallbackMsg = '¡Hola! En este momento no pude consultar el inventario. Por favor escribe de nuevo en un minuto y con gusto te atiendo.\n\n_Mensaje generado automáticamente por el asistente IA de El Arca Display Club_';
  await logInteraction(cleanPhone, 'client', cleanPrompt, fallbackMsg, Date.now() - startTime);
  return fallbackMsg;
}
