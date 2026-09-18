import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaDateKey, getHavanaDaysAgoKey } from '@/lib/dateUtils';
import {
  findProductSmart,
  executeMarcarOrdenPagada,
  executeMarcarOrdenPendiente,
  executeActualizarPrecioProducto,
  executeAjustarStockProducto,
  executeRegistrarVentaRapida,
} from './tools';

/** Standardizes phone numbers to digits only */
export function normalizePhoneNumber(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

/** Check if the phone belongs to the verified business owner */
export function isAdminUser(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone);
  const adminPhone = normalizePhoneNumber(process.env.ADMIN_PHONE_NUMBER || '5352031972');
  // Match exact phone or phone ending with Cuba number (52031972)
  return normalized === adminPhone || normalized === '5352031972' || normalized.endsWith('52031972');
}

/** In-memory multi-turn conversation sliding window per phone number (15-minute TTL) */
interface ChatTurn {
  role: 'user' | 'model';
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

function appendChatHistory(phone: string, role: 'user' | 'model', text: string) {
  const list = getChatHistory(phone);
  list.push({ role, text, time: Date.now() });
  // Keep max 8 turns (4 exchanges) for optimal token balance and fast latency
  if (list.length > 8) list.splice(0, list.length - 8);
  conversationHistories.set(phone, list);
}

/** Sends a message to a WhatsApp user via Whapi.cloud Gateway or Meta Cloud API */
export async function sendWhatsAppMessage(to: string, messageText: string): Promise<boolean> {
  const whapiToken = process.env.WHAPI_TOKEN;
  const metaToken = process.env.WHATSAPP_TOKEN;
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // 1. Preferred: Whapi.cloud Gateway (Independent, zero-ban, works with any number)
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
  const geminiApiKey = process.env.GEMINI_API_KEY;

  // =========================================================================
  // PIPELINE A: ADMINISTRADOR / DUEÑO (+53 52031972)
  // =========================================================================
  if (isAdmin) {
    // -----------------------------------------------------------------------
    // FAST-PATH 1: DIRECT PRICE UPDATE COMMAND
    // Handles expressions like:
    // - "Precio de la redmi 9a cambiar a 13 usd"
    // - "Cambiar precio de redmi 9a a 13 usd"
    // - "Poner redmi 9a a 13"
    // - "Actualizar precio de samsung a04 a 22"
    // -----------------------------------------------------------------------
    const directPriceMatch =
      cleanPrompt.match(/(?:cambiar|actualizar|poner|subir|bajar)\s+(?:el\s+)?precio\s+(?:de\s+)?(?:la\s+|el\s+)?(.+?)\s+a\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:usd)?$/i) ||
      cleanPrompt.match(/precio\s+(?:de\s+)?(?:la\s+|el\s+)?(.+?)\s+(?:cambiar|poner|actualizar)\s+a\s+[\$]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:usd)?$/i);

    if (directPriceMatch) {
      const modelQuery = directPriceMatch[1].trim();
      const newPrice = parseFloat(directPriceMatch[2]);
      const result = await executeActualizarPrecioProducto(modelQuery, newPrice);
      appendChatHistory(senderPhone, 'user', cleanPrompt);
      appendChatHistory(senderPhone, 'model', result.message);
      return result.message;
    }

    // -----------------------------------------------------------------------
    // Fetch live business data for context & fast-paths
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
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      moneda: s.currency,
      fecha: getHavanaDateKey(s.createdAt),
      nota: s.notes || '',
    }));

    // -----------------------------------------------------------------------
    // FAST-PATH 2: DIRECT DEBTORS QUERY ("Quien me debe dinero", "deudores")
    // -----------------------------------------------------------------------
    if (
      promptLower.includes('quien me debe') ||
      promptLower.includes('quién me debe') ||
      promptLower === 'deudores' ||
      promptLower === 'quien me debe dinero' ||
      promptLower === 'quién me debe dinero' ||
      promptLower.includes('cuentas por cobrar')
    ) {
      appendChatHistory(senderPhone, 'user', cleanPrompt);
      if (debtorsSummary.length === 0) {
        const reply = '🎉 *¡Excelentes noticias Osvaldo!* No hay clientes con deudas pendientes en este momento. Todas las órdenes están saldadas al 100%.';
        appendChatHistory(senderPhone, 'model', reply);
        return reply;
      }
      const lines = debtorsSummary.map(
        (d) =>
          `👤 *${d.cliente}* (Orden #${d.orden})\n   ↳ Monto: *${d.moneda === 'CUP' ? `${d.totalCUP?.toLocaleString()} CUP` : `$${d.totalUSD?.toFixed(2)} USD`}*${d.nota ? ` - _${d.nota}_` : ''} (Fecha: ${d.fecha})`
      );
      const totalUSD = debtorsSummary.reduce((acc, d) => acc + (d.totalUSD || 0), 0);
      const reply = `📋 *Cuentas Pendientes de Cobro (${debtorsSummary.length} órdenes)*:\n\n${lines.join('\n\n')}\n\n💵 *Total pendiente:* *$${totalUSD.toFixed(2)} USD*`;
      appendChatHistory(senderPhone, 'model', reply);
      return reply;
    }

    // -----------------------------------------------------------------------
    // FAST-PATH 3: DIRECT TODAY SALES QUERY ("Cuanto vendi hoy", "ventas hoy")
    // -----------------------------------------------------------------------
    if (
      promptLower === 'cuanto vendi hoy' ||
      promptLower === 'cuánto vendí hoy' ||
      promptLower === 'ventas hoy' ||
      promptLower === 'ventas de hoy' ||
      promptLower.includes('cuanto se vendio hoy')
    ) {
      appendChatHistory(senderPhone, 'user', cleanPrompt);
      const reply =
        `📊 *Ventas de Hoy (${havanaTodayKey})*\n\n` +
        `• Total en USD: *$${todayTot.usd.toFixed(2)} USD*\n` +
        `• Total en CUP: *${todayTot.cup.toLocaleString()} CUP*\n` +
        `• Órdenes realizadas: *${todayTot.count}*\n` +
        `• Repuestos vendidos: *${todayTot.itemsCount} unidades*\n` +
        (todayTot.usd > 0 || todayTot.cup > 0 ? '🔥 ¡Excelente ritmo!' : '📦 Aún no hay ventas registradas el día de hoy.');
      appendChatHistory(senderPhone, 'model', reply);
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
5. Recuerda el contexto de los mensajes anteriores en la conversación. Si Osvaldo dice "cambiar el precio a 13" o "cuántas quedan de esa", sabe qué producto se estaba hablando previamente.

INSTRUCCIÓN PARA EJECUTAR ACCIONES REALES EN LA BASE DE DATOS:
Si Osvaldo te pide cambiar un precio, registrar venta, ajustar stock o marcar cobro, INCLUYE la etiqueta de acción correspondiente:
- Para cambiar precio: [ACCION:ACTUALIZAR_PRECIO:MODELO:NUEVO_PRECIO_USD] (ej: [ACCION:ACTUALIZAR_PRECIO:Redmi 9A:13])
- Para marcar orden pagada: [ACCION:MARCAR_PAGADO:CODIGO_ORDEN] (ej: [ACCION:MARCAR_PAGADO:0828QQL01])
- Para marcar orden pendiente: [ACCION:MARCAR_PENDIENTE:CODIGO_ORDEN]
- Para sumar o restar stock: [ACCION:AJUSTAR_STOCK:MODELO:CANTIDAD] (ej: [ACCION:AJUSTAR_STOCK:Redmi 9A:10])
- Para registrar venta rápida: [ACCION:VENTA_RAPIDA:CLIENTE:MODELO:CANTIDAD:MONEDA:PAGADO] (ej: [ACCION:VENTA_RAPIDA:Ivan:Redmi 9A:1:USD:true])

Si es una consulta normal de información (precios, stock, ventas, etc.), responde directamente sin etiquetas de acción.`;

    if (!geminiApiKey) {
      return '⚠️ GEMINI_API_KEY no está configurada en las variables de entorno del servidor.';
    }

    // Build multi-turn conversational contents
    const history = getChatHistory(senderPhone);
    const conversationContents: any[] = [];

    // Add previous turns (role: 'user' or 'model')
    for (const turn of history) {
      conversationContents.push({
        role: turn.role,
        parts: [{ text: turn.text }],
      });
    }

    // Current turn with business context
    conversationContents.push({
      role: 'user',
      parts: [
        {
          text: `Datos reales del negocio:\n${JSON.stringify(adminContext, null, 2)}\n\nMensaje de Osvaldo: "${cleanPrompt}"`,
        },
      ],
    });

    // Try calling official fast Gemini models
    const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: conversationContents,
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
              appendChatHistory(senderPhone, 'user', cleanPrompt);
              appendChatHistory(senderPhone, 'model', result.message);
              return result.message;
            }

            const matchPendiente = candidateText.match(/\[ACCION:MARCAR_PENDIENTE\s*:\s*#?([a-zA-Z0-9]+)\s*\]/i);
            if (matchPendiente) {
              const result = await executeMarcarOrdenPendiente(matchPendiente[1].trim());
              appendChatHistory(senderPhone, 'user', cleanPrompt);
              appendChatHistory(senderPhone, 'model', result.message);
              return result.message;
            }

            const matchPrecio = candidateText.match(/\[ACCION:ACTUALIZAR_PRECIO\s*:\s*([^:]+?)\s*:\s*[\$]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:USD|usd)?\s*\]/i);
            if (matchPrecio) {
              const result = await executeActualizarPrecioProducto(matchPrecio[1].trim(), parseFloat(matchPrecio[2]));
              appendChatHistory(senderPhone, 'user', cleanPrompt);
              appendChatHistory(senderPhone, 'model', result.message);
              return result.message;
            }

            const matchStock = candidateText.match(/\[ACCION:AJUSTAR_STOCK\s*:\s*([^:]+?)\s*:\s*([+-]?[0-9]+)\s*\]/i);
            if (matchStock) {
              const result = await executeAjustarStockProducto(matchStock[1].trim(), parseInt(matchStock[2], 10));
              appendChatHistory(senderPhone, 'user', cleanPrompt);
              appendChatHistory(senderPhone, 'model', result.message);
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
              appendChatHistory(senderPhone, 'user', cleanPrompt);
              appendChatHistory(senderPhone, 'model', result.message);
              return result.message;
            }

            appendChatHistory(senderPhone, 'user', cleanPrompt);
            appendChatHistory(senderPhone, 'model', candidateText);
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

    return '⚠️ No pude procesar la consulta en este momento con la IA. Si necesitas cambiar un precio o consultar stock, también puedes pedirlo directamente: *"Precio de [modelo] cambiar a [precio]"* o *"Stock de [modelo]"*.';
  }

  // =========================================================================
  // PIPELINE B: CLIENTES Y TÉCNICOS EXTERNOS (AISLAMIENTO TOTAL DE SEGURIDAD)
  // =========================================================================
  // Fetch ONLY active products. Zero financial metrics, zero debtors, zero tool declarations.
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
  const clientContents: any[] = [];

  for (const turn of clientHistory) {
    clientContents.push({
      role: turn.role,
      parts: [{ text: turn.text }],
    });
  }

  clientContents.push({
    role: 'user',
    parts: [
      {
        text: `Catálogo público actual:\n${JSON.stringify(publicCatalog, null, 2)}\n\nPregunta del cliente: "${cleanPrompt}"`,
      },
    ],
  });

  const candidateModels = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of candidateModels) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: clientContents,
          systemInstruction: { parts: [{ text: clientInstruction }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          appendChatHistory(senderPhone, 'user', cleanPrompt);
          appendChatHistory(senderPhone, 'model', text);
          return text;
        }
      }
    } catch (err) {
      console.warn(`[Gemini Client query failed on ${model}]`, err);
    }
  }

  return '¡Hola! En este momento no pude consultar el inventario. Por favor escribe de nuevo en un minuto y con gusto te atiendo.';
}
