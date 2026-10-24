import { BotOutbound, BotInbox } from "@/lib/models/BotState";
/** Provider-specific sending never falls through to another account after an ambiguous timeout. */
export async function dispatchProviderMessages() {
  const provider = process.env.WHATSAPP_PROVIDER || "bridge";
  if (provider === "bridge") return;
  const message = await BotOutbound.findOneAndUpdate(
    { provider, status: "queued", expiresAt: { $gt: new Date() } },
    { $set: { status: "sending" } },
    { sort: { createdAt: 1 }, returnDocument: "after" },
  );
  if (!message) return;
  try {
    let url: string, headers: Record<string, string>, body: object;
    if (provider === "meta") {
      const inbound = await BotInbox.exists({
        provider,
        phone: message.to,
        createdAt: { $gt: new Date(Date.now() - 24 * 3600000) },
      });
      if (!inbound)
        throw new Error(
          "Fuera de la ventana de atención de Meta: utiliza una plantilla aprobada.",
        );
      if (
        !process.env.WHATSAPP_TOKEN ||
        !process.env.WHATSAPP_PHONE_NUMBER_ID ||
        !process.env.META_GRAPH_VERSION
      )
        throw new Error(
          "Configura las credenciales y versión vigente de Meta.",
        );
      url = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
      headers = {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      };
      if (message.text.length > 4096)
        throw new Error("El mensaje supera 4096 caracteres. Divide el envío.");
      body = {
        messaging_product: "whatsapp",
        to: message.to,
        type: "text",
        text: { body: message.text },
      };
    } else if (provider === "whapi") {
      if (!process.env.WHAPI_TOKEN)
        throw new Error("Whapi no está configurado");
      url = "https://gate.whapi.cloud/messages/text";
      headers = {
        Authorization: `Bearer ${process.env.WHAPI_TOKEN}`,
        "Content-Type": "application/json",
      };
      body = { to: message.to + "@s.whatsapp.net", body: message.text };
    } else throw new Error("Proveedor desconocido");
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error("Proveedor rechazó el envío: HTTP " + response.status);
    const data = await response.json();
    message.providerId =
      data.messages?.[0]?.id || data.message?.id || data.id || "";
    message.status = "sent";
    await message.save();
  } catch (err) {
    // Ambiguous provider failures need human review; blind retries can send twice.
    message.status = "failed";
    message.error =
      err instanceof Error ? err.message : "Estado de envío no confirmado";
    await message.save();
  }
}
