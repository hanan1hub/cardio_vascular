import React from "react";
import { Camera } from "lucide-react";

interface SnapshotButtonProps {
  currentVitals: any;
  onSnapshotTaken?: (snapshot: any) => void;
}

export default function SnapshotButton({ currentVitals, onSnapshotTaken }: SnapshotButtonProps) {
  const handleSnapshot = () => {
    const snapshot = {
      ...currentVitals,
      timestamp: new Date().toISOString(),
    };
    
    console.log("Snapshot taken:", snapshot);
    
    if (onSnapshotTaken) {
      onSnapshotTaken(snapshot);
    }
    
    // You could save to localStorage or Firebase here
    alert("Vitals snapshot saved!");
  };

  return (
    <button
      onClick={handleSnapshot}
      disabled={!currentVitals}
      className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm text-sm"
    >
      <Camera className="w-4 h-4" />
      Snapshot
    </button>
  );
}
