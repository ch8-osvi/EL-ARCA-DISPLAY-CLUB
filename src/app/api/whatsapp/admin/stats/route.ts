import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongoose';
import { WhatsAppLog } from '@/lib/models/WhatsAppLog';
import { getWhatsAppConfig } from '@/lib/models/WhatsAppConfig';
import { getActiveExchangeRate } from '@/lib/exchangeRate';
import { getHavanaDateKey } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectToDatabase();

    const now = new Date();
    const todayKey = getHavanaDateKey(now);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    // Auto-reparación no bloqueante de registros antiguos con LID de WhatsApp
    WhatsAppLog.updateMany(
      { senderPhone: '113198191661280' },
      { $set: { senderPhone: '5352031972', role: 'admin' } }
    ).catch(() => {});

    const [totalLogs, todayLogs, recentLogs, config, rateDoc] = await Promise.all([
      WhatsAppLog.countDocuments({}),
      WhatsAppLog.countDocuments({ createdAt: { $gte: startOfToday } }),
      WhatsAppLog.find({}).sort({ createdAt: -1 }).limit(100).lean(),
      getWhatsAppConfig(),
      getActiveExchangeRate(),
    ]);

    // Unique clients today
    const uniqueClientsToday = new Set<string>();
    const uniqueClientsAllTime = new Set<string>();
    let clientQueriesToday = 0;
    let adminCommandsToday = 0;

    for (const log of recentLogs) {
      const isOsvaldo =
        log.senderPhone === '113198191661280' ||
        log.senderPhone === '5352031972' ||
        (log.senderPhone || '').endsWith('52031972');

      const resolvedRole = isOsvaldo ? 'admin' : log.role;

      if (resolvedRole === 'client') {
        uniqueClientsAllTime.add(log.senderPhone);
        if (new Date(log.timestamp).getTime() >= startOfToday.getTime()) {
          uniqueClientsToday.add(log.senderPhone);
          clientQueriesToday++;
        }
      } else {
        if (new Date(log.timestamp).getTime() >= startOfToday.getTime()) {
          adminCommandsToday++;
        }
      }
    }

    // Top mentioned keywords or brands
    const brandCounts: Record<string, number> = {};
    for (const log of recentLogs) {
      const text = (log.userMessage || '').toUpperCase();
      ['SAMSUNG', 'XIAOMI', 'REDMI', 'IPHONE', 'MOTOROLA', 'HUAWEI', 'HONOR', 'REALME', 'POCO', 'TECNO'].forEach((b) => {
        if (text.includes(b)) {
          brandCounts[b] = (brandCounts[b] || 0) + 1;
        }
      });
    }

    const topBrands = Object.entries(brandCounts)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      status: 'ok',
      metrics: {
        totalLogs,
        todayLogsCount: todayLogs,
        clientQueriesToday,
        adminCommandsToday,
        uniqueClientsTodayCount: uniqueClientsToday.size,
        uniqueClientsTotalCount: uniqueClientsAllTime.size,
        activeRate: rateDoc?.rate || 340,
        botStatus: config.botStatus || 'online',
        botPhone: config.botPhone || '5363657247',
        topBrands,
      },
      recentLogs: recentLogs.map((l) => {
        const isOsvaldo =
          l.senderPhone === '113198191661280' ||
          l.senderPhone === '5352031972' ||
          (l.senderPhone || '').endsWith('52031972');
        return {
          id: String(l._id),
          timestamp: l.timestamp || l.createdAt,
          senderPhone: isOsvaldo ? '5352031972' : l.senderPhone,
          role: isOsvaldo ? 'admin' : l.role,
          userMessage: l.userMessage,
          botReply: l.botReply,
          actionExecuted: l.actionExecuted || '',
          responseTimeMs: l.responseTimeMs || 0,
        };
      }),
    });
  } catch (err: any) {
    console.error('[WhatsApp Admin Stats Error]', err);
    return NextResponse.json({ error: err.message || 'Error fetching stats' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const clearAll = searchParams.get('clearAll') === 'true';

    if (clearAll) {
      await WhatsAppLog.deleteMany({});
      return NextResponse.json({ success: true, message: 'Todos los registros de WhatsApp han sido vaciados' });
    }

    if (id) {
      await WhatsAppLog.findByIdAndDelete(id);
      return NextResponse.json({ success: true, message: 'Registro eliminado' });
    }

    return NextResponse.json({ error: 'Parámetro id o clearAll requerido' }, { status: 400 });
  } catch (err: any) {
    console.error('[WhatsApp Admin Delete Error]', err);
    return NextResponse.json({ error: err.message || 'Error al eliminar' }, { status: 500 });
  }
}
