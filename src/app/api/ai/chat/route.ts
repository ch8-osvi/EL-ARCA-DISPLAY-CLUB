import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
import { StockHistory } from '@/lib/models/StockHistory';
import { getHavanaDateKey, getHavanaDaysAgoKey } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai/chat
 * Analyzes store metrics and answers queries using either Google Gemini or built-in analytical engine.
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: 'La pregunta no puede estar vacía' },
        { status: 400 }
      );
    }

    const cleanPrompt = prompt.trim();
    const promptLower = cleanPrompt.toLowerCase();

    // 1. Fetch live data
    const [sales, products, mermasHistory] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Product.find({ isHidden: false }).lean(),
      StockHistory.find({ type: 'merma' }).sort({ createdAt: -1 }).lean(),
    ]);

    // 2. Compute date boundaries in Cuba timezone
    const now = new Date();
    const havanaTodayKey = getHavanaDateKey(now);
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const havanaYesterdayKey = getHavanaDateKey(yesterdayDate);
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const [curYear, curMonth] = havanaTodayKey.split('-');

    // 3. Segment sales by date in Cuba timezone
    const todaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaTodayKey);
    const yesterdaySales = sales.filter((s) => getHavanaDateKey(s.createdAt) === havanaYesterdayKey);
    const weekSales = sales.filter((s) => new Date(s.createdAt).getTime() >= weekStart);
    const monthSales = sales.filter((s) => {
      const [sYear, sMonth] = getHavanaDateKey(s.createdAt).split('-');
      return sYear === curYear && sMonth === curMonth;
    });

    // Helpers to sum sales
    const calcTotals = (saleList: any[]) => {
      let usd = 0;
      let cup = 0;
      let paidUSD = 0;
      let paidCUP = 0;
      let pendingUSD = 0;
      let itemsCount = 0;

      saleList.forEach((s) => {
        if (s.currency === 'CUP') {
          cup += s.totalCUP || 0;
          if (s.paid) paidCUP += s.totalCUP || 0;
        } else {
          usd += s.totalUSD || 0;
          if (s.paid) paidUSD += s.totalUSD || 0;
          else pendingUSD += s.totalUSD || 0;
        }
        (s.items || []).forEach((i: any) => {
          itemsCount += i.qty || 0;
        });
      });

      return { usd, cup, paidUSD, paidCUP, pendingUSD, count: saleList.length, itemsCount };
    };

    const todayTot = calcTotals(todaySales);
    const yesterdayTot = calcTotals(yesterdaySales);
    const weekTot = calcTotals(weekSales);
    const monthTot = calcTotals(monthSales);
    const allTot = calcTotals(sales);

    // 4. Pending / Debtors
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

    // 5. Product rankings (Top sellers)
    const modelSalesMap: Record<string, { modelo: string; marca: string; units: number; revenueUSD: number }> = {};
    sales.forEach((s) => {
      (s.items || []).forEach((item: any) => {
        const key = `${item.marca || 'VARIOS'} - ${item.modelo || 'Desconocido'}`;
        if (!modelSalesMap[key]) {
          modelSalesMap[key] = {
            modelo: item.modelo || 'Desconocido',
            marca: item.marca || 'VARIOS',
            units: 0,
            revenueUSD: 0,
          };
        }
        modelSalesMap[key].units += item.qty || 0;
        modelSalesMap[key].revenueUSD += (item.precioUSD || 0) * (item.qty || 0);
      });
    });

    const topModels = Object.values(modelSalesMap).sort((a, b) => b.units - a.units);

    // 6. Daily breakdown for the last 14 days in Cuba timezone
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

      last14DaysSummary.push({
        fecha: dateKey,
        etiqueta: label,
        ventasUSD: totals.usd,
        ventasCUP: totals.cup,
        ordenes: totals.count,
        repuestosVendidos: totals.itemsCount,
      });
    }

    // 7. Recent sales details (last 25 orders)
    const recentSalesDetails = sales.slice(0, 25).map((s) => ({
      orden: s.orderNumber,
      fecha: getHavanaDateKey(s.createdAt),
      cliente: s.clientName || 'Consumidor Final',
      articulos: (s.items || []).map((i: any) => `${i.qty}x ${i.marca} ${i.modelo} (${i.calidad})`).join(', '),
      moneda: s.currency,
      totalUSD: s.totalUSD,
      totalCUP: s.totalCUP,
      cobrado: s.paid ? 'SÍ' : 'PENDIENTE',
    }));

    // 8. Best sales day in history
    const daySalesMap: Record<string, { date: string; usd: number; cup: number; count: number }> = {};
    sales.forEach((s) => {
      const dateKey = getHavanaDateKey(s.createdAt);
      if (!daySalesMap[dateKey]) {
        daySalesMap[dateKey] = { date: dateKey, usd: 0, cup: 0, count: 0 };
      }
      daySalesMap[dateKey].count += 1;
      if (s.currency === 'CUP') {
        daySalesMap[dateKey].cup += s.totalCUP || 0;
      } else {
        daySalesMap[dateKey].usd += s.totalUSD || 0;
      }
    });

    const bestDay = Object.values(daySalesMap).sort((a, b) => b.usd - a.usd)[0] || null;

    // 9. Inventory status
    const lowStockProducts = products.filter((p) => p.stock <= 2 && p.stock > 0);
    const outOfStockProducts = products.filter((p) => p.stock === 0);
    const totalInventoryValue = products.reduce((acc, p) => acc + (p.precio * (p.stock || 0)), 0);

    // 10. Mermas, Defectives and Warranties Breakdown
    const totalMermaUnits = (mermasHistory || []).reduce((acc: number, m: any) => acc + (m.qty || 0), 0);
    const mermasByProductMap: Record<string, { producto: string; units: number; reasons: string[]; lastDate: string }> = {};

    (mermasHistory || []).forEach((m: any) => {
      const name = m.productName || 'Desconocido';
      if (!mermasByProductMap[name]) {
        mermasByProductMap[name] = {
          producto: name,
          units: 0,
          reasons: [],
          lastDate: m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-ES') : '',
        };
      }
      mermasByProductMap[name].units += m.qty || 0;
      if (m.reason) {
        const cleanReason = m.reason
          .replace(' [MERMA / ROTO / DEFECTUOSO - No apto para venta]', '')
          .replace(/Devolución Orden #[^:]+:\s*/i, '')
          .trim();
        if (cleanReason && !mermasByProductMap[name].reasons.includes(cleanReason)) {
          mermasByProductMap[name].reasons.push(cleanReason);
        }
      }
    });

    const topMermas = Object.values(mermasByProductMap).sort((a, b) => b.units - a.units);

    // -------------------------------------------------------------
    // Try Google Gemini API if GEMINI_API_KEY is defined
    // -------------------------------------------------------------
    let isQuotaExceeded = false;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      try {
        const contextPayload = {
          negocio: 'EL ARCA DISPLAY CLUB (Venta y distribución de pantallas de celulares)',
          monedas: 'USD (Dólares en efectivo) y CUP (Pesos cubanos)',
          hoy: {
            fecha: havanaTodayKey,
            ventasUSD: todayTot.usd,
            ventasCUP: todayTot.cup,
            ordenes: todayTot.count,
            repuestosVendidos: todayTot.itemsCount,
            pendienteUSD: todayTot.pendingUSD,
          },
          ayer: {
            fecha: havanaYesterdayKey,
            ventasUSD: yesterdayTot.usd,
            ventasCUP: yesterdayTot.cup,
            ordenes: yesterdayTot.count,
            repuestosVendidos: yesterdayTot.itemsCount,
          },
          desgloseDiarioUltimos14Dias: last14DaysSummary,
          ultimasVentasRegistradas: recentSalesDetails,
          ultimos7DiasAcumulado: {
            ventasUSD: weekTot.usd,
            ventasCUP: weekTot.cup,
            ordenes: weekTot.count,
          },
          esteMesAcumulado: {
            ventasUSD: monthTot.usd,
            ventasCUP: monthTot.cup,
            ordenes: monthTot.count,
          },
          historicoTotal: {
            ventasUSD: allTot.usd,
            ventasCUP: allTot.cup,
            ordenesTotales: allTot.count,
          },
          diaRecordHistorico: bestDay
            ? `Día ${bestDay.date} con $${bestDay.usd.toFixed(2)} USD y ${bestDay.count} órdenes`
            : 'Sin datos suficientes',
          ordenesPendientesCobro: debtorsSummary,
          top3ModelosMasVendidos: topModels.slice(0, 5),
          inventario: {
            totalModelosActivos: products.length,
            valorTotalInventarioUSD: totalInventoryValue.toFixed(2),
            modelosAgotados: outOfStockProducts.length,
            modelosBajoStock: lowStockProducts.length,
          },
          mermasYGarantias: {
            totalBajasMermasUds: totalMermaUnits,
            rankingModelosConProblemas: topMermas.map((m) => ({
              modelo: m.producto,
              unidadesEnMerma: m.units,
              motivosRegistrados: m.reasons,
              fechaUltimaBaja: m.lastDate,
            })),
            ultimosRegistrosDetallados: (mermasHistory || []).slice(0, 15).map((m: any) => ({
              producto: m.productName,
              cantidad: m.qty,
              motivo: m.reason,
              fecha: m.createdAt ? new Date(m.createdAt).toLocaleDateString('es-ES') : '',
            })),
          },
        };

        const systemInstruction = `Eres el asistente de negocios y mano derecha de Osvaldo en "EL ARCA DISPLAY CLUB" (tienda líder de pantallas y repuestos de teléfonos celulares).

DIRECTRICES DE TONO Y ESTILO (OBLIGATORIO):
1. Habla de forma completamente NATURAL, cercana, directa y fluida (de tú a tú, como un socio de confianza del taller).
2. NUNCA uses "Estimado", "Estimado cliente", "Estimado/a", ni fórmulas frías o robóticas como "Quedo a su entera disposición...". Sé fresco y humano: "¡Hola!", "¡Claro!", "Mira, te comento...", "En el sistema tenemos...", "Aquí tienes el desglose:".
3. Ve directo al grano sin introducciones largas ni despedidas acartonadas.

DIRECTRICES DE FORMATO VISUAL (MUY IMPORTANTE):
1. NO uses tablas de markdown con barras verticales (| col | col |) ni líneas de separación con dos puntos (:---:).
2. Organiza la información en listas limpias, tarjetas o bloques con emojis y viñetas simples con guiones (-).
3. Para listar deudores o clientes con pagos pendientes, usa este formato visual limpio y ordenado:
   📋 **Cuentas Pendientes de Cobro:**

   👤 **Nombre del Cliente** (Orden: \`CODIGO\` • Fecha)
   ↳ Monto adeudado: **$XX.XX USD** (o **XX,XXX CUP**) - *Nota si existe*

   💵 **Total Pendiente:** **$XX.XX USD** / **XX,XXX CUP** (X órdenes)
4. No uses encabezados con almohadillas (###). Usa títulos en negrita con emojis elegantes.
5. Tienes el desglose diario exacto de los últimos 14 días y las últimas 25 ventas individuales. Basa tus respuestas exclusivamente en los datos reales de la tienda.
6. Tienes el historial exacto de mermas, roturas y repuestos dados de baja por garantía en el taller (mermasYGarantias). Si preguntan por modelos con problemas de garantías, mermas, piezas con fallas o devoluciones, indica claramente cuáles modelos encabezan las bajas, cuántas unidades fallaron y los motivos registrados (fallas de táctil, flex roto, pantalla rota, etc.).`;

        // List of models to try in priority order (Google updated new API keys to gemini-3.6-flash and gemini-flash-latest)
        const candidateModels = [
          'gemini-3.6-flash',
          'gemini-flash-latest',
          'gemini-2.5-flash',
          'gemini-1.5-flash',
        ];

        let candidateText = '';
        for (const model of candidateModels) {
          try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text: `Contexto en tiempo real de la tienda:\n${JSON.stringify(contextPayload, null, 2)}\n\nPregunta del usuario: "${cleanPrompt}"`,
                      },
                    ],
                  },
                ],
                systemInstruction: {
                  parts: [{ text: systemInstruction }],
                },
                generationConfig: {
                  temperature: 0.2,
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
              console.warn(`Model ${model} hit rate limit (429 RESOURCE_EXHAUSTED).`);
            }
          } catch (modelErr) {
            console.warn(`Error querying model ${model}:`, modelErr);
          }
        }

        if (candidateText) {
          return NextResponse.json({
            success: true,
            answer: candidateText,
            source: 'gemini',
          });
        }

        if (isQuotaExceeded) {
          return NextResponse.json(
            {
              success: false,
              isQuotaExceeded: true,
              error: 'Has alcanzado el límite de 15 consultas por minuto de Google Gemini. Por favor espera unos segundos y vuelve a preguntar.',
            },
            { status: 429 }
          );
        }
      } catch (geminiErr) {
        console.error('Gemini API call error:', geminiErr);
        return NextResponse.json(
          {
            success: false,
            error: 'Ocurrió un error temporal al comunicarse con Google Gemini. Por favor intenta de nuevo en unos momentos.',
          },
          { status: 502 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'No se ha configurado la variable GEMINI_API_KEY en el servidor.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        isQuotaExceeded,
        error: isQuotaExceeded
          ? 'Has alcanzado el límite gratuito de velocidad de Google Gemini (15 consultas por minuto). Por favor espera un momento y vuelve a preguntar.'
          : 'La IA no pudo generar una respuesta en este momento. Por favor intenta nuevamente en unos momentos.',
      },
      { status: isQuotaExceeded ? 429 : 503 }
    );
  } catch (error) {
    console.error('[ai chat error]', error);
    return NextResponse.json(
      { success: false, error: 'Error procesando consulta de IA' },
      { status: 500 }
    );
  }
}
