import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaDateKey, getHavanaDaysAgoKey } from '@/lib/dateUtils';
import {
  ADMIN_TOOL_DECLARATIONS,
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
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    return '⚠️ El servicio de Inteligencia Artificial está en mantenimiento. Por favor intenta más tarde.';
  }

  // =========================================================================
  // PIPELINE A: ADMINISTRADOR / DUEÑO (+53 52031972)
  // =========================================================================
  if (isAdmin) {
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

    // Unpaid sales
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

    const adminInstruction = `Eres el asistente ejecutivo y mano derecha de Osvaldo en su negocio "EL ARCA DISPLAY CLUB".
Estás chateando con él directamente en su WhatsApp personal.

DIRECTRICES:
1. Habla de forma completamente natural, directa y cercana (de tú a tú, sin formalidades como "Estimado").
2. Formatea tus respuestas exclusivamente para WhatsApp: usa negritas con un solo asterisco (*texto*), viñetas con guiones (-) y emojis útiles.
3. NO uses tablas de markdown con barras (|) ni almohadillas (###).
4. Tienes disponibles HERRAMIENTAS (Function Calling) para:
   - Marcar órdenes como pagadas (marcar_orden_pagada) o pendientes (marcar_orden_pendiente).
   - Actualizar precios de productos (actualizar_precio_producto).
   - Agregar o restar stock en almacén (ajustar_stock_producto).
   - Registrar ventas rápidas (registrar_venta_rapida).
   Si Osvaldo te pide hacer cualquiera de estas acciones, invoca la herramienta correspondiente.`;

    // Try calling Gemini with Admin tools
    const candidateModels = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    for (const model of candidateModels) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `Datos reales del negocio:\n${JSON.stringify(adminContext, null, 2)}\n\nMensaje de Osvaldo: "${cleanPrompt}"`,
                  },
                ],
              },
            ],
            tools: [{ functionDeclarations: ADMIN_TOOL_DECLARATIONS }],
            systemInstruction: { parts: [{ text: adminInstruction }] },
            generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const firstCandidate = data?.candidates?.[0]?.content?.parts?.[0];

          // Check if Gemini invoked a tool (Function Call)
          if (firstCandidate?.functionCall) {
            const { name, args } = firstCandidate.functionCall;

            if (name === 'marcar_orden_pagada') {
              const result = await executeMarcarOrdenPagada(args.orderNumber);
              return result.message;
            } else if (name === 'marcar_orden_pendiente') {
              const result = await executeMarcarOrdenPendiente(args.orderNumber);
              return result.message;
            } else if (name === 'actualizar_precio_producto') {
              const result = await executeActualizarPrecioProducto(args.queryProducto, args.nuevoPrecioUSD);
              return result.message;
            } else if (name === 'ajustar_stock_producto') {
              const result = await executeAjustarStockProducto(args.queryProducto, args.cantidadAgregada, args.motivo);
              return result.message;
            } else if (name === 'registrar_venta_rapida') {
              const result = await executeRegistrarVentaRapida({
                cliente: args.cliente,
                modeloProducto: args.modeloProducto,
                cantidad: args.cantidad,
                moneda: args.moneda,
                pagado: args.pagado,
              });
              return result.message;
            }
          }

          if (firstCandidate?.text) {
            return firstCandidate.text;
          }
        }
      } catch (err) {
        console.warn(`[Gemini Admin query failed on ${model}]`, err);
      }
    }

    return '⚠️ No pude procesar la consulta en este momento. Por favor repite la pregunta en unos instantes.';
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

  const candidateModels = ['gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  for (const model of candidateModels) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Catálogo público actual:\n${JSON.stringify(publicCatalog, null, 2)}\n\nPregunta del cliente: "${cleanPrompt}"`,
                },
              ],
            },
          ],
          // ZERO TOOLS: Clients have no tools declared
          systemInstruction: { parts: [{ text: clientInstruction }] },
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch (err) {
      console.warn(`[Gemini Client query failed on ${model}]`, err);
    }
  }

  return '¡Hola! En este momento no pude consultar el inventario. Por favor escribe de nuevo en un minuto y con gusto te atiendo.';
}
