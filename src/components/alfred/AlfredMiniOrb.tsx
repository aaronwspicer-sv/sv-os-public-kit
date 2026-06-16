"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAlfredDock } from "@/lib/alfred/dockContext";

export function AlfredMiniOrb() {
  const { docked, undock } = useAlfredDock();
  const router  = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (docked) {
      const t = setTimeout(() => setVisible(true), 520);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [docked]);

  if (!docked) return null;

  function goHome() {
    undock();
    router.push("/d");
  }

  return (
    <button
      onClick={goHome}
      title="Return to Alfred"
      style={{
        position: "fixed",
        bottom: "calc(44px + 1rem)",
        right: "1.25rem",
        zIndex: 60,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.3s ease-out, transform 0.3s cubic-bezier(.16,1,.3,1)",
        pointerEvents: visible ? "auto" : "none",
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 13px",
        borderRadius: "20px",
        background: "rgba(8, 10, 14, 0.92)",
        border: "1px solid rgba(29,155,240,0.35)",
        backdropFilter: "blur(20px)",
        color: "rgba(250,250,250,0.65)",
        fontSize: "11px",
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        letterSpacing: "0.01em",
      }}
    >
      <span style={{ color: "rgba(29,155,240,0.8)", fontSize: "13px", lineHeight: 1 }}>←</span>
      Alfred
    </button>
  );
}
