import React, { useState, useRef, useEffect } from "react";
import { X, Send, Heart, Activity } from "lucide-react";

// Using the stable model name verified from your account's API list
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL_NAME = "gemini-2.5-flash-lite";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ── Cuter Heart Robot Icon ──────────────────────────────────────────────────
function HeartRobotIcon({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={animated ? "animate-pulse" : ""}>
      <defs>
        <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff4d6d" />
          <stop offset="100%" stopColor="#c9184a" />
        </linearGradient>
      </defs>
      <path
        d="M50 85 C20 60, 5 35, 15 20 C25 5, 45 5, 50 20 C55 5, 75 5, 85 20 C95 35, 80 60, 50 85"
        fill="url(#heartGrad)"
        stroke="#800e13"
        strokeWidth="1.5"
      />
      <rect x="35" y="28" width="30" height="22" rx="8" fill="#1a1a1a" opacity="0.8" />
      <circle cx="43" cy="39" r="3" fill="#00f5d4" className={animated ? "animate-ping" : ""} />
      <circle cx="57" cy="39" r="3" fill="#00f5d4" className={animated ? "animate-ping" : ""} />
      <line x1="50" y1="20" x2="50" y2="10" stroke="#ffb3c1" strokeWidth="2" />
      <circle cx="50" cy="8" r="3" fill="#00f5d4" />
    </svg>
  );
}

export default function ChatBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm CardioBot. How is your heart feeling today?",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Normal SpO2 levels?",
    "Explain my ECG graph",
    "Lower BP tips",
    "What is PPG?"
  ];

  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); 
  }, [messages]);

  const sendMessage = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const prompt = `System: You are CardioBot, a medical assistant for the CardioTrix monitor. Be empathetic and keep answers under 3 sentences. User says: ${messageText}`;

    // Call Gemini with one automatic retry on transient rate-limit / overload
    const callGemini = async (attempt = 0): Promise<string> => {
      const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 250, temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if ((response.status === 429 || response.status === 503) && attempt < 2) {
        await new Promise(r => setTimeout(r, 2000));
        return callGemini(attempt + 1);
      }
      if (response.status === 429) throw new Error("RATE_LIMIT");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "API Error");
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("EMPTY");
      return text;
    };

    try {
      const botText = await callGemini();
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: botText, timestamp: new Date() }]);
    } catch (err: any) {
      const friendly = err?.message === "RATE_LIMIT"
        ? "I'm getting a lot of questions right now! 💗 Please wait a few seconds and ask again."
        : "I'm having a connection hiccup! Check your hotspot. ❤️";
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: friendly,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="fixed bottom-4 right-6 w-14 h-14 rounded-full bg-rose-600 shadow-2xl flex items-center justify-center z-50 hover:scale-110 transition-transform"
      >
        <HeartRobotIcon size={40} animated={!isOpen} />
      </button>

      {/* Chat Window - Height tuned to 450px to prevent top-cutoff */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 w-[330px] h-[450px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-rose-100 flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-5">
          
          {/* Header - Compact */}
          <div className="bg-gradient-to-r from-rose-500 to-rose-700 p-3 text-white flex justify-between items-center">
            <div className="flex items-center gap-3">
              <HeartRobotIcon size={28} />
              <div>
                <h3 className="font-bold text-sm leading-tight">CardioBot</h3>
                <p className="text-[9px] text-rose-100 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Active
                </p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="bg-white/10 p-1 rounded-full hover:bg-white/20 transition">
              <X size={16} />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50 dark:bg-slate-950">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] p-2.5 rounded-2xl text-[12px] leading-snug ${
                  m.role === "user" ? "bg-rose-600 text-white rounded-br-none" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm rounded-bl-none border border-rose-50"
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-1 p-2">
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Messages */}
          <div className="px-3 py-1.5 flex flex-wrap gap-1.5 bg-slate-50 dark:bg-slate-950 border-t border-rose-50">
            {suggestions.map((s, idx) => (
              <button 
                key={idx} 
                onClick={() => sendMessage(s)}
                className="bg-white dark:bg-slate-800 border border-rose-200 px-2 py-0.5 rounded-full text-[9px] text-rose-600 hover:bg-rose-100 transition shadow-sm"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-2 border-t bg-white dark:bg-slate-900">
            <div className="relative flex items-center">
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Ask CardioBot..." 
                className="w-full bg-slate-100 dark:bg-slate-800 rounded-xl pl-3 pr-10 py-2 text-[11px] outline-none focus:ring-1 focus:ring-rose-500"
              />
              <button 
                onClick={() => sendMessage()}
                className="absolute right-1.5 p-1 text-rose-600 hover:scale-110 transition-transform"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}