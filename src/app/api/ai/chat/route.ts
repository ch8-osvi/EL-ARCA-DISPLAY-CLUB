import { requireAdmin } from "@/lib/security/admin";
import { processWhatsAppAiMessage } from "@/lib/whatsapp/service";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const b = await req.json();
    if (typeof b.prompt !== "string" || b.prompt.length > 20000)
      return Response.json(
        { success: false, error: "Mensaje inválido" },
        { status: 400 },
      );
    const answer = await processWhatsAppAiMessage(b.prompt, "web-admin", {
      webAdmin: true,
      conversationId:
        typeof b.conversationId === "string" ? b.conversationId : "default",
      requestId: typeof b.requestId === "string" ? b.requestId : undefined,
    });
    return Response.json({
      success: true,
      answer,
      source: "gemini",
      hasActions: answer.includes("CONFIRMAR "),
    });
  } catch {
    return Response.json(
      {
        success: false,
        error:
          "No se pudo procesar la consulta. No repitas operaciones sin revisar su estado.",
      },
      { status: 503 },
    );
  }
}
