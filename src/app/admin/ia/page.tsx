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
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  time: string;
}

const PRESET_PROMPTS = [
  {
    icon: DollarSign,
    label: '¿Cuánto he vendido hoy?',
    prompt: '¿Cuánto he vendido hoy en total y cuántas órdenes se registraron?',
  },
  {
    icon: Calendar,
    label: '¿Cuánto vendí ayer?',
    prompt: '¿Cuánto vendí ayer y qué displays se despacharon?',
  },
  {
    icon: AlertTriangle,
    label: '¿Quién me debe dinero?',
    prompt: '¿Quién me debe dinero y cuántas personas tienen pagos pendientes?',
  },
  {
    icon: TrendingUp,
    label: '¿Cuál fue el día récord?',
    prompt: '¿Cuál ha sido el día récord de mayores ventas en el historial?',
  },
  {
    icon: Smartphone,
    label: 'Displays más vendidos',
    prompt: '¿Cuáles son los 5 displays más vendidos y de mayor rotación?',
  },
  {
    icon: Boxes,
    label: 'Stock y agotados',
    prompt: '¿Qué modelos están agotados o con bajo stock de inventario?',
  },
];

export default function AIAssistantPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Check auth
  useEffect(() => {
    const auth = sessionStorage.getItem('el_arca_admin_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // Initial welcome message
  useEffect(() => {
    if (isAuthenticated && messages.length === 0) {
      setMessages([
        {
          id: 'welcome-1',
          sender: 'assistant',
          text: `👋 **¡Hola! Soy tu Asistente de Inteligencia de Negocio de El Arca Display Club.**\n\nEstoy conectado en tiempo real a tu base de datos de ventas, catálogo y clientes.\n\nPuedes hacerme cualquier pregunta sobre tus números o hacer clic en una de las sugerencias rápidas abajo:`,
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [isAuthenticated, messages.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (userPrompt?: string) => {
    const queryToSend = (userPrompt || inputQuery).trim();
    if (!queryToSend || loading) return;

    const timeStr = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Append user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryToSend,
      time: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: queryToSend }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Ocurrió un inconveniente:** ${data.error || 'No pude procesar la consulta en este momento.'}`,
          time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const connErrorMsg: ChatMessage = {
        id: `err-conn-${Date.now()}`,
        sender: 'assistant',
        text: '⚠️ **Error de conexión:** No se pudo comunicar con el servidor analítico de la tienda.',
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, connErrorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'assistant',
        text: `🧹 **Chat reiniciado.**\n\n¿Qué deseas consultar ahora sobre tus ventas o inventario?`,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Helper to render basic markdown-like bold and linebreaks
  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      // Process bold **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      const formattedParts = parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={pIdx} className="text-[#F3E0A9] font-extrabold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      return (
        <React.Fragment key={i}>
          {line.startsWith('* ') ? (
            <div className="flex items-start gap-2 pl-2 my-0.5">
              <span className="text-[#D4AF37]">•</span>
              <span>{formattedParts}</span>
            </div>
          ) : (
            <p className={line.trim() === '' ? 'h-2' : 'my-0.5'}>{formattedParts}</p>
          )}
        </React.Fragment>
      );
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#090A0F] text-white flex flex-col justify-center items-center p-4">
        <div className="glass-panel rounded-3xl p-8 border border-rose-500/30 space-y-4 text-center max-w-sm">
          <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
          <h1 className="text-xl font-extrabold text-white">Acceso Denegado</h1>
          <p className="text-sm text-gray-400">
            Debes iniciar sesión en el panel de administrador primero para acceder a la IA.
          </p>
          <Link
            href="/admin"
            className="block px-5 py-2.5 rounded-xl gold-gradient-bg text-black font-extrabold text-sm text-center"
          >
            Ir al Panel Admin
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090A0F] text-white flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-purple-500/20 backdrop-blur-xl bg-[#090A0F]/90">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 text-[#D4AF37] hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm font-bold hidden sm:inline">Panel Admin</span>
            </Link>
            <div className="h-6 w-px bg-white/10 hidden sm:block" />
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 p-[1px] flex items-center justify-center shadow-lg shadow-purple-950/50">
                <div className="w-full h-full bg-[#10131E] rounded-[11px] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-purple-300 animate-pulse" />
                </div>
              </div>
              <div>
                <h1 className="text-base font-extrabold text-white leading-tight flex items-center gap-1.5">
                  <span>Asistente Inteligente</span>
                  <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    IA EN VIVO
                  </span>
                </h1>
                <p className="text-[10px] text-gray-400">Analítica & Respuestas de Negocio</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors border border-white/5"
              title="Limpiar conversación"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpiar</span>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[11px] font-extrabold text-emerald-300">Conectado a MongoDB</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Chat Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col justify-between space-y-6">
        {/* Preset Prompt Buttons */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            Consultas Rápidas Recomendadas:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {PRESET_PROMPTS.map((p, idx) => {
              const Icon = p.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(p.prompt)}
                  disabled={loading}
                  className="glass-card rounded-xl p-2.5 border border-white/10 hover:border-purple-500/50 hover:bg-purple-950/20 text-left transition-all duration-200 group flex flex-col justify-between disabled:opacity-50"
                >
                  <Icon className="w-4 h-4 text-[#D4AF37] group-hover:scale-110 transition-transform mb-1.5" />
                  <span className="text-[11px] font-bold text-gray-200 group-hover:text-purple-200 leading-tight">
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat Message Scrollable Feed */}
        <div className="glass-panel rounded-3xl p-5 sm:p-7 border border-white/10 flex-1 min-h-[420px] max-h-[580px] overflow-y-auto space-y-5 shadow-2xl">
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
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-[#D4AF37]/20 to-[#AA8826]/20 border border-[#D4AF37]/40 text-white shadow-gold-glow'
                    : 'bg-[#121626] border border-white/10 text-gray-200 shadow-xl'
                }`}
              >
                <div className="space-y-1">{renderMessageContent(msg.text)}</div>
                <span className="text-[10px] text-gray-400 mt-2 block text-right font-semibold">
                  {msg.time}
                </span>
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {loading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="glass-card rounded-2xl px-4 py-3 border border-purple-500/30 flex items-center gap-2 text-xs text-purple-300 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#D4AF37]" />
                <span>Analizando datos en tiempo real de MongoDB...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="relative w-full">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta a la IA (ej. ¿cuánto vendí hoy?, ¿quién me debe?, ¿cuál fue el día récord?)..."
            disabled={loading}
            className="w-full pl-5 pr-28 py-3.5 bg-[#10131E] border border-purple-500/40 rounded-2xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all disabled:opacity-50"
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
      </main>
    </div>
  );
}
