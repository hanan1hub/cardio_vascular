import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Send, MessageCircle, Stethoscope } from "lucide-react";
import io from "socket.io-client";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  getDocs,
  writeBatch
} from "firebase/firestore";
import { db } from "../../firebase";
import { BACKEND_URL } from "../utils/api";

const SOCKET_URL = BACKEND_URL;

export default function DoctorChat() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const socketRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const doctorId = localStorage.getItem("userId");

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role !== "doctor") {
      navigate(role === "patient" ? "/dashboard" : "/login");
      return;
    }
    if (!doctorId) {
      navigate("/login");
      return;
    }

    loadPatient();
    setupSocket();
    loadChatHistory();
  }, [patientId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const loadPatient = async () => {
    try {
      if (!patientId || !doctorId) return;
      const patientDoc = await getDoc(doc(db, "users", patientId));
      if (patientDoc.exists()) {
        const data: any = patientDoc.data();
        if (data.assignedDoctorId && data.assignedDoctorId !== doctorId) {
          setIsAuthorized(false);
          setPatient(null);
          return;
        }
        setIsAuthorized(true);
        setPatient({ id: patientDoc.id, ...data });
      }
    } catch (error) {
      console.error("Error loading patient:", error);
    }
  };

  const setupSocket = () => {
    socketRef.current = io(SOCKET_URL);
    const socket = socketRef.current;

    socket.on("connect", () => {
      setIsConnected(true);
      socket.emit("join_room", { userId: doctorId, role: "doctor", patientId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("chat_message", (data: any) => {
      if (!patientId || !doctorId) return;
      if (data.patientId !== patientId || data.doctorId !== doctorId) return;
      if (data.sender === "Patient") {
        setChat(prev => [...prev, {
          text: data.message,
          sender: "Patient",
          urgency: data.urgency || "Normal",
          time: new Date(data.timestamp || Date.now()).toLocaleTimeString(),
          id: data.id || Date.now()
        }]);
      }
    });

    return () => socket.disconnect();
  };

  const loadChatHistory = () => {
    if (!patientId || !doctorId) return;

    const chatRef = collection(db, "chatMessages");
    const q = query(
      chatRef,
      where("patientId", "==", patientId),
      where("doctorId", "==", doctorId),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          ...data,
          time: data.timestamp?.toDate
            ? data.timestamp.toDate().toLocaleTimeString()
            : new Date(data.createdAt || Date.now()).toLocaleTimeString()
        });
      });
      setChat(messages);
      markMessagesRead();
    });

    return unsubscribe;
  };

  const markMessagesRead = async () => {
    if (!patientId || !doctorId) return;
    try {
      const chatRef = collection(db, "chatMessages");
      const q = query(
        chatRef,
        where("patientId", "==", patientId),
        where("doctorId", "==", doctorId),
        where("readByDoctor", "==", false)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.sender === "Patient") {
          batch.update(docSnap.ref, {
            readByDoctor: true,
            readAt: serverTimestamp()
          });
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking messages read:", error);
    }
  };

  const sendMessage = async () => {
    if (message.trim() === "") return;
    if (!patientId || !doctorId) return;

    const newMessage = {
      text: message,
      sender: "Doctor",
      time: new Date().toLocaleTimeString(),
      id: Date.now(),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      patientId: patientId,
      doctorId: doctorId,
      readByDoctor: true,
      readAt: new Date().toISOString()
    };

    setChat(prev => [...prev, newMessage]);
    setMessage("");

    if (socketRef.current && isConnected) {
      socketRef.current.emit("chat_message", {
        message: newMessage.text,
        sender: "Doctor",
        timestamp: newMessage.timestamp,
        patientId: patientId,
        doctorId: doctorId
      });
    }

    try {
      await addDoc(collection(db, "chatMessages"), {
        ...newMessage,
        timestamp: serverTimestamp(),
        readAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--foreground)] font-medium">You do not have access to this patient.</p>
          <button
            onClick={() => navigate("/doctor-dashboard")}
            className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-orange-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-[var(--primary)] border-t-transparent mx-auto mb-4"></div>
          <p className="text-[var(--muted-foreground)] font-medium">Loading patient information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] shadow-sm">
          {/* Header */}
          <div className="p-6 border-b border-[var(--border)] bg-[var(--muted)]/50">
            <button
              onClick={() => navigate("/doctor-dashboard")}
              className="flex items-center gap-2 text-[var(--primary)] hover:text-orange-600 mb-3 text-sm font-medium transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </button>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--primary)] rounded-xl flex items-center justify-center">
                  <Stethoscope className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-[var(--foreground)]">
                    Chat with {patient.name || "Patient"}
                  </h2>
                  <p className="text-sm text-[var(--muted-foreground)] mt-1">
                    {patient.email}
                    {patient.age && patient.sex && ` · Age ${patient.age} · ${patient.sex}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></div>
                <span className="text-xs text-[var(--muted-foreground)] font-medium">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          {/* Chat Display */}
          <div className="bg-[var(--muted)] p-6 h-96 overflow-y-auto border-b border-[var(--border)]">
            {chat.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="p-4 bg-[var(--accent)] rounded-full mb-4">
                  <MessageCircle className="w-8 h-8 text-[var(--primary)]" />
                </div>
                <p className="text-[var(--muted-foreground)] font-medium">No messages yet</p>
                <p className="text-sm text-slate-400 mt-1">Start the conversation with your patient</p>
              </div>
            ) : (
              <div className="space-y-3">
                {chat.map((msg) => (
                  <div
                    key={msg.id || Date.now()}
                    className={`p-4 rounded-xl shadow-sm ${msg.sender === "Doctor"
                        ? "bg-[var(--primary)] text-white ml-auto max-w-[80%]"
                        : "bg-[var(--card)] mr-auto max-w-[80%] border border-[var(--border)]"
                      }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`font-medium text-sm ${msg.sender === "Doctor" ? "text-white" : "text-[var(--foreground)]"}`}>
                        {msg.sender}
                      </span>
                      <span className={`text-xs ${msg.sender === "Doctor" ? "text-white/80" : "text-[var(--muted-foreground)]"}`}>
                        {msg.time}
                      </span>
                    </div>
                    <p className={`${msg.sender === "Doctor" ? "text-white" : "text-[var(--foreground)]"} whitespace-pre-wrap`}>
                      {msg.text}
                    </p>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Input Field */}
          <div className="p-6">
            <div className="flex gap-2 mb-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 p-3 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] resize-none bg-[var(--input-background)]"
                placeholder="Type your message... (Press Enter to send)"
                rows={3}
              ></textarea>
            </div>

            <div className="flex justify-end">
              <button
                onClick={sendMessage}
                disabled={!message.trim() || !isConnected}
                className="flex items-center gap-2 px-6 py-3 bg-[var(--primary)] text-white rounded-lg hover:bg-orange-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              >
                <Send className="w-4 h-4" />
                Send Message
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
