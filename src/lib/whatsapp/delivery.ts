import { BotOutbound } from "@/lib/models/BotState";
import { WhatsAppLog } from "@/lib/models/WhatsAppLog";
export type DeliveryStatus =
  | "submitted"
  | "sent"
  | "delivered"
  | "read"
  | "failed";
const higher: Record<DeliveryStatus, string[]> = {
  submitted: ["sent", "delivered", "read", "failed"],
  sent: ["delivered", "read"],
  delivered: ["read"],
  read: [],
  failed: ["sent", "delivered", "read"],
};
export async function advanceDelivery(
  id: string,
  status: DeliveryStatus,
  providerId = "",
) {
  const message = await BotOutbound.findOneAndUpdate(
    { _id: id, provider: "bridge", status: { $nin: higher[status] } },
    {
      $set: {
        status,
        providerId: providerId.slice(0, 200),
        error: status === "failed" ? "El puente no pudo enviar el mensaje" : "",
      },
      ...(status !== "submitted" ? { $unset: { leaseUntil: 1 } } : {}),
    },
    { returnDocument: "after" },
  );
  if (message)
    await WhatsAppLog.updateMany(
      {
        status: { $nin: higher[status] },
        $or: [
          { outboundId: id },
          { messageId: id },
          ...(id.startsWith("reply:") ? [{ messageId: id.slice(6) }] : []),
        ],
      },
      { $set: { status } },
    );
  return message;
}
