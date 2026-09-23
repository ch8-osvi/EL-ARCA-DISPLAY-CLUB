'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Sparkles,
  Send,
  ShieldAlert,
  Bot,
  User,
  RefreshCw,
  Trash2,
  DollarSign,
  Calendar,
  AlertTriangle,
  TrendingUp,
  Smartphone,
  Boxes,
  MessageSquare,
  Plus,
  History,
  X,
  ChevronRight,
  Clock,
  CheckCircle2,
  Edit3,
  Copy,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
  isTyping?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

interface PresetPrompt {
  icon: any;
  label: string;
  description: string;
  prompt: string;
  tag: string;
  type: 'query' | 'template';
}

const PRESET_PROMPTS: PresetPrompt[] = [
  // ── ANALYTICS ────────────────────────────────────────────────────────────────
  {
    icon: DollarSign,
    label: '¿Cuánto vendí hoy?',
    description: 'Total recaudado hoy en USD/CUP y órdenes despachadas.',
    prompt: '¿Cuánto vendí hoy en total y cuántas órdenes se registraron?',
    tag: 'Ventas',
    type: 'query',
  },
  {
    icon: Calendar,
    label: '¿Cuánto vendí ayer?',
    description: 'Comparativa de facturación de la jornada anterior.',
    prompt: '¿Cuánto vendí ayer y qué displays se despacharon?',
    tag: 'Histórico',
    type: 'query',
  },
  {
    icon: AlertTriangle,
    label: '¿Quién me debe?',
    description: 'Listado de órdenes pendientes de cobro y deudores.',
    prompt: '¿Quién me debe dinero y cuántas personas tienen pagos pendientes?',
    tag: 'Cobranzas',
    type: 'query',
  },
  {
    icon: ShieldAlert,
    label: 'Mermas y Garantías',
    description: 'Ranking de modelos con más bajas, roturas y motivos.',
    prompt: '¿Cuáles son los modelos con más problemas de garantía o mermas?',
    tag: 'Taller',
    type: 'query',
  },
  {
    icon: Smartphone,
    label: 'Displays más vendidos',
    description: 'Top de rotación de pantallas por volumen y demanda.',
    prompt: '¿Cuáles son los 5 displays más vendidos?',
    tag: 'Rotación',
    type: 'query',
  },
  {
    icon: Boxes,
    label: 'Stock y Agotados',
    description: 'Modelos en cero o con existencias bajas.',
    prompt: '¿Qué modelos están agotados o con bajo stock?',
    tag: 'Inventario',
    type: 'query',
  },
  {
    icon: Copy,
    label: 'Detectar duplicados',
    description: 'Encuentra pantallas multi-compatibles registradas con nombres diferentes.',
    prompt: '¿Qué pantallas están duplicadas en el inventario?',
    tag: 'Catálogo',
    type: 'query',
  },
  {
    icon: TrendingUp,
    label: 'Día récord de ventas',
    description: 'El día histórico de mayor facturación.',
    prompt: '¿Cuál ha sido el día récord de mayores ventas?',
    tag: 'Récord',
    type: 'query',
  },
  // ── GESTIÓN / ACCIONES ───────────────────────────────────────────────────────
  {
    icon: Plus,
    label: 'Registrar venta rápida',
    description: 'Carga plantilla para registrar venta y descontar stock.',
    prompt: 'Registrar venta rápida: 1 [Modelo de Pantalla] al cliente [Consumidor Final], pagado en [USD o CUP].',
    tag: 'Gestión',
    type: 'template',
  },
  {
    icon: DollarSign,
    label: 'Cambiar precio de producto',
    description: 'Carga plantilla para actualizar precio en catálogo.',
    prompt: 'Cambia el precio de [Modelo exacto] a $[Nuevo Precio] USD.',
    tag: 'Precios',
    type: 'template',
  },
  {
    icon: Boxes,
    label: 'Ajustar stock de producto',
    description: 'Carga plantilla para sumar o restar unidades en almacén.',
    prompt: 'Ajustar stock de [Modelo exacto]: sumar [Cantidad] unidades por motivo: [Motivo]',
    tag: 'Stock',
    type: 'template',
  },
  {
    icon: CheckCircle2,
    label: 'Marcar orden como pagada',
    description: 'Carga plantilla para saldar deuda de una orden.',
    prompt: 'Marca la orden #[Código de Orden] como pagada.',
    tag: 'Cobros',
    type: 'template',
  },
  {
    icon: Trash2,
    label: 'Anular orden de venta',
    description: 'Cancela orden y reintegra las pantallas al almacén.',
    prompt: 'Anula la orden #[Código de Orden] por motivo: [Motivo de la anulación]',
    tag: 'Órdenes',
    type: 'template',
  },
  {
    icon: RefreshCw,
    label: 'Actualizar tasa de cambio',
    description: 'Modifica la tasa oficial de conversión USD a CUP.',
    prompt: 'Actualiza la tasa de cambio oficial a: 1 USD = [Tasa en CUP] CUP.',
    tag: 'Finanzas',
    type: 'template',
  },
  {
    icon: Plus,
    label: 'Agregar nuevo producto',
    description: 'Carga plantilla para dar de alta un nuevo repuesto.',
    prompt: 'Agrega al catálogo: Marca [Marca], Modelo [Modelo], Calidad [ORIGINAL C/M / S/M / INCELL], Precio $[Precio] USD, Stock [Cantidad] unidades.',
    tag: 'Catálogo',
    type: 'template',
  },
];

const SESSIONS_STORAGE_KEY = 'el_arca_ai_chat_sessions_v2';
const ACTIVE_SESSION_KEY = 'el_arca_ai_active_session_id';

const createDefaultSession = (): ChatSession => {
  const now = Date.now();
  const timeStr = new Date(now).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return {
    id: `session-${now}`,
    title: 'Nueva Conversación',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `welcome-${now}`,
        sender: 'assistant',
        text: `👋 **¡Hola! Soy tu Asistente de Gestión IA de El Arca Display Club.**\n\nEstoy conectado en tiempo real a tu base de datos MongoDB. Puedo **consultar Y modificar** tu negocio:\n\n📊 **Analíticas:** ventas de hoy/ayer, deudores, mermas, top productos\n🛍️ **Gestión:** crear órdenes, cambiar precios, ajustar stock, agregar productos\n💳 **Cobros:** marcar órdenes como pagadas o pendientes\n\nUsa las **Acciones Rápidas** del panel lateral o escribe directamente lo que necesitas.`,
        time: timeStr,
      },
    ],
  };
};

export default function AIAssistantPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [quotaAlert, setQuotaAlert] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [showHistorySidebar, setShowHistorySidebar] = useState<boolean>(false);
  const [showPromptsMobile, setShowPromptsMobile] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check auth
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Load chat sessions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SESSIONS_STORAGE_KEY);
      const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const found = parsed.find((s) => s.id === activeId);
          setActiveSessionId(found ? found.id : parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading AI chat sessions:', e);
    }

    // Default session if nothing found
    const initial = createDefaultSession();
    setSessions([initial]);
    setActiveSessionId(initial.id);
  }, []);

  // Persist sessions helper
  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving AI sessions:', e);
    }
  };

  // Find active session
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession?.messages || [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, []);

  // Start new conversation
  const handleNewChat = () => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setQuotaAlert(null);
    const newSession = createDefaultSession();
    const updated = [newSession, ...sessions];
    saveSessions(updated);
    setActiveSessionId(newSession.id);
    localStorage.setItem(ACTIVE_SESSION_KEY, newSession.id);
    setShowHistorySidebar(false);
  };

  // Select existing session
  const handleSelectSession = (id: string) => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setQuotaAlert(null);
    setActiveSessionId(id);
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
    setShowHistorySidebar(false);
  };

  // Delete a session
  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = sessions.filter((s) => s.id !== id);
    if (filtered.length === 0) {
      const fresh = createDefaultSession();
      saveSessions([fresh]);
      setActiveSessionId(fresh.id);
      localStorage.setItem(ACTIVE_SESSION_KEY, fresh.id);
    } else {
      saveSessions(filtered);
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id);
        localStorage.setItem(ACTIVE_SESSION_KEY, filtered[0].id);
      }
    }
  };

  // Typewriter streaming effect
  const startTypewriter = (fullText: string, messageId: string, targetSessionId: string) => {
    if (typingTimerRef.current) {
      clearInterval(typingTimerRef.current);
    }

    let currentIndex = 0;
    const chunkSize = 3;
    const speed = 16;

    typingTimerRef.current = setInterval(() => {
      currentIndex += chunkSize;
      const isFinished = currentIndex >= fullText.length;
      const currentText = isFinished ? fullText : fullText.slice(0, currentIndex);

      if (isFinished && typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
      }

      setSessions((prevSessions) => {
        const next = prevSessions.map((sess) => {
          if (sess.id !== targetSessionId) return sess;
          return {
            ...sess,
            updatedAt: Date.now(),
            messages: sess.messages.map((m) =>
              m.id === messageId ? { ...m, text: currentText, isTyping: !isFinished } : m
            ),
          };
        });

        if (isFinished) {
          try {
            localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(next));
          } catch (e) {
            console.error(e);
          }
        }
        return next;
      });
    }, speed);
  };

  const handleSendMessage = async (userPrompt?: string) => {
    const queryToSend = (userPrompt || inputQuery).trim();
    if (!queryToSend || loading || !activeSession) return;

    // Frontend validation: Prevent sending templates with unresolved placeholders
    if (/\[.*?\]/.test(queryToSend)) {
      setTemplateNotice('⚠️ Por favor, reemplaza los datos marcados entre [corchetes] antes de enviar.');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return;
    }

    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const currentSessionId = activeSession.id;

    // Append user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryToSend,
      time: timeStr,
    };

    // If first query in session, update title
    const isFirstQuery = activeSession.title === 'Nueva Conversación';
    const newTitle = isFirstQuery
      ? queryToSend.slice(0, 32) + (queryToSend.length > 32 ? '...' : '')
      : activeSession.title;

    const updatedSessionsWithUser = sessions.map((sess) => {
      if (sess.id !== currentSessionId) return sess;
      return {
        ...sess,
        title: newTitle,
        updatedAt: Date.now(),
        messages: [...sess.messages, userMsg],
      };
    });

    saveSessions(updatedSessionsWithUser);
    setInputQuery('');
    setTemplateNotice(null);
    setLoading(true);
    if (showPromptsMobile) setShowPromptsMobile(false);

    try {
      // Build conversation history for context
      const historyMessages = activeSession.messages
        .filter((m) => !m.id.startsWith('welcome-')) // Exclude the initial welcome message
        .filter((m) => m.sender !== 'assistant' || !m.isTyping) // exclude typing placeholders
        .slice(-20) // last 20 messages
        .map((m) => ({
          role: m.sender === 'user' ? 'user' : 'model' as 'user' | 'model',
          parts: [{ text: m.text }],
        }));

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: queryToSend,
          history: historyMessages, // send full extracted history without deleting the last message
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = {
          success: false,
          error: res.status === 504
            ? 'El servidor tardó demasiado en responder (Timeout 504). Por favor repite la pregunta en unos segundos.'
            : `El servidor respondió con código ${res.status}. Vuelve a intentar en unos segundos.`
        };
      }
      setLoading(false);

      if (res.ok && data?.success) {
        setQuotaAlert(null);
        const assistantMsgId = `assistant-${Date.now()}`;
        const assistantMsg: ChatMessage = {
          id: assistantMsgId,
          sender: 'assistant',
          text: '',
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          isTyping: true,
        };

        setSessions((prev) =>
          prev.map((sess) =>
            sess.id === currentSessionId
              ? { ...sess, updatedAt: Date.now(), messages: [...sess.messages, assistantMsg] }
              : sess
          )
        );

        startTypewriter(data.answer, assistantMsgId, currentSessionId);
      } else {
        const isQuota = data?.isQuotaExceeded || res.status === 429;
        if (isQuota) {
          setQuotaAlert('⏳ Límite temporal de 15 consultas/min de Gemini alcanzado. Espera unos segundos y vuelve a preguntar.');
          const quotaMsg: ChatMessage = {
            id: `quota-${Date.now()}`,
            sender: 'assistant',
            text: '⏳ **Límite temporal alcanzado (15 consultas por minuto)**\n\nGoogle Gemini está pausado temporalmente para respetar la cuota gratuita. **Tranquilo, no se te cobrará nada.** Por favor espera unos segundos y repite tu pregunta.',
            time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          };
          setSessions((prev) =>
            prev.map((sess) =>
              sess.id === currentSessionId
                ? { ...sess, updatedAt: Date.now(), messages: [...sess.messages, quotaMsg] }
                : sess
            )
          );
        } else {
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            sender: 'assistant',
            text: `⚠️ **Aviso de la IA:** ${data?.error || 'No se pudo obtener respuesta de Google Gemini en este momento.'}`,
            time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          };
          setSessions((prev) =>
            prev.map((sess) =>
              sess.id === currentSessionId
                ? { ...sess, updatedAt: Date.now(), messages: [...sess.messages, errorMsg] }
                : sess
            )
          );
        }
      }
    } catch (err: any) {
      setLoading(false);
      const connErrorMsg: ChatMessage = {
        id: `err-conn-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Error de conexión:** ${err?.message || 'No se pudo comunicar con el servidor analítico de la tienda.'}`,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setSessions((prev) =>
        prev.map((sess) =>
          sess.id === currentSessionId
            ? { ...sess, updatedAt: Date.now(), messages: [...sess.messages, connErrorMsg] }
            : sess
        )
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handlePresetClick = (p: PresetPrompt) => {
    if (p.type === 'query') {
      setTemplateNotice(null);
      handleSendMessage(p.prompt);
    } else {
      setInputQuery(p.prompt);
      setTemplateNotice('✏️ Plantilla interactiva cargada en el campo de texto. Rellena los datos entre [corchetes] y pulsa Preguntar.');
      if (showPromptsMobile) setShowPromptsMobile(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  };

  const handleClearCurrentChat = () => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    setQuotaAlert(null);
    setTemplateNotice(null);
    if (!activeSession) return;
    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const resetSession: ChatSession = {
      ...activeSession,
      updatedAt: Date.now(),
      messages: [
        {
          id: `welcome-${Date.now()}`,
          sender: 'assistant',
          text: `🧹 **Chat reiniciado.**\n\n¿Qué deseas consultar ahora sobre tus ventas, deudores o inventario de repuestos?`,
          time: timeStr,
        },
      ],
    };
    const updated = sessions.map((s) => (s.id === activeSession.id ? resetSession : s));
    saveSessions(updated);
  };

  // Format inline markdown
  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    const formatInline = (text: string) => {
      const codeParts = text.split(/(`.*?`)/g);
      return codeParts.map((cPart, cIdx) => {
        if (cPart.startsWith('`') && cPart.endsWith('`') && cPart.length > 2) {
          return (
            <code
              key={`c-${cIdx}`}
              className="px-1.5 py-0.5 mx-0.5 rounded bg-[#1A1E2E] text-amber-300 font-mono text-[11px] border border-amber-500/20"
            >
              {cPart.slice(1, -1)}
            </code>
          );
        }

        const boldParts = cPart.split(/(\*\*.*?\*\*)/g);
        return boldParts.map((bPart, bIdx) => {
          if (bPart.startsWith('**') && bPart.endsWith('**') && bPart.length > 4) {
            return (
              <strong key={`b-${cIdx}-${bIdx}`} className="text-[#F3E0A9] font-bold">
                {bPart.slice(2, -2)}
              </strong>
            );
          }

          const italicParts = bPart.split(/(\*.*?\*)/g);
          return italicParts.map((iPart, iIdx) => {
            if (iPart.startsWith('*') && iPart.endsWith('*') && iPart.length > 2 && !iPart.startsWith('**')) {
              return (
                <em key={`i-${cIdx}-${bIdx}-${iIdx}`} className="text-gray-300 italic">
                  {iPart.slice(1, -1)}
                </em>
              );
            }

            const linkParts = iPart.split(/(\[[^\]]+\]\([^)]+\))/g);
            return linkParts.map((lPart, lIdx) => {
              const linkMatch = lPart.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
              if (linkMatch) {
                const [, label, url] = linkMatch;
                return (
                  <Link
                    key={`link-${cIdx}-${bIdx}-${iIdx}-${lIdx}`}
                    href={url}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 mx-1 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 text-[#E5C158] font-semibold text-xs border border-[#D4AF37]/30 transition-all underline decoration-[#D4AF37]/40 hover:scale-[1.02] shadow-sm shadow-black/40"
                  >
                    {label} ↗
                  </Link>
                );
              }
              return lPart;
            });
          });
        });
      });
    };

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Table detection: line starts and ends with |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }

        const parsedRows = tableLines
          .map((tLine) =>
            tLine
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim())
          )
          .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)));

        if (parsedRows.length > 0) {
          const headerRow = parsedRows[0];
          const bodyRows = parsedRows.slice(1);

          elements.push(
            <div key={`tbl-${i}`} className="my-2.5 overflow-x-auto rounded-xl border border-white/10 bg-[#0E111C]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {headerRow.map((hCell, hIdx) => (
                      <th key={hIdx} className="px-3 py-2 text-[#E5C158] font-bold text-[11px] whitespace-nowrap">
                        {formatInline(hCell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {bodyRows.map((bRow, rIdx) => (
                    <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                      {bRow.map((bCell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 text-gray-300 whitespace-nowrap">
                          {formatInline(bCell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }

      // Headers (### Header)
      if (trimmed.startsWith('###') || trimmed.startsWith('##')) {
        const cleanHeader = trimmed.replace(/^#+\s*/, '');
        elements.push(
          <div key={`h-${i}`} className="pt-2 pb-1 font-bold text-sm text-[#E5C158] flex items-center gap-1.5">
            <span>{formatInline(cleanHeader)}</span>
          </div>
        );
        i++;
        continue;
      }

      // Bullet points (- or • or *)
      if (/^[-*•]\s+/.test(trimmed)) {
        const bulletContent = trimmed.replace(/^[-*•]\s+/, '');
        elements.push(
          <div key={`b-${i}`} className="flex items-start gap-2 pl-2 my-1 text-gray-200">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
            <div className="flex-1 leading-relaxed">{formatInline(bulletContent)}</div>
          </div>
        );
        i++;
        continue;
      }

      // Empty lines
      if (!trimmed) {
        elements.push(<div key={`sp-${i}`} className="h-1.5" />);
        i++;
        continue;
      }

      // Standard paragraph
      elements.push(
        <p key={`p-${i}`} className="my-0.5 leading-relaxed">
          {formatInline(line)}
        </p>
      );
      i++;
    }

    return elements;
  };

  // Auth gate
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 space-y-4 text-center max-w-sm shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-extrabold text-white">Acceso Denegado</h1>
          <p className="text-sm text-gray-400">
            Debes iniciar sesión en el panel de administrador primero para acceder a la IA.
          </p>
          <Link
            href="/admin"
            className="block px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-sm text-center shadow-gold-glow"
          >
            Ir al Panel Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#090A0F] text-white flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="h-16 sm:h-20 z-40 w-full glass-panel border-b border-purple-500/20 backdrop-blur-xl bg-[#090A0F]/95 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-[#D4AF37] hover:text-white transition-colors group px-2.5 py-1.5 rounded-xl hover:bg-white/5"
            title="Volver al Panel Administrador"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs sm:text-sm font-bold hidden sm:inline">Panel Admin</span>
          </Link>

          <div className="h-6 w-px bg-white/10" />

          {/* Toggle History Sidebar */}
          <button
            onClick={() => setShowHistorySidebar((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              showHistorySidebar
                ? 'bg-purple-600/30 border-purple-500/60 text-purple-200 shadow-lg'
                : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Ver historial de conversaciones"
          >
            <History className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden md:inline">Historial</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/10 font-bold">
              {sessions.length}
            </span>
          </button>

          <div className="flex items-center gap-2.5 pl-1">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 p-[1px] flex items-center justify-center shadow-lg shadow-purple-950/50 shrink-0">
              <div className="w-full h-full bg-[#10131E] rounded-[11px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              </div>
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-extrabold text-white leading-tight">
                Asistente Inteligente
              </h1>
              <p className="text-[10px] text-gray-400 hidden sm:block">
                Analítica & Decisiones de Negocio
              </p>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* New Chat Button */}
          <button
            onClick={handleNewChat}
            className="px-3 py-1.5 rounded-xl gold-gradient-bg text-black text-xs font-extrabold flex items-center gap-1.5 shadow-gold-glow hover:scale-105 transition-all"
            title="Iniciar nueva conversación"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Nuevo Chat</span>
          </button>

          {/* Mobile Toggle for Preset Prompts */}
          <button
            onClick={() => setShowPromptsMobile((prev) => !prev)}
            className="lg:hidden px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Ver preguntas frecuentes"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span className="hidden xs:inline">Preguntas</span>
          </button>

          {/* Clear Current Chat Button */}
          <button
            onClick={handleClearCurrentChat}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/5"
            title="Reiniciar chat actual"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reiniciar</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ========================================================================= */}
        {/* SIDEBAR IZQUIERDO: HISTORIAL DE CHATS (Desktop colapsable + Mobile Drawer) */}
        {/* ========================================================================= */}
        {showHistorySidebar && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setShowHistorySidebar(false)}
          />
        )}

        <aside
          className={`
            fixed lg:static top-0 bottom-0 left-0 z-50 lg:z-10
            w-72 sm:w-80 lg:w-72 shrink-0
            bg-[#0B0D17] border-r border-white/10
            flex flex-col justify-between
            transition-transform duration-300 ease-in-out
            ${showHistorySidebar ? 'translate-x-0' : '-translate-x-full lg:hidden'}
          `}
        >
          {/* Sidebar Top Header */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-200">
                Historial de Chats
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#D4AF37] hover:text-white transition-colors"
                title="Nueva conversación"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowHistorySidebar(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors lg:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {sessions.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                No hay conversaciones guardadas.
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                const formattedTime = new Date(sess.updatedAt).toLocaleDateString('es-ES', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess.id)}
                    className={`group w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-2 border ${
                      isActive
                        ? 'bg-purple-950/40 border-[#D4AF37]/50 text-white shadow-lg'
                        : 'bg-white/[0.02] border-transparent hover:bg-white/5 text-gray-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <MessageSquare
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#D4AF37]' : 'text-gray-500 group-hover:text-gray-300'
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold truncate leading-tight">
                          {sess.title}
                        </p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          <span>{formattedTime}</span>
                        </p>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      className="p-1 rounded text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Eliminar conversación"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-white/10 bg-[#0E111F]/50">
            <button
              onClick={handleNewChat}
              className="w-full py-2.5 px-3 rounded-xl gold-gradient-bg text-black font-extrabold text-xs flex items-center justify-center gap-2 shadow-gold-glow hover:scale-[1.02] transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nueva Conversación</span>
            </button>
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* ÁREA CENTRAL: FEED DE CHAT PRINCIPAL & INPUT */}
        {/* ========================================================================= */}
        <main className="flex-1 flex flex-col min-w-0 h-full bg-[#090A0F] relative">
          {/* Chat Message Scrollable Feed */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-4">
            <div className="max-w-3xl mx-auto space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 ${
                    msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-md ${
                      msg.sender === 'user'
                        ? 'gold-gradient-bg text-black'
                        : 'bg-gradient-to-br from-purple-600 to-indigo-700 text-white'
                    }`}
                  >
                    {msg.sender === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.sender === 'user'
                        ? 'bg-gradient-to-r from-[#D4AF37]/20 to-[#AA8826]/20 border border-[#D4AF37]/40 text-white shadow-gold-glow'
                        : 'bg-[#121626] border border-white/10 text-gray-200 shadow-xl'
                    }`}
                  >
                    <div className="space-y-1">
                      {renderMessageContent(msg.text)}
                      {msg.isTyping && (
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#D4AF37] animate-pulse rounded-sm align-middle" />
                      )}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-2 block text-right font-semibold">
                      {msg.time}
                    </span>
                  </div>
                </div>
              ))}

              {/* Thinking Indicator */}
              {loading && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shrink-0 shadow-lg shadow-purple-950/40">
                    <Bot className="w-4 h-4 animate-bounce" />
                  </div>
                  <div className="glass-card rounded-2xl px-4 py-3 border border-purple-500/30 flex items-center gap-2.5 text-xs text-purple-200 bg-[#121628]/90 shadow-xl">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                    <span className="font-semibold tracking-wide">
                      Consultando datos y procesando...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Quota / Limit Warning Banner */}
          {quotaAlert && (
            <div className="px-4 sm:px-6 pb-2 max-w-3xl mx-auto w-full">
              <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/50 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-lg shadow-amber-950/30">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span className="font-medium leading-relaxed">{quotaAlert}</span>
                </div>
                <button
                  onClick={() => setQuotaAlert(null)}
                  className="text-amber-300 hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 transition-colors shrink-0"
                >
                  Entendido
                </button>
              </div>
            </div>
          )}

          {/* Template Loaded Notice */}
          {templateNotice && (
            <div className="px-4 sm:px-6 pb-2 max-w-3xl mx-auto w-full">
              <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-[#D4AF37] shrink-0" />
                  <span className="font-medium leading-snug">{templateNotice}</span>
                </div>
                <button
                  onClick={() => setTemplateNotice(null)}
                  className="text-gray-400 hover:text-white text-[11px] font-bold px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors shrink-0"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* Quick Horizontal Carousel on Mobile */}
          <div className="lg:hidden px-4 py-1.5 overflow-x-auto flex items-center gap-1.5 scrollbar-none border-t border-white/5 bg-[#090A0F]">
            {PRESET_PROMPTS.slice(0, 6).map((p, idx) => (
              <button
                key={idx}
                onClick={() => handlePresetClick(p)}
                disabled={loading}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-gray-300 hover:text-white hover:border-[#D4AF37]/40 flex items-center gap-1 shrink-0"
              >
                <span>{p.label}</span>
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 sm:p-4 bg-[#0B0D17]/90 border-t border-white/10 backdrop-blur-md shrink-0">
            <div className="max-w-3xl mx-auto relative w-full">
              <input
                ref={inputRef}
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Pregunta o pide una acción (ej: vende 2 Samsung A04 a Mario, cambia precio Redmi 9A a $10...)..."
                disabled={loading}
                className="w-full pl-5 pr-28 py-3.5 bg-[#121624] border border-purple-500/30 rounded-2xl text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all disabled:opacity-50"
              />

              <button
                onClick={() => handleSendMessage()}
                disabled={loading || !inputQuery.trim()}
                className="absolute right-2 top-2 h-9 px-4 rounded-xl gold-gradient-bg text-black font-extrabold text-xs flex items-center gap-1.5 shadow-gold-glow hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100"
              >
                <span>Preguntar</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </main>

        {/* ========================================================================= */}
        {/* SIDEBAR DERECHO: CONSULTAS FRECUENTES (Desktop fijo + Mobile Modal Drawer) */}
        {/* ========================================================================= */}
        {showPromptsMobile && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setShowPromptsMobile(false)}
          />
        )}

        <aside
          className={`
            fixed lg:static top-0 bottom-0 right-0 z-50 lg:z-10
            w-80 xl:w-88 shrink-0
            bg-[#0B0D17] border-l border-white/10
            flex flex-col
            transition-transform duration-300 ease-in-out
            ${showPromptsMobile ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
          `}
        >
          {/* Header Panel Derecho */}
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-gray-200 block">
                  Consultas Frecuentes
                </span>
                <span className="text-[10px] text-gray-400">
                  Preguntas rápidas para la IA
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowPromptsMobile(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Cards Vertical List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {PRESET_PROMPTS.map((p, idx) => {
              const Icon = p.icon;
              const isTemplate = p.type === 'template';
              return (
                <button
                  key={idx}
                  onClick={() => handlePresetClick(p)}
                  disabled={loading}
                  className={`w-full text-left p-3 rounded-2xl glass-card border transition-all group disabled:opacity-50 relative overflow-hidden ${
                    isTemplate
                      ? 'border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/[0.04]'
                      : 'border-white/10 hover:border-[#D4AF37]/50 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 text-[#D4AF37] border border-white/10">
                        {p.tag}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                          isTemplate
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        }`}
                      >
                        {isTemplate ? '✏️ Plantilla' : '⚡ Directa'}
                      </span>
                    </div>
                    <Icon className="w-4 h-4 text-[#D4AF37] group-hover:scale-110 transition-transform" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-100 group-hover:text-[#F3E0A9] transition-colors leading-snug">
                    {p.label}
                  </h3>
                  <p className="text-[11px] text-gray-400 leading-normal mt-1">
                    {p.description}
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-[#D4AF37] font-semibold mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>{isTemplate ? 'Cargar plantilla al chat' : 'Consultar ahora'}</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Panel Info Badge Footer */}
          <div className="p-3 border-t border-white/10 bg-[#0E111F]/50 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-gray-400 leading-tight">
              Lee y modifica tu MongoDB en tiempo real — ventas, precios, stock y más.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
