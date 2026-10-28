import { sameOrigin } from "@/lib/security/session";
import { allowRequest } from "@/lib/security/limits";
import { getHavanaDateKey } from "@/lib/dateUtils";
import { requireAdmin } from "@/lib/security/admin";
import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongoose";
import { Visit } from "@/lib/models/Visit";

export const dynamic = "force-dynamic";

/**
 * GET /api/analytics
 * Returns visitor statistics (total, unique, today's visits).
 */
async function handleGET() {
  try {
    await connectToDatabase();

    const now = new Date();
    const today = {
      createdAt: { $gte: new Date(now.getTime() - 36 * 3600000), $lte: now },
      $expr: {
        $eq: [
          {
            $dateToString: {
              date: "$createdAt",
              format: "%Y-%m-%d",
              timezone: "America/Havana",
            },
          },
          getHavanaDateKey(now),
        ],
      },
    };

    const [totalVisits, uniqueVisitorsArray, todayVisits, todayUniqueArray] =
      await Promise.all([
        Visit.countDocuments(),
        Visit.distinct("visitorId"),
        Visit.countDocuments(today),
        Visit.distinct("visitorId", today),
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
    console.error("[analytics GET]", err);
    return NextResponse.json(
      { success: false, error: "Error al obtener analíticas" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/analytics
 * Records a page visit from a client.
 */
export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req))
      return NextResponse.json(
        { success: false, error: "Origen no permitido" },
        { status: 403 },
      );
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json(
        { success: false, error: "Visita inválida" },
        { status: 400 },
      );
    const { visitorId, page = "/", referrer } = body;

    if (
      typeof visitorId !== "string" ||
      !visitorId.trim() ||
      visitorId.length > 128 ||
      typeof page !== "string" ||
      !page.startsWith("/") ||
      page.length > 500 ||
      (referrer !== undefined &&
        (typeof referrer !== "string" || referrer.length > 2048))
    ) {
      return NextResponse.json(
        { success: false, error: "visitorId requerido" },
        { status: 400 },
      );
    }

    if (
      !(await allowRequest(
        "visit:" +
          (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "local"),
        60,
        60,
      ))
    )
      return NextResponse.json(
        { success: false, error: "Demasiadas visitas" },
        { status: 429 },
      );
    await connectToDatabase();
    // Record visit
    await Visit.create({
      visitorId,
      page,
      referrer: referrer || "",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SyntaxError)
      return NextResponse.json(
        { success: false, error: "JSON inválido" },
        { status: 400 },
      );
    console.error("[analytics POST]", err);
    return NextResponse.json(
      { success: false, error: "Error al registrar visita" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request, context: any) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  return (handleGET as any)(req, context);
}
