import connect from "@/lib/mongoose";
import { getWhatsAppConfig } from "@/lib/models/WhatsAppConfig";
import { validPhone } from "@/lib/whatsapp/identity";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await connect();
    const cfg = await getWhatsAppConfig();
    return Response.json(
      { phone: validPhone(cfg.botPhone) ? cfg.botPhone : null },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  } catch {
    return Response.json({ phone: null }, { status: 503 });
  }
}
