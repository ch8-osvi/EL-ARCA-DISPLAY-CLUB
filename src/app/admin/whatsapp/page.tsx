"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { checkAdminSession } from "@/lib/auth-client";

type Log = {
  id: string;
  timestamp: string;
  senderPhone: string;
  role: string;
  userMessage: string;
  botReply: string;
  actionExecuted: string;
  status?: string;
};
type Delivery = { _id: string; to: string; status: string; error?: string };
type Data = {
  metrics: {
    totalLogs: number;
    todayLogsCount: number;
    uniqueClientsTodayCount: number;
    uniqueClientsTotalCount: number;
    adminCommandsToday: number;
    activeRate: number | null;
    botStatus: string;
    botPhone: string;
    lastPingAt?: string;
    failuresToday: number;
    tokensToday: number;
  };
  recentLogs: Log[];
  outbound: Delivery[];
  pausedPhones: string[];
  totalPages: number;
  matchingLogs: number;
  generatedAt: string;
};
type Config = {
  adminPhones: string[];
  blacklistedPhones: string[];
  scanUrl: string;
};
const time = (date?: string) =>
  date
    ? new Date(date).toLocaleString("es-CU", { timeZone: "America/Havana" })
    : "Sin señal";
const csvCell = (value: unknown) =>
  '"' +
  String(value ?? "")
    .replace(/^[\s]*([=+@-])/, "'$1")
    .replace(/"/g, '""') +
  '"';
const statusLabel: Record<string, string> = {
  queued: "En cola",
  sending: "Enviando",
  sent: "Enviado a WhatsApp",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

export default function AdminWhatsAppPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState("conversations");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [phone, setPhone] = useState("");
  const [selected, setSelected] = useState<Log | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const lastId = useRef("");
  const newestSeenAt = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const requestId = useRef("");
  const activeRequest = useRef(false);
  const inputClass =
    "rounded-xl border border-white/15 bg-[#111827] px-3 py-2 text-white w-full";
  const buttonClass =
    "rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";

  useEffect(() => {
    void checkAdminSession().then(setAuthorized);
    setSound(localStorage.getItem("el_arca_whatsapp_sound") === "true");
  }, []);
  useEffect(() => {
    soundRef.current = sound;
    localStorage.setItem("el_arca_whatsapp_sound", String(sound));
  }, [sound]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (activeRequest.current) return;
      activeRequest.current = true;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          search,
          role,
        });
        const [stats, cfg] = await Promise.all([
          fetch("/api/whatsapp/admin/stats?" + params, {
            cache: "no-store",
            signal,
          }),
          fetch("/api/whatsapp/admin/config", { cache: "no-store", signal }),
        ]);
        if (stats.status === 401 || cfg.status === 401) {
          setAuthorized(false);
          return;
        }
        if (!stats.ok || !cfg.ok)
          throw new Error(
            "No se pudieron actualizar los datos. Los valores mostrados pueden estar desactualizados.",
          );
        const next: Data = await stats.json();
        const incoming = next.recentLogs[0]?.id;
        const incomingAt = new Date(next.recentLogs[0]?.timestamp || 0).getTime();
        if (
          soundRef.current &&
          lastId.current &&
          incoming &&
          incoming !== lastId.current &&
          incomingAt > newestSeenAt.current &&
          next.recentLogs[0]?.senderPhone !== "web-admin"
        ) {
          const ctx = audio.current;
          if (ctx) {
            const osc = ctx.createOscillator(),
              gain = ctx.createGain();
            gain.gain.value = 0.035;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            const notification = new Notification('El Arca — Nuevo mensaje de WhatsApp', { body: 'Hay una nueva interacción en el panel.', icon: '/favicon.ico' });
            notification.onclick = () => window.focus();
          }
        }
        if (incoming) lastId.current = incoming;
        newestSeenAt.current = Math.max(newestSeenAt.current, incomingAt || 0);
        setData(next);
        setConfig(await cfg.json());
        setError("");
      } catch (err) {
        if (!signal?.aborted)
          setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        activeRequest.current = false;
        setLoading(false);
      }
    },
    [page, role, search],
  );
  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    const first = setTimeout(() => void refresh(controller.signal), 300);
    const interval = setInterval(() => {
      if (!document.hidden || soundRef.current) void refresh(controller.signal);
    }, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      controller.abort();
    };
  }, [authorized, refresh]);

  async function change(action: string, target: string) {
    try {
      const r = await fetch("/api/whatsapp/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone: target }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "No se pudo actualizar");
      setPhone("");
      setNotice("Configuración actualizada");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error de conexión");
    }
  }
  async function archive(id?: string) {
    if (
      !confirm(
        id
          ? "¿Archivar este registro? Se puede recuperar durante 30 días."
          : "¿Archivar todo el historial? Se puede recuperar durante 30 días.",
      )
    )
      return;
    const r = await fetch(
      "/api/whatsapp/admin/stats?" +
        (id ? "id=" + encodeURIComponent(id) : "clearAll=true"),
      { method: "DELETE" },
    );
    setNotice(
      r.ok ? "Registros archivados durante 30 días" : "No se pudo archivar",
    );
    setSelected(null);
    await refresh();
  }
  async function restore() {
    const r = await fetch("/api/whatsapp/admin/stats", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    setNotice(r.ok ? "Registros recuperados" : "No se pudo recuperar");
    await refresh();
  }
  async function send() {
    if (!selected || !reply.trim() || sending) return;
    setSending(true);
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const r = await fetch("/api/whatsapp/admin/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.senderPhone,
          text: reply.trim(),
          requestId: requestId.current,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "No se pudo poner en cola");
      setNotice(
        "Mensaje en cola. Consulta el estado de envío; la PC debe estar conectada.",
      );
      setReply("");
      requestId.current = "";
      await refresh();
    } catch (err) {
      setNotice(
        err instanceof Error
          ? err.message
          : "No se confirmó la recepción; reintentar conserva el identificador para evitar duplicados.",
      );
    } finally {
      setSending(false);
    }
  }
  function exportCsv() {
    const rows = [
      ["Fecha Cuba", "Teléfono", "Rol", "Mensaje", "Respuesta", "Acción"],
      ...(data?.recentLogs || []).map((l) => [
        time(l.timestamp),
        l.senderPhone,
        l.role,
        l.userMessage,
        l.botReply,
        l.actionExecuted,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `whatsapp-pagina-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (authorized === null)
    return (
      <main className="p-8 text-white" aria-busy="true">
        Verificando sesión…
      </main>
    );
  if (!authorized)
    return (
      <main className="p-8 text-white">
        <p>Inicia sesión para acceder al centro de WhatsApp.</p>
        <Link href="/admin" className="underline">
          Ir al acceso administrativo
        </Link>
      </main>
    );
  const online = !error && data?.metrics.botStatus === "online";
  return (
    <main className="min-h-screen bg-[#07090E] text-slate-100 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap justify-between items-center gap-4">
          <Link href="/admin" className="text-amber-300">
            ← Panel Admin
          </Link>
          <div
            role="status"
            className={online ? "text-emerald-400" : "text-amber-300"}
          >
            {online
              ? "● WhatsApp conectado"
              : error
                ? "● Estado sin verificar"
                : "● PC o WhatsApp desconectado"}{" "}
            {data?.metrics.botPhone ? "+" + data.metrics.botPhone : ""}
          </div>
        </header>
        <section className="rounded-3xl border border-amber-500/30 p-6 bg-white/[0.03] space-y-3">
          <h1 className="text-3xl font-bold">IA WhatsApp El Arca</h1>
          <p className="text-slate-400">
            Conversaciones, atención humana y control del bot que funciona en tu
            PC.
          </p>
          <p className="text-xs text-slate-400">
            Última señal de la PC: {time(data?.metrics.lastPingAt)} · Datos
            actualizados: {time(data?.generatedAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              className={buttonClass}
              href={config?.scanUrl || "http://127.0.0.1:7860/scan"}
              target="_blank"
              rel="noreferrer"
            >
              Abrir QR en esta PC
            </a>
            <button
              className={buttonClass}
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            El QR se abre en el ordenador donde corre el puente. No necesita
            puertos públicos. Los mensajes en cola esperan a que esa PC se
            conecte.
          </p>
        </section>
        {error && (
          <p
            role="alert"
            className="border border-red-500/40 rounded-xl p-4 text-red-300"
          >
            {error}
          </p>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-amber-500/40 p-3 flex justify-between gap-3"
          >
            <span>{notice}</span>
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
              ✕
            </button>
          </div>
        )}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["Mensajes hoy", data?.metrics.todayLogsCount],
            [
              "Clientes hoy / históricos",
              data
                ? `${data.metrics.uniqueClientsTodayCount} / ${data.metrics.uniqueClientsTotalCount}`
                : undefined,
            ],
            ["Operaciones confirmadas hoy", data?.metrics.adminCommandsToday],
            [
              "Tasa del negocio",
              data?.metrics.activeRate
                ? `1 USD = ${data.metrics.activeRate} CUP`
                : "Sin configurar",
            ],
          ].map(([title, value]) => (
            <div key={title} className="border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-slate-400">{title}</p>
              <p className="text-xl mt-2">{value ?? "—"}</p>
            </div>
          ))}
        </section>
        <p className="text-xs text-slate-400">
          Errores IA hoy: {data?.metrics.failuresToday ?? "—"} · Tokens IA hoy:{" "}
          {data?.metrics.tokensToday ?? "—"} · Zona horaria: Cuba
        </p>
        <nav aria-label="Secciones WhatsApp" className="flex gap-2 flex-wrap">
          {[
            ["conversations", "Conversaciones"],
            ["delivery", "Cola y envíos"],
            ["admins", "Administradores"],
            ["blacklist", "Bloqueados"],
            ["human", "Atención humana"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              className={
                buttonClass +
                (tab === key ? " bg-amber-500/20 text-amber-300" : "")
              }
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        {tab === "conversations" && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <input
                aria-label="Buscar en todo el historial"
                placeholder="Buscar teléfono, mensaje o acción…"
                className={inputClass + " sm:max-w-md"}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
              <select
                aria-label="Filtrar por rol"
                className={inputClass + " sm:max-w-40"}
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Todos</option>
                <option value="client">Clientes</option>
                <option value="admin">Administrador</option>
              </select>
              <button className={buttonClass} onClick={exportCsv}>
                CSV de esta página
              </button>
              <button
                className={buttonClass}
                aria-pressed={sound}
                onClick={() => {
                  if (!audio.current) audio.current = new AudioContext();
                  void audio.current.resume();
                  if (!sound && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
                  setSound(!sound);
                }}
              >
                {sound ? "Silenciar alertas" : "Activar sonido"}
              </button>
            </div>
            <div className="space-y-2">
              {data?.recentLogs.map((log) => (
                <article
                  key={log.id}
                  className="border border-white/10 rounded-2xl p-4 flex gap-4 justify-between"
                >
                  <button
                    className="text-left min-w-0 flex-1"
                    onClick={() => {
                      setSelected(log);
                      setReply("");
                      requestId.current = "";
                    }}
                  >
                    <p className="text-xs text-slate-400">
                      {time(log.timestamp)} · {log.role} ·{" "}
                      {log.senderPhone === "web-admin"
                        ? "Chat web"
                        : "+" + log.senderPhone}
                    </p>
                    <p className="truncate mt-2">{log.userMessage}</p>
                    <p className="text-sm text-slate-400 truncate">
                      {log.botReply}
                    </p>
                    <p className="text-xs text-amber-300 mt-1">
                      {log.actionExecuted}
                    </p>
                  </button>
                  <button
                    className={buttonClass}
                    aria-label="Archivar registro"
                    onClick={() => void archive(log.id)}
                  >
                    Archivar
                  </button>
                </article>
              ))}
              {data?.recentLogs.length === 0 && (
                <p className="p-8 text-slate-400">
                  No hay registros que coincidan. Los mensajes nuevos aparecerán
                  al procesarse.
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                className={buttonClass}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </button>
              <span>
                Página {page} de {data?.totalPages || 1} ·{" "}
                {data?.matchingLogs || 0} registros
              </span>
              <button
                className={buttonClass}
                disabled={page >= (data?.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
              <button className={buttonClass} onClick={() => void archive()}>
                Archivar historial
              </button>
              <button className={buttonClass} onClick={() => void restore()}>
                Recuperar archivados
              </button>
            </div>
          </section>
        )}
        {tab === "delivery" && (
          <section className="space-y-3">
            <p className="text-slate-400">
              Enviado significa aceptado por WhatsApp; no confirma lectura. Si
              la PC está apagada, el mensaje permanece en cola.
            </p>
            {data?.outbound.map((d) => (
              <div
                key={d._id}
                className="border border-white/10 rounded-xl p-3"
              >
                +{d.to} · <strong>{statusLabel[d.status] || d.status}</strong>
                {d.error && <p className="text-red-300">{d.error}</p>}
              </div>
            ))}
          </section>
        )}
        {(tab === "admins" || tab === "blacklist") && (
          <section className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void change(
                  tab === "admins" ? "add_admin" : "add_blacklist",
                  phone,
                );
              }}
            >
              <input
                className={inputClass}
                aria-label="Teléfono completo con código de país"
                placeholder="Ej.: 53…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <button className={buttonClass}>Agregar</button>
            </form>
            {(tab === "admins"
              ? config?.adminPhones
              : config?.blacklistedPhones
            )?.map((p) => (
              <div
                key={p}
                className="border border-white/10 rounded-xl p-4 flex justify-between"
              >
                <span>+{p}</span>
                <button
                  className={buttonClass}
                  onClick={() => {
                    if (confirm("¿Confirmas cambiar el acceso de +" + p + "?"))
                      void change(
                        tab === "admins" ? "remove_admin" : "remove_blacklist",
                        p,
                      );
                  }}
                >
                  Retirar
                </button>
              </div>
            ))}
          </section>
        )}
        {tab === "human" && (
          <section className="space-y-3">
            <p>
              Conversaciones con respuesta automática pausada. El equipo puede
              responder manualmente y reactivar el bot.
            </p>
            {data?.pausedPhones.map((p) => (
              <div
                className="flex justify-between border border-white/10 p-4 rounded-xl"
                key={p}
              >
                <span>+{p}</span>
                <button
                  className={buttonClass}
                  onClick={() => void change("resume", p)}
                >
                  Reactivar bot
                </button>
              </div>
            ))}
          </section>
        )}
        {selected && (
          <div
            className="fixed inset-0 z-50 bg-black/80 p-4 flex justify-center items-center"
            onClick={() => setSelected(null)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Detalle de conversación"
              className="bg-[#111827] border border-white/20 rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between">
                <h2 className="font-bold">
                  {selected.senderPhone === "web-admin"
                    ? "Chat web"
                    : "+" + selected.senderPhone}
                </h2>
                <button
                  autoFocus
                  aria-label="Cerrar detalle"
                  onClick={() => setSelected(null)}
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-400">
                {time(selected.timestamp)}
              </p>
              <p className="whitespace-pre-wrap">{selected.userMessage}</p>
              <p className="whitespace-pre-wrap text-amber-100 border-t border-white/10 pt-4">
                {selected.botReply}
              </p>
              {selected.senderPhone !== "web-admin" && (
                <>
                  <label className="block">
                    Respuesta del equipo
                    <textarea
                      className={inputClass + " mt-2"}
                      value={reply}
                      maxLength={20000}
                      onChange={(e) => {
                        setReply(e.target.value);
                        requestId.current = "";
                      }}
                      rows={4}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      className={buttonClass}
                      disabled={sending || !reply.trim()}
                      onClick={() => void send()}
                    >
                      {sending ? "Guardando…" : "Poner mensaje en cola"}
                    </button>
                    <button
                      className={buttonClass}
                      onClick={() =>
                        void change(
                          data?.pausedPhones.includes(selected.senderPhone)
                            ? "resume"
                            : "pause",
                          selected.senderPhone,
                        )
                      }
                    >
                      {data?.pausedPhones.includes(selected.senderPhone)
                        ? "Reactivar bot"
                        : "Pausar bot y atender"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
