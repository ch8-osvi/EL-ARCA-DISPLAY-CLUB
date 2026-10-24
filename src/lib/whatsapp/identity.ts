export function normalizePhoneNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  const first = value.split("@")[0].split(":")[0];
  return first.replace(/\D/g, "");
}
export function validPhone(value: string) {
  return /^\d{8,15}$/.test(value);
}
export function resolveCanonicalPhone(value: string) {
  return normalizePhoneNumber(value);
}
