import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Heart } from "lucide-react";

export default function Root() {
  const navigate = useNavigate();

  useEffect(() => {
    const isLoggedIn = localStorage.getItem("isLoggedIn") || sessionStorage.getItem("isLoggedIn");
    const rawRole = localStorage.getItem("userRole") || sessionStorage.getItem("userRole");
    const userRole = rawRole?.toLowerCase().trim();

    if (isLoggedIn === "true") {
      if (userRole === "admin") {
        navigate("/admin-dashboard");
      } else if (userRole === "doctor") {
        navigate("/doctor-dashboard");
      } else {
        navigate("/dashboard");
      }
    } else {
      navigate("/login");
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
      <div className="relative text-center">
        <div className="mb-8 flex justify-center">
          <div className="p-6 bg-[var(--primary)] rounded-full animate-pulse">
            <Heart className="w-16 h-16 text-white" fill="white" />
          </div>
        </div>
        
        <h1 className="text-5xl font-bold mb-4 text-[var(--foreground)]">
          CardioMonitor
        </h1>
        <p className="text-xl text-[var(--muted-foreground)] mb-8">
          Cardiovascular Health Monitoring System
        </p>
        
        <div className="flex flex-col gap-4 items-center">
          <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[var(--muted-foreground)] font-medium">Initializing...</p>
        </div>
      </div>
    </div>
  );
}
