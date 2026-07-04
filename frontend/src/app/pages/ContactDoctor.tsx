// src/app/pages/ContactDoctor.tsx
import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Send, AlertCircle, AlertTriangle, MessageCircle } from "lucide-react";
import io from "socket.io-client";
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  orderBy, query, serverTimestamp, where
} from "firebase/firestore";
import { db } from "../../firebase";
import SidebarLayout from "../components/Sidebar";
import { BACKEND_URL } from "../utils/api";

const SOCKET_URL = BACKEND_URL;

export default function ContactDoctor() {
  const navigate = useNavigate();
  const [message,          setMessage]          = useState("");
  const [urgency,          setUrgency]          = useState("Normal");
  const [chat,             setChat]             = useState<any[]>([]);
  const [assignedDoctorId, setAssignedDoctorId] = useState<string | null>(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const [isConnected,      setIsConnected]      = useState(false);
  const socketRef  = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "patient") { navigate(role === "doctor" ? "/doctor-dashboard" : "/login"); return; }
    const userId = localStorage.getItem("userId");
    if (!userId) { navigate("/login"); return; }

    const loadPatient = async () => {
      try {
        const userDoc = await getDoc(doc(db, "users", userId));
        if (userDoc.exists()) {
          const data: any = userDoc.data();
          setAssignedDoctorId(data.assignedDoctorId || null);
        }
      } catch { setAssignedDoctorId(null); }
      finally { setIsLoading(false); }
    };
    loadPatient();

    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.on("connect",    () => { setIsConnected(true); socket.emit("join_room", { userId, role: "patient" }); });
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("chat_message", (data: any) => {
      if (!userId || !assignedDoctorId) return;
      if (data.patientId !== userId || data.doctorId !== assignedDoctorId) return;
      setChat(prev => [...prev, {
        text: data.message, sender: data.sender || "Doctor",
        urgency: data.urgency || "Normal",
        time: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
        id: data.id || Date.now()
      }]);
    });
    return () => { socket.disconnect(); };
  }, [assignedDoctorId, navigate]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);

  useEffect(() => {
    const userId = localStorage.getItem("userId");
    if (!userId || !assignedDoctorId) return;
    const q = query(
      collection(db, "chatMessages"),
      where("patientId", "==", userId),
      where("doctorId",  "==", assignedDoctorId),
      orderBy("timestamp", "asc")
    );
    return onSnapshot(q, snap => {
      const msgs: any[] = [];
      snap.forEach(d => {
        const data = d.data();
        msgs.push({ id: d.id, ...data,
          time: data.timestamp?.toDate ? data.timestamp.toDate().toLocaleTimeString() : new Date().toLocaleTimeString()
        });
      });
      setChat(msgs);
    });
  }, [assignedDoctorId]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    const userId = localStorage.getItem("userId");
    if (!userId || !assignedDoctorId) return;
    const newMsg = {
      text: message, urgency, sender: "Patient",
      patientId: userId, doctorId: assignedDoctorId,
      readByDoctor: false, readAt: null,
      time: new Date().toLocaleTimeString(),
      id: Date.now(),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    setChat(prev => [...prev, newMsg]);
    setMessage("");
    if (socketRef.current && isConnected) {
      socketRef.current.emit("chat_message", {
        message: newMsg.text, sender: "Patient", urgency: newMsg.urgency,
        timestamp: newMsg.timestamp, patientId: newMsg.patientId, doctorId: newMsg.doctorId
      });
    }
    try {
      await addDoc(collection(db, "chatMessages"), { ...newMsg, timestamp: serverTimestamp(), createdAt: newMsg.createdAt });
    } catch (e) { console.error(e); }
  };

  const urgencyConfig: Record<string, any> = {
    Emergency: { bg: "bg-red-500", text: "text-white",   bubble: "bg-red-100 border-red-300" },
    Urgent:    { bg: "bg-amber-500", text: "text-white", bubble: "bg-amber-50 border-amber-300" },
    Normal:    { bg: "bg-rose-500", text: "text-white",  bubble: "" },
  };

  return (
    <SidebarLayout role="patient">
      <div className="p-6 max-w-3xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">Contact Doctor</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Real-time chat with your healthcare provider</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
            <span className="text-xs text-[var(--muted-foreground)] font-medium">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">

          {/* Urgency selector */}
          <div className="p-4 border-b border-[var(--border)] bg-[var(--muted)]">
            <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Message Urgency</p>
            <div className="flex gap-2">
              {["Normal", "Urgent", "Emergency"].map(u => (
                <button
                  key={u}
                  onClick={() => setUrgency(u)}
                  className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-all ${
                    urgency === u
                      ? `${urgencyConfig[u].bg} ${urgencyConfig[u].text} shadow-sm`
                      : "bg-[var(--card)] text-[var(--muted-foreground)] border border-[var(--border)] hover:border-rose-200"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div className="h-96 overflow-y-auto p-4 space-y-3 bg-[var(--muted)]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !assignedDoctorId ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
                <p className="text-sm font-semibold text-[var(--foreground)]">No doctor assigned</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Contact support to assign a doctor.</p>
              </div>
            ) : chat.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageCircle className="w-10 h-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold text-[var(--foreground)]">No messages yet</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Start a conversation with your doctor</p>
              </div>
            ) : chat.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === "Patient" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] ${msg.sender === "Patient"
                  ? `bg-rose-500 text-white rounded-2xl rounded-tr-sm`
                  : "bg-[var(--card)] text-[var(--foreground)] rounded-2xl rounded-tl-sm border border-[var(--border)]"
                } px-4 py-3 shadow-sm`}>
                  {msg.urgency !== "Normal" && msg.sender === "Patient" && (
                    <p className="text-xs font-bold text-rose-200 mb-1 uppercase tracking-wide">{msg.urgency}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  <p className={`text-xs mt-1.5 ${msg.sender === "Patient" ? "text-rose-200" : "text-[var(--muted-foreground)]"}`}>
                    {msg.time}
                  </p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-[var(--border)] bg-[var(--card)]">
            <div className="flex gap-3">
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyPress={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                className="flex-1 p-3 border border-[var(--border)] rounded-xl resize-none bg-[var(--input-background)] text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                placeholder="Type your message... (Enter to send)"
                rows={2}
              />
              <button
                onClick={sendMessage}
                disabled={!message.trim() || !isConnected || !assignedDoctorId}
                className="px-4 py-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 disabled:opacity-50 transition shadow-sm self-end"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
