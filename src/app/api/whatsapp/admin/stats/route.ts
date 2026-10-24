import { requireAdmin } from "@/lib/security/admin";
import connect from "@/lib/mongoose";
import { WhatsAppLog } from "@/lib/models/WhatsAppLog";
import {
  BotConversation,
  BotOutbound,
  BotOperation,
} from "@/lib/models/BotState";
import { getWhatsAppConfig } from "@/lib/models/WhatsAppConfig";
import { getActiveExchangeRate } from "@/lib/exchangeRate";
import { getHavanaDateKey } from "@/lib/dateUtils";
import { escapeRegex } from "@/lib/security/validation";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    await connect();
    const params = new URL(req.url).searchParams;
    const page = Math.max(1, Math.min(10000, Number(params.get("page")) || 1));
    const search = (params.get("search") || "").slice(0, 100);
    const role = params.get("role");
    const filter: any = { deletedAt: { $exists: false } };
    if (role === "admin" || role === "client") filter.role = role;
    if (search)
      filter.$or = [
        "senderPhone",
        "userMessage",
        "botReply",
        "actionExecuted",
      ].map((f) => ({ [f]: new RegExp(escapeRegex(search), "i") }));
    const day = {
      $eq: [
        {
          $dateToString: {
            date: "$createdAt",
            format: "%Y-%m-%d",
            timezone: "America/Havana",
          },
        },
        getHavanaDateKey(),
      ],
    };
    const [
      data,
      logs,
      count,
      cfg,
      rate,
      paused,
      outbound,
      confirmed,
      pendingOutbound,
      pausedCount,
    ] = await Promise.all([
      WhatsAppLog.aggregate([
        { $match: { deletedAt: { $exists: false } } },
        {
          $facet: {
            total: [{ $count: "n" }],
            today: [{ $match: { $expr: day } }, { $count: "n" }],
            clients: [
              { $match: { role: "client" } },
              { $group: { _id: "$senderPhone" } },
              { $count: "n" },
            ],
            clientsToday: [
              { $match: { role: "client", $expr: day } },
              { $group: { _id: "$senderPhone" } },
              { $count: "n" },
            ],
            queries: [
              { $match: { role: "client", $expr: day } },
              { $count: "n" },
            ],
            commands: [
              {
                $match: {
                  role: "admin",
                  actionExecuted: "OPERACION_CONFIRMADA",
                  $expr: day,
                },
              },
              { $count: "n" },
            ],
            failures: [
              { $match: { status: "failed", $expr: day } },
              { $count: "n" },
            ],
            tokens: [
              { $match: { $expr: day } },
              { $group: { _id: null, n: { $sum: "$tokens" } } },
            ],
          },
        },
      ]),
      WhatsAppLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * 100)
        .limit(100)
        .lean(),
      WhatsAppLog.countDocuments(filter),
      getWhatsAppConfig(),
      getActiveExchangeRate(),
      BotConversation.find({ paused: true }).select("_id").limit(100).lean(),
      BotOutbound.find({})
        .sort({ createdAt: -1 })
        .limit(30)
        .select("_id to status createdAt error")
        .lean(),
      BotOperation.countDocuments({
        $expr: day,
        results: { $exists: true, $ne: [] },
      }),
      BotOutbound.countDocuments({
        status: { $in: ["queued", "sending"] },
        expiresAt: { $gt: new Date() },
      }),
      BotConversation.countDocuments({ paused: true }),
    ]);
    const v = (name: string) => data[0]?.[name]?.[0]?.n || 0;
    return Response.json(
      {
        status: "ok",
        page,
        totalPages: Math.max(1, Math.ceil(count / 100)),
        matchingLogs: count,
        generatedAt: new Date().toISOString(),
        pausedPhones: paused.map((p) => p._id),
        pendingOutbound,
        pausedCount,
        outbound,
        metrics: {
          totalLogs: v("total"),
          todayLogsCount: v("today"),
          clientQueriesToday: v("queries"),
          adminCommandsToday: confirmed,
          uniqueClientsTodayCount: v("clientsToday"),
          uniqueClientsTotalCount: v("clients"),
          failuresToday: v("failures"),
          tokensToday: v("tokens"),
          activeRate: rate?.rate ?? null,
          botStatus:
            cfg.botStatus === "online" &&
            cfg.lastPingAt &&
            Date.now() - cfg.lastPingAt.getTime() < 60000
              ? "online"
              : "offline",
          botPhone: cfg.botPhone,
          lastPingAt: cfg.lastPingAt,
          topBrands: [],
        },
        recentLogs: logs.map((l) => ({
          id: String(l._id),
          timestamp: l.timestamp || l.createdAt,
          senderPhone: l.senderPhone,
          role: l.role,
          userMessage: l.userMessage,
          botReply: l.botReply,
          actionExecuted: l.actionExecuted || "",
          responseTimeMs: l.responseTimeMs || 0,
          status: l.status,
          direction: l.direction,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "No se pudieron cargar los datos. El estado del bot no está verificado.",
      },
      { status: 503 },
    );
  }
}
export async function DELETE(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await connect();
  const params = new URL(req.url).searchParams,
    id = params.get("id");
  if (!id && !params.has("clearAll"))
    return Response.json({ error: "Falta id o clearAll" }, { status: 400 });
  const result = await WhatsAppLog.updateMany(
    id ? { _id: id } : { deletedAt: { $exists: false } },
    {
      $set: {
        deletedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    },
  );
  return Response.json({
    success: true,
    message: "Registros archivados. Recuperables durante 30 días.",
    count: result.modifiedCount,
  });
}
export async function PATCH(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await connect();
  const body = await req.json();
  await WhatsAppLog.updateMany(
    body.id ? { _id: body.id } : { deletedAt: { $exists: true } },
    {
      $unset: { deletedAt: 1 },
      $set: { expiresAt: new Date(Date.now() + 90 * 86400000) },
    },
  );
  return Response.json({ success: true });
}
