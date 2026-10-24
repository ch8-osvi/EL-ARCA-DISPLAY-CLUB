"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  MessageSquare,
  Users,
  ShieldAlert,
  QrCode,
  Search,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Phone,
  Plus,
  Trash2,
  ExternalLink,
  DollarSign,
  TrendingUp,
  Cpu,
  Lock,
  Crown,
  User,
  Download,
  Volume2,
  VolumeX,
  Send,
} from "lucide-react";

import { checkAdminSession, loginAdmin } from "@/lib/auth-client";

type Log = {
  id: string;
  timestamp: string;
  senderPhone: string;
  role: string;
  userMessage: string;
  botReply: string;
  actionExecuted: string;
  status?: string;
  responseTimeMs?: number;
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
  pendingOutbound: number;
  pausedCount: number;
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
  received: "Recibido",
  processing: "La IA está preparando la respuesta",
  submitted: "Esperando confirmación de WhatsApp",
  not_replied: "Sin respuesta automática",
  sending: "Enviando",
  sent: "Enviado a WhatsApp",
  delivered: "Entregado",
  read: "Leído",
  failed: "Falló",
};

function WhatsAppDashboardSkeleton() {
  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans animate-pulse">
      {/* Top Header Skeleton */}
      <header className="sticky top-0 z-40 bg-[#07090E]/90 backdrop-blur-xl border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="h-5 w-40 bg-white/10 rounded-lg" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-44 bg-emerald-500/10 rounded-full border border-emerald-500/20" />
            <div className="h-9 w-9 bg-white/5 rounded-xl border border-white/5" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero Section Banner Skeleton */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/20 space-y-4">
          <div className="h-6 w-60 bg-[#D4AF37]/15 rounded-full" />
          <div className="h-9 w-80 bg-white/15 rounded-xl" />
          <div className="h-4 w-full max-w-xl bg-white/10 rounded-lg" />
        </section>

        {/* 4 Metric Cards Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="glass-card rounded-2xl p-5 border border-white/5 bg-white/[0.02] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 bg-white/10 rounded" />
                <div className="w-8 h-8 rounded-xl bg-white/10" />
              </div>
              <div className="h-8 w-16 bg-white/15 rounded-lg" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
          ))}
        </div>

        {/* Tabs Bar Skeleton */}
        <div className="flex gap-2 border-b border-white/10 pb-4">
          {[1, 2, 3, 4].map((t) => (
            <div key={t} className="h-10 w-32 bg-white/5 rounded-xl" />
          ))}
        </div>

        {/* Table / List Container Skeleton */}
        <div className="glass-panel rounded-3xl p-6 border border-white/5 bg-white/[0.02] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-10 w-72 bg-white/5 rounded-xl" />
            <div className="h-10 w-40 bg-white/5 rounded-xl" />
          </div>
          <div className="space-y-3 pt-2">
            {[1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className="h-16 w-full rounded-2xl bg-white/[0.03] border border-white/5 flex items-center px-4 justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/10" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-32 bg-white/10 rounded" />
                    <div className="h-3 w-48 bg-white/5 rounded" />
                  </div>
                </div>
                <div className="h-4 w-20 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AdminWhatsAppPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [tab, setTab] = useState("logs");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [changing, setChanging] = useState(false);
  const changingRef = useRef(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState(false);
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [newBlacklistPhone, setNewBlacklistPhone] = useState("");
  const [selected, setSelected] = useState<Log | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const lastId = useRef("");
  const newestSeenAt = useRef(0);
  const audio = useRef<AudioContext | null>(null);
  const requestId = useRef("");
  const activeRequest = useRef<AbortController | null>(null);

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
    async (signal?: AbortSignal, quiet = false) => {
      if (signal?.aborted) return;
      if (quiet && activeRequest.current) return;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      if (!quiet) setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          search,
          role,
        });
        const [stats, cfg] = await Promise.all([
          fetch("/api/whatsapp/admin/stats?" + params, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch("/api/whatsapp/admin/config", {
            cache: "no-store",
            signal: controller.signal,
          }),
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
        const nextConfig: Config = await cfg.json();
        if (controller.signal.aborted || activeRequest.current !== controller)
          return;
        const incoming = next.recentLogs[0]?.id;
        const incomingAt = new Date(
          next.recentLogs[0]?.timestamp || 0,
        ).getTime();
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
          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const notification = new Notification(
              "El Arca — Nuevo mensaje de WhatsApp",
              {
                body: "Hay una nueva interacción en el panel.",
                icon: "/favicon.ico",
              },
            );
            notification.onclick = () => window.focus();
          }
        }
        if (incoming) lastId.current = incoming;
        newestSeenAt.current = Math.max(newestSeenAt.current, incomingAt || 0);
        setData(next);
        setConfig(nextConfig);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Error de conexión");
      } finally {
        signal?.removeEventListener("abort", abort);
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setLoading(false);
        }
      }
    },
    [page, role, search],
  );
  useEffect(() => {
    if (!authorized) return;
    const controller = new AbortController();
    const first = setTimeout(() => void refresh(controller.signal), 300);
    const interval = setInterval(() => {
      if (!document.hidden || soundRef.current)
        void refresh(controller.signal, true);
    }, 3000);
    const onFocus = () => {
      if (!document.hidden) void refresh(controller.signal, true);
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
      controller.abort();
    };
  }, [authorized, refresh]);

  async function change(action: string, target: string) {
    if (changingRef.current) return false;
    changingRef.current = true;
    setChanging(true);
    try {
      const r = await fetch("/api/whatsapp/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phone: target }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "No se pudo actualizar");
      setConfig((current) =>
        current
          ? {
              ...current,
              adminPhones: result.adminPhones,
              blacklistedPhones: result.blacklistedPhones,
            }
          : current,
      );
      setNotice("Configuración actualizada");
      await refresh();
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error de conexión");
      return false;
    } finally {
      changingRef.current = false;
      setChanging(false);
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

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const isCheckingAuth = authorized === null;
  const isAuthenticated = authorized === true;
  const metrics = data?.metrics || null;
  const logs = data?.recentLogs || [];
  const filteredLogs = logs;
  const adminPhones = config?.adminPhones || [];
  const blacklistedPhones = config?.blacklistedPhones || [];
  const activeTab = tab;
  const setActiveTab = setTab;
  const searchTerm = search;
  const setSearchTerm = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const roleFilter = role;
  const setRoleFilter = (value: string) => {
    setRole(value);
    setPage(1);
  };
  const selectedLog = selected;
  const setSelectedLog = (log: Log | null) => {
    setSelected(log);
    setReply("");
    requestId.current = "";
  };
  const toastMessage = notice;
  const soundEnabled = sound;
  const toggleSound = () => {
    if (!audio.current) audio.current = new AudioContext();
    void audio.current.resume();
    if (
      !sound &&
      "Notification" in window &&
      Notification.permission === "default"
    )
      void Notification.requestPermission();
    setSound(!sound);
  };
  const fetchData = () => refresh();
  const exportToCSV = exportCsv;
  const handleDeleteLog = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    return archive(id);
  };
  const handleClearAllLogs = () => archive();
  const handleConfigAction = (action: string, target: string) => {
    if (
      action === "remove_admin" &&
      !confirm("¿Retirar los permisos de este administrador?")
    )
      return;
    return change(action, target);
  };
  const directReplyText = reply;
  const setDirectReplyText = (value: string) => {
    setReply(value);
    requestId.current = "";
  };
  const isSendingReply = sending;
  const handleSendDirectReply = send;
  const online = !error && metrics?.botStatus === "online";
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await loginAdmin(passwordInput);
    setAuthorized(ok);
    setAuthError(!ok);
    setPasswordInput("");
  };
  // Mantener el diseño estable mientras se comprueba la sesión del servidor.
  if (isCheckingAuth) {
    return <WhatsAppDashboardSkeleton />;
  }

  // Si no está autenticado, muestra login del panel admin
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#07090E] flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-panel rounded-3xl p-8 border border-amber-500/30 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-[#D4AF37]">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white">
              Panel WhatsApp IA
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Acceso restringido para administración de El Arca
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Contraseña de Administrador"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-4 py-3 bg-[#0B0F19] border border-gray-700 rounded-xl text-white focus:outline-none focus:border-amber-400 text-center text-lg"
              autoFocus
            />
            {authError && (
              <p className="text-red-400 text-xs font-bold">
                Contraseña incorrecta
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl gold-gradient-bg text-black font-extrabold text-sm shadow-gold-glow hover:scale-105 active:scale-95 transition-all"
            >
              Entrar al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Si está autenticado pero cargando datos iniciales, muestra skeleton suave sin brincos
  if (loading && !metrics) {
    return <WhatsAppDashboardSkeleton />;
  }

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black">
      {/* Toast Notification Centrada Horizontalmente */}
      {toastMessage && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl bg-[#131C2E] border border-amber-500/40 text-amber-300 font-bold text-sm shadow-2xl flex items-center gap-3 animate-fade-in backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#07090E]/90 backdrop-blur-xl border-b border-amber-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-bold">Volver al Panel Admin</span>
          </Link>

          <div className="flex items-center gap-2.5">
            {/* Indicador de Estado del Bot con Dot Verde Parpadeante */}
            <div
              role="status"
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold shadow-sm ${online ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-amber-500/10 border-amber-500/30 text-amber-300"}`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${online ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" : "bg-amber-400"}`}
              />
              <span>
                Bot:{" "}
                {metrics?.botPhone ? `+${metrics.botPhone}` : "Sin vincular"}
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-extrabold">
                {error ? "Sin verificar" : online ? "Activo" : "Desconectado"}
              </span>
            </div>

            <button
              onClick={() => fetchData()}
              disabled={loading}
              title="Refrescar datos ahora"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Hero Section Banner */}
        <section className="glass-panel rounded-3xl p-6 sm:p-8 border border-amber-500/30 relative overflow-hidden flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171B2B] border border-white/10 text-xs font-bold text-[#E5C158]">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              Centro de Operaciones y Atención Automatizada
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              IA WhatsApp <span className="text-gradient-gold">El Arca</span>
            </h1>
            <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
              Supervisa las conversaciones de clientes, órdenes ejecutadas por
              el administrador, gestiona listas de acceso y monitorea el
              servicio en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={config?.scanUrl || "http://127.0.0.1:7860/scan"}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/15 font-bold text-xs flex items-center gap-2 transition-all hover:scale-105"
            >
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>Ver Pantalla QR</span>
              <ExternalLink className="w-3 h-3 text-gray-400" />
            </a>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-300 text-xs flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
        {/* Quick Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Mensajes Hoy</span>
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.todayLogsCount ?? "—"}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Total acumulado: {metrics?.totalLogs ?? "—"} msgs
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Clientes Atendidos</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.uniqueClientsTodayCount ?? "—"}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Clientes únicos totales: {metrics?.uniqueClientsTotalCount ?? "—"}
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Órdenes Admin</span>
              <Cpu className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-300">
              {metrics?.adminCommandsToday ?? "—"}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Comandos de precio, stock y ventas
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Tasa de Cambio</span>
              <DollarSign className="w-4 h-4 text-yellow-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.activeRate ? `1x${metrics.activeRate}` : "—"}{" "}
              <span className="text-xs font-bold text-gray-400">CUP</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Precios calculados en tiempo real
            </div>
          </div>
        </section>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === "logs"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>
              Historial de Conversaciones ({data?.matchingLogs ?? logs.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("admins")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === "admins"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Administradores ({adminPhones.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("blacklist")}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === "blacklist"
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Lista Negra / Bloqueados ({blacklistedPhones.length})</span>
          </button>
        </div>

        {/* TAB 1: HISTORIAL DE LOGS */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar por teléfono, modelo, pregunta o respuesta..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRoleFilter("all")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold ${
                    roleFilter === "all"
                      ? "bg-white/15 text-white border border-white/20"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setRoleFilter("client")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    roleFilter === "client"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Clientes</span>
                </button>
                <button
                  onClick={() => setRoleFilter("admin")}
                  className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    roleFilter === "admin"
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "text-gray-400 hover:bg-white/5"
                  }`}
                >
                  <Crown className="w-3.5 h-3.5" />
                  <span>Administrador</span>
                </button>

                <div className="h-5 w-[1px] bg-white/10 mx-1 hidden sm:block" />

                {/* Exportar CSV */}
                <button
                  onClick={exportToCSV}
                  className="px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-colors"
                  title="Exportar interacciones a archivo CSV (Excel)"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>

                {/* Toggle Sonido y Notificaciones en la tabla de SMS */}
                <button
                  onClick={toggleSound}
                  className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-all ${
                    soundEnabled
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/35 shadow-sm shadow-amber-950/30"
                      : "text-gray-400 hover:text-white hover:bg-white/5 border-white/10"
                  }`}
                  title={
                    soundEnabled
                      ? "Click para silenciar alertas"
                      : "Click para activar alertas sonoras y notificaciones"
                  }
                >
                  {soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                      <span className="hidden sm:inline">Sonido</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Silenciado</span>
                    </>
                  )}
                </button>

                {/* Vaciar Registros */}
                {logs.length > 0 && (
                  <button
                    onClick={handleClearAllLogs}
                    className="p-2 rounded-xl text-xs font-bold text-gray-400 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                    title="Archivar registros (recuperables durante 30 días)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Logs Table / Cards */}
            <div
              aria-busy={loading}
              className={`h-[min(65vh,640px)] min-h-[320px] transition-opacity duration-200 motion-reduce:transition-none ${loading ? "opacity-60" : "opacity-100"}`}
            >
              {filteredLogs.length === 0 ? (
                <div className="glass-panel h-full p-12 rounded-3xl border border-white/10 text-center space-y-3">
                  <MessageSquare className="w-10 h-10 text-gray-500 mx-auto" />
                  <p className="text-gray-300 font-bold text-sm">
                    No hay registros que coincidan con la búsqueda
                  </p>
                  <p className="text-gray-500 text-xs">
                    Los mensajes recibidos en WhatsApp aparecerán aquí en vivo.
                  </p>
                </div>
              ) : (
                <div className="glass-panel h-full rounded-2xl border border-white/10 overflow-hidden">
                  <div className="overflow-auto h-full">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="bg-[#0B0F19] text-gray-400 uppercase font-bold border-b border-white/10 text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Fecha / Hora</th>
                          <th className="py-3 px-4">Teléfono</th>
                          <th className="py-3 px-4">Rol</th>
                          <th className="py-3 px-4">Mensaje del Usuario</th>
                          <th className="py-3 px-4">Respuesta del Bot</th>
                          <th className="py-3 px-4 text-right">Acción</th>
                          <th className="py-3 px-2 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredLogs.map((log) => {
                          const dateObj = new Date(log.timestamp);
                          const timeStr = dateObj.toLocaleTimeString("es-CU", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/Havana",
                          });
                          const dateStr = dateObj.toLocaleDateString("es-CU", {
                            day: "2-digit",
                            month: "short",
                            timeZone: "America/Havana",
                          });

                          const displayPhone = log.senderPhone;
                          const displayRole = log.role;

                          return (
                            <tr
                              key={log.id}
                              onClick={() =>
                                setSelectedLog({
                                  ...log,
                                  senderPhone: displayPhone,
                                  role: displayRole,
                                })
                              }
                              className="hover:bg-white/5 transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-400">
                                {dateStr} {timeStr}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {displayPhone === "web-admin" ? (
                                  <span className="font-mono font-bold text-white">
                                    Panel web
                                  </span>
                                ) : (
                                  <a
                                    href={`https://wa.me/${displayPhone}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-mono font-bold text-white hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
                                  >
                                    +{displayPhone}
                                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </a>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {displayRole === "admin" ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    <Crown className="w-3 h-3 text-amber-400" />
                                    <span>Admin</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    <User className="w-3 h-3 text-cyan-400" />
                                    <span>Cliente</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 max-w-xs truncate font-medium text-white">
                                {log.userMessage}
                              </td>
                              <td className="py-3 px-4 max-w-md text-gray-400">
                                <div className="truncate">
                                  {log.botReply.replace(/[*_#]/g, "")}
                                </div>
                                {log.status && statusLabel[log.status] && (
                                  <span
                                    className={`inline-block mt-1 text-[10px] ${log.status === "failed" ? "text-red-300" : ["delivered", "read"].includes(log.status) ? "text-emerald-300" : "text-gray-500"}`}
                                  >
                                    {statusLabel[log.status]}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {log.actionExecuted ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                    {log.actionExecuted}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-500">
                                    {log.responseTimeMs
                                      ? `${log.responseTimeMs}ms`
                                      : "Consulta"}
                                  </span>
                                )}
                              </td>
                              <td
                                className="py-3 px-2 text-center"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => handleDeleteLog(log.id, e)}
                                  className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                  title="Archivar registro (recuperable durante 30 días)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: GESTIÓN DE ADMINISTRADORES */}
        {activeTab === "admins" && (
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6 max-w-3xl mx-auto">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Números Autorizados con Acceso Administrador</span>
              </h2>
              <p className="text-gray-400 text-xs">
                Los teléfonos incluidos en esta lista tienen permisos totales
                para cambiar precios, consultar stock real, registrar ventas y
                consultar balances en lenguaje natural por WhatsApp.
              </p>
            </div>

            {/* Add Admin Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newAdminPhone.trim()) {
                  if (
                    await handleConfigAction("add_admin", newAdminPhone.trim())
                  )
                    setNewAdminPhone("");
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Teléfono completo con código de país"
                value={newAdminPhone}
                onChange={(e) => setNewAdminPhone(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 font-mono"
              />
              <button
                type="submit"
                disabled={changing}
                className="px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-xs shadow-gold-glow flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Admin</span>
              </button>
            </form>

            {/* Admin List */}
            <div className="space-y-2">
              {adminPhones.map((phone) => (
                <div
                  key={phone}
                  className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs">
                      <Crown className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="font-mono font-bold text-white text-xs">
                        +{phone}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        Administrador verificado
                      </div>
                    </div>
                  </div>

                  {
                    <button
                      onClick={() => handleConfigAction("remove_admin", phone)}
                      disabled={changing}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                      title="Quitar permisos"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: LISTA NEGRA / BLOQUEO */}
        {activeTab === "blacklist" && (
          <div className="glass-panel p-6 rounded-3xl border border-red-500/20 space-y-6 max-w-3xl mx-auto">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span>Lista Negra (Números Bloqueados)</span>
              </h2>
              <p className="text-gray-400 text-xs">
                El bot ignorará silenciosamente cualquier mensaje proveniente de
                estos números. Útil para bloquear clientes conflictivos,
                competencia desleal o bots de spam.
              </p>
            </div>

            {/* Add Blacklist Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (newBlacklistPhone.trim()) {
                  if (
                    await handleConfigAction(
                      "add_blacklist",
                      newBlacklistPhone.trim(),
                    )
                  )
                    setNewBlacklistPhone("");
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ej: 5358999999"
                value={newBlacklistPhone}
                onChange={(e) => setNewBlacklistPhone(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-400 font-mono"
              />
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 font-extrabold text-xs flex items-center gap-1.5 transition-all"
                disabled={changing}
              >
                <Plus className="w-4 h-4" />
                <span>{changing ? "Guardando…" : "Bloquear Número"}</span>
              </button>
            </form>

            {/* Blacklist List */}
            <div className="space-y-2">
              {blacklistedPhones.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-xs">
                  No hay ningún número bloqueado en este momento.
                </div>
              ) : (
                blacklistedPhones.map((phone) => (
                  <div
                    key={phone}
                    className="p-3.5 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center font-bold text-xs">
                        🚫
                      </div>
                      <div>
                        <div className="font-mono font-bold text-white text-xs">
                          +{phone}
                        </div>
                        <div className="text-[11px] text-gray-400">
                          Totalmente bloqueado para el bot
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        handleConfigAction("remove_blacklist", phone)
                      }
                      className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title="Desbloquear"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-30"
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {data?.totalPages || 1}
                </span>
                <button
                  disabled={page >= (data?.totalPages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 disabled:opacity-30"
                >
                  Siguiente
                </button>
              </div>
              <button
                onClick={() => void restore()}
                className="text-amber-400 hover:text-amber-300 font-bold"
              >
                Recuperar registros archivados
              </button>
            </div>
            <details className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-gray-300 hover:text-amber-300">
                Estado de envíos y atención humana{" "}
                <span className="text-gray-500 font-normal">
                  · {data?.pendingOutbound ?? 0} pendientes ·{" "}
                  {data?.pausedCount ?? 0} en atención
                </span>
              </summary>
              <div className="p-4 border-t border-white/10 space-y-4 text-xs">
                <p className="text-gray-500">
                  Última señal de la PC: {time(metrics?.lastPingAt)} · Datos:{" "}
                  {time(data?.generatedAt)} · IA hoy:{" "}
                  {metrics?.tokensToday ?? "—"} tokens /{" "}
                  {metrics?.failuresToday ?? "—"} errores.
                </p>
                <p className="text-gray-400">
                  Los mensajes en cola esperan a que tu PC esté conectada.
                  Enviado significa aceptado por WhatsApp, no leído.
                </p>
                <div className="space-y-2">
                  {data?.outbound.map((d) => (
                    <div
                      key={d._id}
                      className="flex flex-wrap justify-between gap-2 rounded-xl bg-[#0B0F19] border border-white/10 px-3 py-2"
                    >
                      <span className="font-mono text-gray-300">+{d.to}</span>
                      <span
                        className={
                          d.status === "failed"
                            ? "text-red-300"
                            : "text-emerald-300"
                        }
                      >
                        {statusLabel[d.status] || d.status}
                      </span>
                      {d.error && (
                        <p className="w-full text-red-300">{d.error}</p>
                      )}
                    </div>
                  ))}
                  {!data?.outbound.length && (
                    <p className="text-gray-500">Sin envíos recientes.</p>
                  )}
                </div>
                <div className="space-y-2">
                  {data?.pausedPhones.map((p) => (
                    <div
                      key={p}
                      className="flex justify-between items-center rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2"
                    >
                      <span className="text-gray-300">
                        +{p} · Atención humana
                      </span>
                      <button
                        onClick={() => void change("resume", p)}
                        className="text-amber-300 font-bold hover:text-white"
                      >
                        Reactivar bot
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}
      </main>

      {/* Modal de Detalle de Mensaje */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de conversación"
            className="glass-panel max-w-xl w-full max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-8 border border-white/20 space-y-5 animate-fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Detalle de Conversación</span>
                  {selectedLog.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                      <Crown className="w-3 h-3 text-amber-400" />
                      <span>Admin</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">
                      <User className="w-3 h-3 text-cyan-400" />
                      <span>Cliente</span>
                    </span>
                  )}
                </h3>
                <p className="text-gray-400 font-mono text-xs mt-0.5">
                  +{selectedLog.senderPhone} •{" "}
                  {new Date(selectedLog.timestamp).toLocaleString("es-CU", {
                    timeZone: "America/Havana",
                  })}
                </p>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-bold"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-gray-400 font-bold block mb-1">
                  Pregunta / Comando del Usuario:
                </span>
                <div className="p-3 rounded-xl bg-[#0B0F19] border border-white/10 text-white font-medium whitespace-pre-wrap">
                  {selectedLog.userMessage}
                </div>
              </div>

              <div>
                <span className="text-gray-400 font-bold block mb-1">
                  Respuesta del asistente / equipo:
                </span>
                <div className="p-3 rounded-xl bg-[#0B0F19] border border-white/10 text-emerald-300 whitespace-pre-wrap leading-relaxed">
                  {selectedLog.botReply}
                </div>
              </div>
            </div>

            {selectedLog.senderPhone !== "web-admin" && (
              <button
                onClick={() =>
                  void change(
                    data?.pausedPhones.includes(selectedLog.senderPhone)
                      ? "resume"
                      : "pause",
                    selectedLog.senderPhone,
                  )
                }
                className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 font-bold text-xs hover:bg-amber-500/20"
              >
                {data?.pausedPhones.includes(selectedLog.senderPhone)
                  ? "Reactivar respuestas del bot"
                  : "Pausar bot y atender personalmente"}
              </button>
            )}
            {/* Respuestas mediante la cola autenticada */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-bold text-xs flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Enviar Respuesta Directa al Cliente:</span>
                </span>
                <span className="text-[11px] text-gray-400">
                  Destinatario:{" "}
                  <strong className="text-white">
                    +{selectedLog.senderPhone}
                  </strong>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder={`Escribir respuesta para +${selectedLog.senderPhone}...`}
                  value={directReplyText}
                  onChange={(e) => {
                    setDirectReplyText(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !isSendingReply &&
                      directReplyText.trim() &&
                      selectedLog.senderPhone !== "web-admin"
                    ) {
                      handleSendDirectReply();
                    }
                  }}
                  className="flex-1 px-3.5 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 shadow-inner"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendDirectReply}
                    disabled={
                      isSendingReply ||
                      !directReplyText.trim() ||
                      selectedLog.senderPhone === "web-admin"
                    }
                    className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950/40 active:scale-95"
                  >
                    {isSendingReply ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Poner en cola</span>
                      </>
                    )}
                  </button>

                  {selectedLog.senderPhone !== "web-admin" && (
                    <a
                      href={`https://wa.me/${selectedLog.senderPhone}?text=${encodeURIComponent(directReplyText.trim() || "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                      title="Abrir este mensaje directamente en tu WhatsApp Web"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">WhatsApp Web</span>
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-white/10 text-[11px] text-gray-500">
              <div className="flex items-center gap-3">
                <span>
                  Tiempo de procesamiento: {selectedLog.responseTimeMs ?? 0}ms
                </span>
                <button
                  onClick={() => handleDeleteLog(selectedLog.id)}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 font-bold transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Archivar</span>
                </button>
              </div>
              {selectedLog.senderPhone !== "web-admin" && (
                <a
                  href={`https://wa.me/${selectedLog.senderPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline font-bold flex items-center gap-1"
                >
                  <span>Abrir chat en WhatsApp Web</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
