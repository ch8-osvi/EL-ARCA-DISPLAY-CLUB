"use client";
export async function checkAdminSession() {
  try {
    const r = await fetch("/api/auth/session", { cache: "no-store" });
    return r.ok && (await r.json()).authenticated === true;
  } catch {
    return false;
  }
}
export async function loginAdmin(password: string) {
  try {
    const r = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return r.ok && (await r.json()).authenticated === true;
  } catch {
    return false;
  }
}
