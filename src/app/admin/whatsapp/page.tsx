'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

interface WhatsAppLogItem {
  id: string;
  timestamp: string;
  senderPhone: string;
  role: 'admin' | 'client';
  userMessage: string;
  botReply: string;
  actionExecuted: string;
  responseTimeMs: number;
}

interface Metrics {
  totalLogs: number;
  todayLogsCount: number;
  clientQueriesToday: number;
  adminCommandsToday: number;
  uniqueClientsTodayCount: number;
  uniqueClientsTotalCount: number;
  activeRate: number;
  botStatus: string;
  botPhone: string;
  topBrands: { brand: string; count: number }[];
}

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
            <div key={i} className="glass-card rounded-2xl p-5 border border-white/5 bg-white/[0.02] space-y-3">
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
              <div key={row} className="h-16 w-full rounded-2xl bg-white/[0.03] border border-white/5 flex items-center px-4 justify-between">
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  const [activeTab, setActiveTab] = useState<'logs' | 'admins' | 'blacklist' | 'qr'>('logs');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogItem[]>([]);
  const [adminPhones, setAdminPhones] = useState<string[]>([]);
  const [blacklistedPhones, setBlacklistedPhones] = useState<string[]>([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'client'>('all');

  // Modal de detalle
  const [selectedLog, setSelectedLog] = useState<WhatsAppLogItem | null>(null);

  // Form inputs
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newBlacklistPhone, setNewBlacklistPhone] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live Features: Sound & Desktop Notifications
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundEnabledRef = useRef(false);
  const lastLogIdRef = useRef<string | null>(null);

  // Cargar preferencia de sonido guardada en localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('el_arca_whatsapp_sound') === 'true';
      setSoundEnabled(saved);
      soundEnabledRef.current = saved;
    } catch {}
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    try {
      localStorage.setItem('el_arca_whatsapp_sound', String(next));
    } catch {}

    if (next) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      playNotificationSound();
      triggerToast('🔔 Alertas sonoras y notificaciones activadas');
    } else {
      triggerToast('🔕 Alertas silenciadas');
    }
  };

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio not permitted without interaction
    }
  };

  const exportToCSV = () => {
    if (filteredLogs.length === 0) {
      triggerToast('No hay registros para exportar');
      return;
    }
    const headers = ['Fecha', 'Hora', 'Telefono', 'Rol', 'Mensaje_Usuario', 'Respuesta_Bot', 'Accion', 'Tiempo_Respuesta_ms'];
    const rows = filteredLogs.map((l) => {
      const d = new Date(l.timestamp);
      return [
        d.toLocaleDateString('es-CU'),
        d.toLocaleTimeString('es-CU'),
        `+${l.senderPhone}`,
        l.role,
        `"${(l.userMessage || '').replace(/"/g, '""')}"`,
        `"${(l.botReply || '').replace(/"/g, '""')}"`,
        l.actionExecuted || '',
        l.responseTimeMs || 0,
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `el_arca_whatsapp_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerToast('Reporte CSV descargado con éxito');
  };

  const handleDeleteLog = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/whatsapp/admin/stats?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setLogs((prev) => prev.filter((l) => l.id !== id));
        if (selectedLog?.id === id) setSelectedLog(null);
        triggerToast('Registro eliminado');
      } else {
        triggerToast('Error al eliminar');
      }
    } catch {
      triggerToast('Error de conexión');
    }
  };

  const handleClearAllLogs = async () => {
    if (!window.confirm('¿Seguro que deseas vaciar TODOS los registros de conversación de WhatsApp? Esta acción no se puede deshacer.')) return;
    try {
      const res = await fetch('/api/whatsapp/admin/stats?clearAll=true', {
        method: 'DELETE',
      });
      if (res.ok) {
        setLogs([]);
        setSelectedLog(null);
        triggerToast('Historial vaciado completamente');
      } else {
        triggerToast('Error al vaciar');
      }
    } catch {
      triggerToast('Error de conexión');
    }
  };

  // Direct reply from modal
  const [directReplyText, setDirectReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [sendErrorFallback, setSendErrorFallback] = useState<string | null>(null);

  const handleSendDirectReply = async () => {
    if (!selectedLog || !directReplyText.trim()) return;
    setIsSendingReply(true);
    setSendErrorFallback(null);
    let delivered = false;

    // Intento 1: A través de la API Next.js /api/whatsapp/admin/send (con margen amplio de 12s para evitar falsos negativos)
    try {
      const res = await fetch('/api/whatsapp/admin/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: selectedLog.senderPhone,
          text: directReplyText.trim(),
        }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        delivered = true;
      }
    } catch {
      // Endpoint cloud timeout o bridge unreachable
    }

    // Intento 2: Si estamos navegando en localhost y falló el endpoint API
    if (!delivered && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      try {
        const localRes = await fetch('http://localhost:7860/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: selectedLog.senderPhone,
            text: directReplyText.trim(),
            secret: 'el_arca_bridge_secret_2026',
          }),
          signal: AbortSignal.timeout(8000),
        });
        const localData = await localRes.json().catch(() => ({}));
        if (localRes.ok && localData.success) {
          delivered = true;
        }
      } catch {
        // Local bridge no accesible
      }
    }

    if (delivered) {
      triggerToast(`✅ Mensaje enviado exitosamente a +${selectedLog.senderPhone}`);
      setDirectReplyText('');
      setSendErrorFallback(null);
      fetchData({ silent: true });
    } else {
      const fallbackUrl = `https://wa.me/${selectedLog.senderPhone}?text=${encodeURIComponent(directReplyText.trim())}`;
      setSendErrorFallback(fallbackUrl);
      triggerToast('⚠️ El bot no respondió en este momento. Puedes abrir WhatsApp Web directamente.');
    }
    setIsSendingReply(false);
  };

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Auth check
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
    setIsCheckingAuth(false);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === '120397') {
      sessionStorage.setItem('el_arca_admin_auth', 'true');
      setIsAuthenticated(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

  // Carga de datos (con soporte para refresco silencioso en segundo plano)
  const fetchData = async (options?: { silent?: boolean }) => {
    const isSilent = options?.silent === true;
    if (!isSilent) setLoading(true);
    try {
      const [statsRes, configRes] = await Promise.all([
        fetch('/api/whatsapp/admin/stats', { cache: 'no-store' }),
        fetch('/api/whatsapp/admin/config', { cache: 'no-store' }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setMetrics(statsData.metrics);
        const incomingLogs: WhatsAppLogItem[] = statsData.recentLogs || [];

        // Detectar nuevo mensaje entrante para disparar alerta sonora y push notification
        if (
          soundEnabledRef.current &&
          lastLogIdRef.current &&
          incomingLogs.length > 0 &&
          incomingLogs[0].id !== lastLogIdRef.current
        ) {
          playNotificationSound();
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              const notif = new Notification('El Arca WhatsApp - Nuevo Mensaje', {
                body: `+${incomingLogs[0].senderPhone}: "${(incomingLogs[0].userMessage || '').slice(0, 75)}"`,
                icon: '/favicon.ico',
              });
              notif.onclick = () => {
                window.focus();
              };
            } catch {}
          }
        }

        if (incomingLogs.length > 0) {
          lastLogIdRef.current = incomingLogs[0].id;
        }
        setLogs(incomingLogs);
      }

      if (configRes.ok) {
        const configData = await configRes.json();
        setAdminPhones(configData.adminPhones || []);
        setBlacklistedPhones(configData.blacklistedPhones || []);
      }
    } catch (err) {
      console.error('Error fetching WhatsApp data:', err);
      if (!isSilent) triggerToast('Error cargando datos de WhatsApp');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
      // Polling silencioso en segundo plano cada 20s sin parpadeos ni bloqueos de pantalla
      const interval = setInterval(() => {
        fetchData({ silent: true });
      }, 20000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  // Handlers para admins y blacklist
  const handleConfigAction = async (action: string, phone: string) => {
    try {
      const res = await fetch('/api/whatsapp/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdminPhones(data.adminPhones || []);
        setBlacklistedPhones(data.blacklistedPhones || []);
        triggerToast('Configuración actualizada correctamente');
      } else {
        triggerToast(data.error || 'Error al actualizar');
      }
    } catch (err) {
      triggerToast('Error de conexión');
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (roleFilter !== 'all' && log.role !== roleFilter) return false;
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        log.senderPhone.includes(term) ||
        log.userMessage.toLowerCase().includes(term) ||
        log.botReply.toLowerCase().includes(term) ||
        (log.actionExecuted && log.actionExecuted.toLowerCase().includes(term))
      );
    });
  }, [logs, roleFilter, searchTerm]);

  // Si está verificando auth en sessionStorage, muestra skeleton para evitar brincos
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
            <h1 className="text-2xl font-extrabold text-white">Panel WhatsApp IA</h1>
            <p className="text-gray-400 text-sm mt-1">Acceso restringido para administración de El Arca</p>
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
            {authError && <p className="text-red-400 text-xs font-bold">Contraseña incorrecta</p>}
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
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-bold text-emerald-300 shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
              <span>Bot: +53 {metrics?.botPhone || '63657247'}</span>
              <span className="hidden sm:inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-extrabold">Activo</span>
            </div>

            <button
              onClick={() => fetchData()}
              disabled={loading}
              title="Refrescar datos ahora"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all hover:scale-105 active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
              Supervisa las conversaciones de clientes, órdenes ejecutadas por el administrador, gestiona listas de acceso y monitorea el servicio en tiempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href="http://localhost:7860/scan?key=elarca2026"
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

        {/* Quick Stats Grid */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Mensajes Hoy</span>
              <MessageSquare className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.todayLogsCount ?? 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Total acumulado: {metrics?.totalLogs ?? 0} msgs
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Clientes Atendidos</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {metrics?.uniqueClientsTodayCount ?? 0}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Clientes únicos totales: {metrics?.uniqueClientsTotalCount ?? 0}
            </div>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-white/10 relative overflow-hidden">
            <div className="flex items-center justify-between text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
              <span>Órdenes Admin</span>
              <Cpu className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-300">
              {metrics?.adminCommandsToday ?? 0}
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
              1x{metrics?.activeRate ?? 340} <span className="text-xs font-bold text-gray-400">CUP</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              Precios calculados en tiempo real
            </div>
          </div>
        </section>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'logs'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Historial de Conversaciones ({logs.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'admins'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Administradores ({adminPhones.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('blacklist')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === 'blacklist'
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Lista Negra / Bloqueados ({blacklistedPhones.length})</span>
          </button>
        </div>

        {/* TAB 1: HISTORIAL DE LOGS */}
        {activeTab === 'logs' && (
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
                  onClick={() => setRoleFilter('all')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold ${
                    roleFilter === 'all'
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'text-gray-400 hover:bg-white/5'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setRoleFilter('client')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    roleFilter === 'client'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-gray-400 hover:bg-white/5'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Clientes</span>
                </button>
                <button
                  onClick={() => setRoleFilter('admin')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 ${
                    roleFilter === 'admin'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'text-gray-400 hover:bg-white/5'
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
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/35 shadow-sm shadow-amber-950/30'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border-white/10'
                  }`}
                  title={soundEnabled ? 'Click para silenciar alertas' : 'Click para activar alertas sonoras y notificaciones'}
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
                    title="Vaciar todos los registros"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Logs Table / Cards */}
            {filteredLogs.length === 0 ? (
              <div className="glass-panel p-12 rounded-3xl border border-white/10 text-center space-y-3">
                <MessageSquare className="w-10 h-10 text-gray-500 mx-auto" />
                <p className="text-gray-300 font-bold text-sm">No hay registros que coincidan con la búsqueda</p>
                <p className="text-gray-500 text-xs">Los mensajes recibidos en WhatsApp aparecerán aquí en vivo.</p>
              </div>
            ) : (
              <div className="glass-panel rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto">
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
                        const timeStr = dateObj.toLocaleTimeString('es-CU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        const dateStr = dateObj.toLocaleDateString('es-CU', {
                          day: '2-digit',
                          month: 'short',
                        });

                        const isOwner =
                          log.senderPhone === '113198191661280' ||
                          log.senderPhone === '5352031972' ||
                          log.senderPhone.endsWith('52031972');

                        const displayPhone = isOwner ? '5352031972' : log.senderPhone;
                        const displayRole = isOwner ? 'admin' : log.role;

                        return (
                          <tr
                            key={log.id}
                            onClick={() => setSelectedLog({ ...log, senderPhone: displayPhone, role: displayRole })}
                            className="hover:bg-white/5 transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-gray-400">
                              {dateStr} {timeStr}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
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
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {displayRole === 'admin' ? (
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
                            <td className="py-3 px-4 max-w-md truncate text-gray-400">
                              {log.botReply.replace(/[*_#]/g, '')}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              {log.actionExecuted ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                  {log.actionExecuted}
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-500">
                                  {log.responseTimeMs ? `${log.responseTimeMs}ms` : 'Consulta'}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => handleDeleteLog(log.id, e)}
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                                title="Eliminar registro"
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
        )}

        {/* TAB 2: GESTIÓN DE ADMINISTRADORES */}
        {activeTab === 'admins' && (
          <div className="glass-panel p-6 rounded-3xl border border-white/10 space-y-6 max-w-3xl mx-auto">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <span>Números Autorizados con Acceso Administrador</span>
              </h2>
              <p className="text-gray-400 text-xs">
                Los teléfonos incluidos en esta lista tienen permisos totales para cambiar precios, consultar stock real, registrar ventas y consultar balances en lenguaje natural por WhatsApp.
              </p>
            </div>

            {/* Add Admin Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newAdminPhone.trim()) {
                  handleConfigAction('add_admin', newAdminPhone.trim());
                  setNewAdminPhone('');
                }
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                placeholder="Ej: 5352031972 o 52031972"
                value={newAdminPhone}
                onChange={(e) => setNewAdminPhone(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 font-mono"
              />
              <button
                type="submit"
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
                      <div className="font-mono font-bold text-white text-xs">+{phone}</div>
                      <div className="text-[11px] text-gray-400">
                        {phone === '5352031972' || phone.endsWith('52031972')
                          ? 'Dueño Principal (Osvaldo - Protegido • WhatsApp LID Vinculado)'
                          : 'Administrador Secundario'}
                      </div>
                    </div>
                  </div>

                  {phone !== '5352031972' && !phone.endsWith('52031972') && (
                    <button
                      onClick={() => handleConfigAction('remove_admin', phone)}
                      className="p-2 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                      title="Quitar permisos"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: LISTA NEGRA / BLOQUEO */}
        {activeTab === 'blacklist' && (
          <div className="glass-panel p-6 rounded-3xl border border-red-500/20 space-y-6 max-w-3xl mx-auto">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-red-400" />
                <span>Lista Negra (Números Bloqueados)</span>
              </h2>
              <p className="text-gray-400 text-xs">
                El bot ignorará silenciosamente cualquier mensaje proveniente de estos números. Útil para bloquear clientes conflictivos, competencia desleal o bots de spam.
              </p>
            </div>

            {/* Add Blacklist Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newBlacklistPhone.trim()) {
                  handleConfigAction('add_blacklist', newBlacklistPhone.trim());
                  setNewBlacklistPhone('');
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
              >
                <Plus className="w-4 h-4" />
                <span>Bloquear Número</span>
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
                        <div className="font-mono font-bold text-white text-xs">+{phone}</div>
                        <div className="text-[11px] text-gray-400">Totalmente bloqueado para el bot</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleConfigAction('remove_blacklist', phone)}
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
      </main>

      {/* Modal de Detalle de Mensaje */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-panel max-w-xl w-full rounded-3xl p-6 sm:p-8 border border-white/20 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Detalle de Conversación</span>
                  {selectedLog.role === 'admin' ? (
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
                  +{selectedLog.senderPhone} • {new Date(selectedLog.timestamp).toLocaleString('es-CU')}
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
                <span className="text-gray-400 font-bold block mb-1">Pregunta / Comando del Usuario:</span>
                <div className="p-3 rounded-xl bg-[#0B0F19] border border-white/10 text-white font-medium whitespace-pre-wrap">
                  {selectedLog.userMessage}
                </div>
              </div>

              <div>
                <span className="text-gray-400 font-bold block mb-1">Respuesta entregada por la IA:</span>
                <div className="p-3 rounded-xl bg-[#0B0F19] border border-white/10 text-emerald-300 whitespace-pre-wrap leading-relaxed">
                  {selectedLog.botReply}
                </div>
              </div>
            </div>

            {/* Direct Quick Reply from Panel with Multi-Layer Fallback */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 font-bold text-xs flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Enviar Respuesta Directa al Cliente:</span>
                </span>
                <span className="text-[11px] text-gray-400">
                  Destinatario: <strong className="text-white">+{selectedLog.senderPhone}</strong>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder={`Escribir respuesta para +${selectedLog.senderPhone}...`}
                  value={directReplyText}
                  onChange={(e) => {
                    setDirectReplyText(e.target.value);
                    if (sendErrorFallback) setSendErrorFallback(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isSendingReply && directReplyText.trim()) {
                      handleSendDirectReply();
                    }
                  }}
                  className="flex-1 px-3.5 py-2.5 bg-[#0B0F19] border border-white/10 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-400 shadow-inner"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendDirectReply}
                    disabled={isSendingReply || !directReplyText.trim()}
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
                        <span>Enviar con Bot</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`https://wa.me/${selectedLog.senderPhone}?text=${encodeURIComponent(directReplyText.trim() || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                    title="Abrir este mensaje directamente en tu WhatsApp Web"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">WhatsApp Web</span>
                  </a>
                </div>
              </div>

              {/* Banner de contingencia y retroalimentación si el bot no está accesible */}
              {sendErrorFallback && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>El bot local no respondió. El mensaje está listo para enviar en tu WhatsApp Web:</span>
                  </div>
                  <a
                    href={sendErrorFallback}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs flex items-center gap-1.5 transition-all shrink-0 shadow-sm"
                  >
                    <span>Abrir y Enviar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-white/10 text-[11px] text-gray-500">
              <div className="flex items-center gap-3">
                <span>Tiempo de procesamiento: {selectedLog.responseTimeMs}ms</span>
                <button
                  onClick={() => handleDeleteLog(selectedLog.id)}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 font-bold transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Eliminar</span>
                </button>
              </div>
              <a
                href={`https://wa.me/${selectedLog.senderPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:underline font-bold flex items-center gap-1"
              >
                <span>Abrir chat en WhatsApp Web</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
