"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  Clock3,
  FileText,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
} from "lucide-react";
import { customerPhone } from "@/lib/saleReceipt";

type ReceiptState = {
  phone: string;
  preview: string;
  botOnline: boolean;
  delivery: null | { id: string; status: string; to: string };
};
const statusLabel: Record<string, string> = {
  queued: "En cola",
  sending: "Enviando",
  submitted: "Esperando confirmación",
  sent: "Enviado",
  delivered: "Entregado",
  read: "Leído",
  failed: "No se confirmó el envío",
  expired: "El envío venció",
};
const done = ["sent", "delivered", "read"];

export default function SaleReceiptSender({
  saleId,
  initialPhone = "",
  revision = "",
}: {
  saleId: string;
  initialPhone?: string;
  revision?: string;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [data, setData] = useState<ReceiptState | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(
        `/api/sales/receipt?saleId=${encodeURIComponent(saleId)}`,
        { cache: "no-store", signal },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "No se pudo consultar el comprobante.");
      if (!signal?.aborted) {
        setData(result);
        if (!dirty.current) setPhone(result.phone || "");
      }
    },
    [saleId, revision],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(() => {
      if (!controller.signal.aborted)
        setError(
          "No se pudo consultar el estado. Puedes actualizarlo o intentar el envío.",
        );
    });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (
      !data?.delivery ||
      !["queued", "sending", "submitted"].includes(data.delivery.status)
    )
      return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void load(controller.signal).catch(() => {});
    }, 6000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [data?.delivery?.status, load]);
  let normalized = "";
  try {
    normalized = customerPhone(phone);
  } catch {
    /* Validate on explicit send. */
  }
  const delivery = data?.delivery?.to === normalized ? data.delivery : null;
  const phase = delivery?.status || "";
  const waiting = ["queued", "sending", "submitted"].includes(phase);
  const sent = done.includes(phase);
  const send = async () => {
    if (inFlight.current || waiting || sent) return;
    setError("");
    try {
      const to = customerPhone(phone);
      if (!to) throw new Error("Indica el WhatsApp del cliente.");
      inFlight.current = true;
      setSending(true);
      const response = await fetch("/api/sales/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId,
          phone: to,
          retry: ["failed", "expired"].includes(phase),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success)
        throw new Error(
          result.error ||
            "No se pudo solicitar el envío. La venta sigue registrada.",
        );
      setData(result);
      setPhone(result.phone);
      dirty.current = false;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo confirmar el envío. Actualiza el estado antes de reintentar.",
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };
  return (
    <div className="min-w-0 space-y-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-bold text-white">
          <MessageCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          Comprobante digital
        </div>
        <button
          type="button"
          aria-label="Actualizar estado del comprobante"
          title="Actualizar estado"
          onClick={() => {
            setError("");
            void load().catch(() =>
              setError("No se pudo actualizar el estado."),
            );
          }}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <label className="block text-xs font-medium text-gray-300">
        WhatsApp del destinatario
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          disabled={sending}
          onChange={(event) => {
            dirty.current = true;
            setPhone(event.target.value);
            setError("");
          }}
          placeholder="+53 5123 4567"
          className="mt-1.5 w-full min-w-0 rounded-xl border border-white/10 bg-[#10131E] px-3 py-2.5 text-base text-white outline-none focus:border-emerald-400"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-gray-400">
        Número internacional. Si escribes 8 dígitos, se añade +53.
      </p>
      {data && (
        <details className="rounded-xl border border-white/10 bg-[#10131E]/70 text-xs text-gray-300">
          <summary className="flex cursor-pointer items-center gap-2 p-3 font-semibold">
            <FileText className="h-4 w-4" />
            Ver comprobante antes de enviar
          </summary>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words border-t border-white/10 p-3 font-sans leading-relaxed">
            {data.preview}
          </pre>
        </details>
      )}
      {delivery && (
        <p
          role="status"
          className={`flex items-center gap-2 text-xs font-semibold ${sent ? "text-emerald-300" : phase === "failed" ? "text-rose-300" : "text-amber-300"}`}
        >
          {sent ? (
            <CheckCheck className="h-4 w-4 shrink-0" />
          ) : (
            <Clock3 className="h-4 w-4 shrink-0" />
          )}
          {statusLabel[phase] || "Estado pendiente"} · +{delivery.to}
        </p>
      )}
      {data && !data.botOnline && !sent && (
        <p className="text-xs leading-relaxed text-amber-200/80">
          El bot está desconectado. El envío queda en cola hasta que la PC del
          bot vuelva a conectarse, durante un máximo de 7 días.
        </p>
      )}
      {phase === "failed" && (
        <p className="text-xs leading-relaxed text-gray-400">
          Comprueba la conversación antes de reintentar: un envío sin
          confirmación podría haber llegado.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs leading-relaxed text-rose-300">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={sending || waiting || sent}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-3 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-60"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Send className="h-4 w-4 shrink-0" />
        )}
        {sending
          ? "Solicitando envío…"
          : waiting
            ? statusLabel[phase]
            : sent
              ? "Comprobante enviado"
              : ["failed", "expired"].includes(phase)
                ? "Reintentar envío por WhatsApp"
                : "Enviar comprobante por WhatsApp"}
      </button>
      <p className="text-[11px] leading-relaxed text-gray-400">
        Se envía desde el bot del negocio. Solicitarlo otra vez no registra una
        nueva venta.
      </p>
    </div>
  );
}
