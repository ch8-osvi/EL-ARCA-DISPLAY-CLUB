"use client";
import { useEffect, useState } from "react";
let lookup: Promise<string> | undefined;
export function useWhatsAppPhone() {
  const [phone, setPhone] = useState("");
  useEffect(() => {
    lookup ||= fetch("/api/whatsapp/contact")
      .then((r) => (r.ok ? r.json() : {}))
      .then((b: unknown) => (b && typeof b === 'object' && 'phone' in b && typeof b.phone === 'string' ? b.phone : ''))
      .catch(() => "");
    let live = true;
    void lookup.then((p) => {
      if (live) setPhone(p);
    });
    return () => {
      live = false;
    };
  }, []);
  return phone;
}
