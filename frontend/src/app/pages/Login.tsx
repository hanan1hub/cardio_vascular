import React, { useState } from "react";
import { useNavigate } from "react-router";
import { auth, db } from "../../firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDocFromServer, collection, query, where, getDocs } from "firebase/firestore";

// Import assets
import backgroundImg from "../assets/background.png";
import logoImg from "../assets/cardiotrix-logo.png";

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Clear any stale role data from a previous user's session before lookup
      localStorage.removeItem("userRole");
      localStorage.removeItem("userData");

      let role = null;

      // Force fetch from server so manually-set roles (e.g. admin) are always picked up.
      // First try the canonical path: users/{uid}
      let userData: any = null;
      const uidDoc = await getDocFromServer(doc(db, "users", user.uid));
      if (uidDoc.exists()) {
        userData = uidDoc.data();
      } else {
        // Fallback: document was created manually with an auto-generated ID —
        // search by email instead
        const snap = await getDocs(
          query(collection(db, "users"), where("email", "==", user.email))
        );
        if (!snap.empty) userData = snap.docs[0].data();
      }

      if (userData?.role) {
        // Normalize to lowercase so "Admin" / "ADMIN" / "admin" all work
        role = (userData.role as string).toLowerCase().trim();
        localStorage.setItem("userData", JSON.stringify({ ...userData, role }));
      } else if (userData) {
        setError("Your account has no role assigned. Contact an admin.");
        return;
      } else {
        // No document at all — treat as patient
        role = "patient";
      }

      console.log("Role fetched from Firestore:", role);
      if (!role) role = "patient";
      
      console.log("Final role determined:", role);
      
      // Role and userId always go to localStorage so all page guards (AdminDashboard, etc.) can read them.
      // Only "isLoggedIn" uses sessionStorage when "Remember me" is unchecked —
      // that flag clears automatically when the browser closes.
      localStorage.setItem("userRole", role);
      localStorage.setItem("userId", user.uid);
      if (rememberMe) {
        localStorage.setItem("isLoggedIn", "true");
      } else {
        sessionStorage.setItem("isLoggedIn", "true");
        localStorage.removeItem("isLoggedIn"); // ensure old "remember me" flag is gone
      }
      
      onLogin();
      
      if (role === "admin") {
        console.log("Redirecting to admin dashboard");
        navigate("/admin-dashboard");
      } else if (role === "doctor") {
        console.log("Redirecting to doctor dashboard");
        navigate("/doctor-dashboard");
      } else {
        console.log("Redirecting to patient dashboard");
        navigate("/dashboard");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      
      let errorMessage = "Failed to login. Please check your credentials.";
      
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        errorMessage = "Invalid email or password. Please check your credentials and try again.";
      } else if (err.code === "auth/invalid-email") {
        errorMessage = "Invalid email address. Please enter a valid email.";
      } else if (err.code === "auth/user-disabled") {
        errorMessage = "This account has been disabled. Please contact support.";
      } else if (err.code === "auth/too-many-requests") {
        errorMessage = "Too many failed login attempts. Please try again later.";
      } else if (err.code === "auth/network-request-failed") {
        errorMessage = "Network error. Please check your internet connection.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url(${backgroundImg})` }}
    >
      {/* Dark overlay for better readability */}
      <div className="absolute inset-0 bg-black/40" />

      <form className="relative z-10 p-8 w-full max-w-md" onSubmit={handleLogin}>
        {/* Logo at top - bigger with heartbeat animation */}
        <div className="flex justify-center mb-8">
          <img
            src={logoImg}
            alt="CardioTrix Logo"
            className="h-36 w-auto object-contain drop-shadow-2xl animate-heartbeat"
            style={{
              animation: "heartbeat 1.5s ease-in-out infinite"
            }}
          />
          <style>{`
            @keyframes heartbeat {
              0%, 100% { transform: scale(1); }
              14% { transform: scale(1.08); }
              28% { transform: scale(1); }
              42% { transform: scale(1.05); }
              56% { transform: scale(1); }
            }
          `}</style>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/90 border-l-4 border-red-300 rounded backdrop-blur-sm">
            <p className="text-white text-sm">{error}</p>
          </div>
        )}

        {/* Only inputs are white */}
        <input
          className="w-full p-3 border-0 rounded-xl mb-3 focus:ring-2 focus:ring-rose-500 transition bg-white text-slate-800 placeholder-slate-400 shadow-lg"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <input
          className="w-full p-3 border-0 rounded-xl mb-4 focus:ring-2 focus:ring-rose-500 transition bg-white text-slate-800 placeholder-slate-400 shadow-lg"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="flex items-center gap-2 mb-5">
          <input
            id="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={e => setRememberMe(e.target.checked)}
            className="w-4 h-4 accent-rose-500 cursor-pointer"
          />
          <label htmlFor="rememberMe" className="text-sm text-white cursor-pointer select-none drop-shadow">
            Remember me
          </label>
        </div>

        <button className="w-full py-3 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl font-semibold hover:from-rose-600 hover:to-rose-700 transition shadow-lg shadow-rose-500/30">
          Sign In
        </button>

        <p className="text-center mt-6 text-white drop-shadow">
          Don't have an account?{" "}
          <span
            className="text-rose-300 cursor-pointer font-semibold hover:text-rose-200 hover:underline"
            onClick={() => navigate("/signup")}
          >
            Sign Up
          </span>
        </p>
      </form>
    </div>
  );
}
