
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./app/styles/index.css";

// Apply saved theme before first render to prevent flash
try {
  const saved = localStorage.getItem("appSettings");
  if (saved) {
    const { theme } = JSON.parse(saved);
    if (theme === "dark") document.documentElement.classList.add("dark");
  }
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
