import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Visit } from '@/lib/models/Visit';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics
 * Returns visitor statistics (total, unique, today's visits).
 */
export async function GET() {
  try {
    await connectToDatabase();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalVisits, uniqueVisitorsArray, todayVisits, todayUniqueArray] = await Promise.all([
      Visit.countDocuments(),
      Visit.distinct('visitorId'),
      Visit.countDocuments({ createdAt: { $gte: today } }),
      Visit.distinct('visitorId', { createdAt: { $gte: today } }),
    ]);

    return NextResponse.json({
      success: true,
      stats: {
        totalVisits,
        uniqueVisitors: uniqueVisitorsArray.length,
        todayVisits,
        todayUnique: todayUniqueArray.length,
      },
    });
  } catch (err) {
    console.error('[analytics GET]', err);
    return NextResponse.json(
      { success: false, error: 'Error al obtener analíticas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics
 * Records a page visit from a client.
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const body = await req.json();
    const { visitorId, page = '/', referrer } = body;

    if (!visitorId || typeof visitorId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'visitorId requerido' },
        { status: 400 }
      );
    }

    // Record visit
    await Visit.create({
      visitorId,
      page,
      referrer: referrer || '',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[analytics POST]', err);
    return NextResponse.json(
      { success: false, error: 'Error al registrar visita' },
      { status: 500 }
    );
  }
}
