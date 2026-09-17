import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { Sale } from '@/lib/models/Sale';
import { Product } from '@/lib/models/Product';
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
    const [sales, products] = await Promise.all([
      Sale.find({}).sort({ createdAt: -1 }).lean(),
      Product.find({ isHidden: false }).lean(),
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

    // -------------------------------------------------------------
    // Try Google Gemini API if GEMINI_API_KEY is defined
    // -------------------------------------------------------------
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
        };

        const systemInstruction = `Eres el asistente inteligente de negocios de "EL ARCA DISPLAY CLUB", una tienda líder de pantallas y repuestos de teléfonos.
Tienes acceso directo y en tiempo real a la base de datos de ventas, catálogo y clientes.
Instrucciones:
1. Responde de forma cordial, profesional, ejecutiva y directa a la pregunta del dueño.
2. Usa formato Markdown con números en **negrita**, listas con viñetas elegantes y tablas si es conveniente.
3. Basa tus respuestas EXCLUSIVAMENTE en los datos reales suministrados en el contexto. No inventes números.
4. Tienes el desglose diario exacto de los últimos 14 días en "desgloseDiarioUltimos14Dias" (Hoy, Ayer, Hace 2 días, Hace 3 días, etc.) y las últimas 25 ventas individuales. Si el usuario te pregunta cuánto se vendió hace 2 días o cualquier día pasado, consulta ese bloque e informa los montos en USD y CUP con precisión.
5. Si te preguntan sobre quién debe dinero, desglosa los clientes y montos. Si preguntan sobre hoy o ayer, sé claro con los dólares y pesos.
6. Si no hay ventas registradas en una fecha determinada (0 órdenes), dilo amablemente con claridad.`;

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
      } catch (geminiErr) {
        console.warn('Gemini API call error, falling back to analytical engine:', geminiErr);
      }
    }

    // -------------------------------------------------------------
    // Native Analytical Engine (Instant, 100% Free, Zero-Dependency)
    // -------------------------------------------------------------
    let answer = '';

    // INTENT 1: Ventas de Hoy
    if (promptLower.includes('hoy') || promptLower.includes('today')) {
      if (todayTot.count === 0) {
        answer = `📅 **Ventas de Hoy**\n\nHoy aún no se han registrado órdenes en el sistema POS.\n\n* **Total en USD:** $0.00 USD\n* **Total en CUP:** 0.00 CUP\n* **Órdenes:** 0 órdenes\n\n*Apenas realices una venta en el Punto de Venta se reflejará aquí de inmediato.*`;
      } else {
        answer = `📊 **Reporte de Ventas de Hoy**\n\n` +
          `* **Total en Dólares:** **$${todayTot.usd.toFixed(2)} USD** (${todayTot.paidUSD.toFixed(2)} cobrados en mano)\n` +
          (todayTot.cup > 0 ? `* **Total en CUP:** **${todayTot.cup.toLocaleString()} CUP**\n` : '') +
          `* **Órdenes generadas:** **${todayTot.count} órdenes**\n` +
          `* **Displays despachados:** **${todayTot.itemsCount} unidades**\n` +
          (todayTot.pendingUSD > 0 ? `\n⚠️ **Nota:** Hay **$${todayTot.pendingUSD.toFixed(2)} USD** en órdenes pendientes de cobro el día de hoy.` : '');
      }
    }
    // INTENT 2: Ventas de Ayer
    else if (promptLower.includes('ayer') || promptLower.includes('yesterday')) {
      if (yesterdayTot.count === 0) {
        answer = `📅 **Ventas de Ayer**\n\nAyer no se registraron órdenes en el sistema.\n\n* **Total:** $0.00 USD (0 órdenes)`;
      } else {
        answer = `📆 **Reporte de Ventas de Ayer**\n\n` +
          `* **Total facturado:** **$${yesterdayTot.usd.toFixed(2)} USD**` +
          (yesterdayTot.cup > 0 ? ` y **${yesterdayTot.cup.toLocaleString()} CUP**` : '') + `\n` +
          `* **Órdenes cerradas:** **${yesterdayTot.count} órdenes**\n` +
          `* **Repuestos entregados:** **${yesterdayTot.itemsCount} displays**`;
      }
    }
    // INTENT 3: Deudores / Pagos Pendientes
    else if (
      promptLower.includes('debe') ||
      promptLower.includes('deben') ||
      promptLower.includes('pendiente') ||
      promptLower.includes('pagar') ||
      promptLower.includes('cobrar') ||
      promptLower.includes('credito') ||
      promptLower.includes('falta')
    ) {
      if (unpaidSales.length === 0) {
        answer = `🎉 **¡Buenas noticias!**\n\nNo tienes **ninguna orden pendiente de pago**. Todos los clientes han cancelado sus compras en su totalidad.`;
      } else {
        const totalPendingUSD = unpaidSales.reduce((acc, s) => acc + (s.totalUSD || 0), 0);
        const totalPendingCUP = unpaidSales.reduce((acc, s) => acc + (s.totalCUP || 0), 0);

        let listText = '';
        debtorsSummary.forEach((d) => {
          listText += `* **Orden ${d.orderNumber}** - Cliente: **${d.client}** | Monto: **${d.currency === 'CUP' ? `${d.totalCUP.toLocaleString()} CUP` : `$${d.totalUSD.toFixed(2)} USD`}** (${d.date})${d.notes ? ` _[Nota: ${d.notes}]_` : ''}\n`;
        });

        answer = `⚠️ **Clientes y Órdenes Pendientes por Pagar**\n\n` +
          `Actualmente tienes **${unpaidSales.length} órdenes pendientes** de cobro:\n\n` +
          `* **Total por cobrar en USD:** **$${totalPendingUSD.toFixed(2)} USD**\n` +
          (totalPendingCUP > 0 ? `* **Total por cobrar en CUP:** **${totalPendingCUP.toLocaleString()} CUP**\n` : '') +
          `\n**Detalle de deudores:**\n${listText}\n` +
          `_Puedes marcar estas órdenes como pagadas en [Historial de Ventas](/admin/pos/historial)._`;
      }
    }
    // INTENT 4: Día récord / Día que más se vendió
    else if (
      (promptLower.includes('dia') || promptLower.includes('día')) &&
      (promptLower.includes('mas') || promptLower.includes('más') || promptLower.includes('record') || promptLower.includes('mejor'))
    ) {
      if (!bestDay || bestDay.usd === 0) {
        answer = `📈 **Día Récord de Ventas**\n\nAún no hay suficiente historial acumulado para calcular el día pico de ventas.`;
      } else {
        const formattedDate = new Date(bestDay.date + 'T12:00:00').toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        answer = `🏆 **Día Récord de Ventas Histórico**\n\n` +
          `El día con mayor recaudación registrada ha sido el **${formattedDate}**:\n\n` +
          `* **Monto facturado:** **$${bestDay.usd.toFixed(2)} USD**\n` +
          (bestDay.cup > 0 ? `* **Total en CUP:** **${bestDay.cup.toLocaleString()} CUP**\n` : '') +
          `* **Cantidad de órdenes:** **${bestDay.count} ventas**`;
      }
    }
    // INTENT 5: Pantallas / Displays más vendidos
    else if (
      promptLower.includes('vendido') ||
      promptLower.includes('vendidos') ||
      promptLower.includes('popular') ||
      promptLower.includes('pantalla') ||
      promptLower.includes('modelo') ||
      promptLower.includes('ranking')
    ) {
      if (topModels.length === 0) {
        answer = `📱 **Displays Más Vendidos**\n\nAún no se han registrado ventas de repuestos en el historial.`;
      } else {
        const top5 = topModels.slice(0, 5);
        let rankingText = '';
        top5.forEach((m, idx) => {
          rankingText += `${idx + 1}. **${m.marca} ${m.modelo}**: **${m.units} uds.** vendidas ($${m.revenueUSD.toFixed(2)} USD)\n`;
        });

        answer = `🔥 **Top Displays Más Vendidos**\n\n${rankingText}\n` +
          `_Estos son los modelos con mayor rotación en tu tienda._`;
      }
    }
    // INTENT 6: Stock / Inventario
    else if (
      promptLower.includes('stock') ||
      promptLower.includes('inventario') ||
      promptLower.includes('quedan') ||
      promptLower.includes('agotado') ||
      promptLower.includes('poco')
    ) {
      answer = `📦 **Estado de Inventario y Catálogo**\n\n` +
        `* **Modelos activos en catálogo:** **${products.length} repuestos**\n` +
        `* **Valor estimado del inventario:** **$${totalInventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD**\n` +
        `* **Modelos agotados (0 stock):** **${outOfStockProducts.length} modelos**\n` +
        `* **Modelos con stock bajo (1-2 uds):** **${lowStockProducts.length} modelos**\n\n` +
        `_Puedes reponer o agregar stock en [Control de Inventario](/admin/pos/inventario)._`;
    }
    // DEFAULT: Resumen General Ejecutivo
    else {
      answer = `👋 **Resumen Ejecutivo de El Arca Display Club**\n\n` +
        `Aquí tienes el estado actual de tu negocio:\n\n` +
        `* **Ventas de Hoy:** **$${todayTot.usd.toFixed(2)} USD** (${todayTot.count} órdenes)\n` +
        `* **Ventas de Ayer:** **$${yesterdayTot.usd.toFixed(2)} USD** (${yesterdayTot.count} órdenes)\n` +
        `* **Ventas este Mes:** **$${monthTot.usd.toFixed(2)} USD** (${monthTot.count} órdenes)\n` +
        `* **Pagos Pendientes:** **${unpaidSales.length} clientes** ($${debtorsSummary.reduce((a, b) => a + b.totalUSD, 0).toFixed(2)} USD)\n` +
        `* **Total Displays en Catálogo:** **${products.length} modelos**\n\n` +
        `💡 *Puedes preguntarme cosas como: "¿Cuánto vendí hoy?", "¿Quién me debe dinero?", "¿Cuál fue el día de más ventas?" o "¿Cuáles son los displays más vendidos?".*`;
    }

    return NextResponse.json({
      success: true,
      answer,
      source: 'engine',
    });
  } catch (error) {
    console.error('[ai chat error]', error);
    return NextResponse.json(
      { success: false, error: 'Error procesando consulta de IA' },
      { status: 500 }
    );
  }
}
