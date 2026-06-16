"use client";
import { createContext, useCallback, useContext, useState } from "react";

interface DockCtx {
  docked: boolean;
  lastMessage: string;
  dock: (msg?: string) => void;
  undock: () => void;
}

const Ctx = createContext<DockCtx>({
  docked: false, lastMessage: "", dock: () => {}, undock: () => {},
});

export function AlfredDockProvider({ children }: { children: React.ReactNode }) {
  const [docked, setDocked]           = useState(false);
  const [lastMessage, setLastMessage] = useState("");

  const dock   = useCallback((msg = "") => { if (msg) setLastMessage(msg); setDocked(true);  }, []);
  const undock = useCallback(()         => { setDocked(false); }, []);

  return <Ctx.Provider value={{ docked, lastMessage, dock, undock }}>{children}</Ctx.Provider>;
}

export const useAlfredDock = () => useContext(Ctx);
