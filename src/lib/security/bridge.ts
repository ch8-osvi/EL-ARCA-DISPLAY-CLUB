import { createHmac, timingSafeEqual } from "node:crypto";
export function verifyBridge(req: Request, raw: string) {
  const secret = process.env.WHATSAPP_BRIDGE_SECRET;
  if (!secret || secret.length < 32) return false;
  const timestamp = req.headers.get("x-bridge-timestamp") || "";
  const signature = req.headers.get("x-bridge-signature") || "";
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 60000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + "." + raw)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
export function verifyMeta(req: Request, raw: string) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature =
    req.headers.get("x-hub-signature-256")?.replace(/^sha256=/, "") || "";
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(raw).digest(),
    Buffer.from(signature, "hex"),
  );
}
