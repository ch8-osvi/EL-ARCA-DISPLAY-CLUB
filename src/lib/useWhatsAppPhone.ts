"use client";
import { useSyncExternalStore } from "react";
import { createContactStore } from "./contactStore";
const store = createContactStore(async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("/api/whatsapp/contact", {
      cache: "no-store",
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    return { ok: response.ok, json: async () => body };
  } finally {
    clearTimeout(timeout);
  }
});
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const refresh = () => {
  if (!document.hidden) void store.refresh();
};
function subscribe(listener: () => void) {
  const unsubscribe = store.subscribe(listener);
  if (++subscribers === 1) {
    timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
  }
  void store.refresh();
  return () => {
    unsubscribe();
    if (--subscribers === 0) {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    }
  };
}
export function useWhatsAppPhone() {
  return useSyncExternalStore(subscribe, store.getSnapshot, () => "");
}
