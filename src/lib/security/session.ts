export const SESSION_COOKIE = "el_arca_admin_session";
const encoder = new TextEncoder();
async function key() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("ADMIN_SESSION_SECRET no configurado");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function createSession() {
  const payload =
    Math.floor(Date.now() / 1000 + 28800) + "." + crypto.randomUUID();
  return (
    payload +
    "." +
    hex(await crypto.subtle.sign("HMAC", await key(), encoder.encode(payload)))
  );
}
export async function validSession(token?: string): Promise<boolean> {
  try {
    if (!token || token.length > 200) return false;
    const [expires, nonce, signature, extra] = token.split(".");
    if (
      extra ||
      !/^[a-f0-9]{64}$/.test(signature || "") ||
      !nonce ||
      Number(expires) <= Date.now() / 1000 ||
      Number(expires) > Date.now() / 1000 + 28860
    )
      return false;
    return await crypto.subtle.verify(
      "HMAC",
      await key(),
      Uint8Array.from(signature.match(/../g)!, (b) => parseInt(b, 16)),
      encoder.encode(expires + "." + nonce),
    );
  } catch {
    return false;
  }
}
export async function authenticated(req: Request) {
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(SESSION_COOKIE + "="))
    ?.slice(SESSION_COOKIE.length + 1);
  return validSession(cookie);
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}
