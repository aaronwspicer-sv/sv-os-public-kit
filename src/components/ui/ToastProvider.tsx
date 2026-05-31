"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  body?: string;
  duration?: number; // ms; 0 = sticky
}

interface ToastContextValue {
  toast: (opts: Omit<Toast, "id">) => void;
  success: (title: string, body?: string) => void;
  error:   (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
  info:    (title: string, body?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastVariant, React.ComponentType<{ size?: number; className?: string }>> = {
  success: CheckCircle2,
  error:   AlertCircle,
  warning: AlertTriangle,
  info:    Info,
};

const COLORS: Record<ToastVariant, { ring: string; icon: string; bg: string }> = {
  success: { ring: "border-[rgba(52,211,153,0.25)]",  icon: "text-success", bg: "bg-[rgba(52,211,153,0.05)]" },
  error:   { ring: "border-[rgba(248,113,113,0.3)]",  icon: "text-danger",  bg: "bg-[rgba(248,113,113,0.06)]" },
  warning: { ring: "border-[rgba(251,191,36,0.3)]",   icon: "text-warning", bg: "bg-[rgba(251,191,36,0.06)]" },
  info:    { ring: "border-[rgba(29,155,240,0.25)]",  icon: "text-accent",  bg: "bg-[rgba(29,155,240,0.05)]" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((opts: Omit<Toast, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newToast: Toast = { duration: 4500, ...opts, id };
    setToasts(prev => [...prev, newToast]);
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => dismiss(id), newToast.duration);
    }
  }, [dismiss]);

  const value: ToastContextValue = {
    toast,
    success: (title, body) => toast({ variant: "success", title, body }),
    error:   (title, body) => toast({ variant: "error",   title, body, duration: 6500 }),
    warning: (title, body) => toast({ variant: "warning", title, body }),
    info:    (title, body) => toast({ variant: "info",    title, body }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-[360px] w-[calc(100vw-2rem)] sm:w-auto pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const Icon = ICONS[toast.variant];
  const c = COLORS[toast.variant];
  const [leaving, setLeaving] = useState(false);

  const handleClose = useCallback(() => {
    setLeaving(true);
    setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    if (!toast.duration || toast.duration === 0) return;
    const t = setTimeout(() => setLeaving(true), toast.duration - 180);
    return () => clearTimeout(t);
  }, [toast.duration]);

  return (
    <div
      className={cn(
        "surface-solid pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-[14px] border",
        c.ring, c.bg
      )}
      style={{ animation: leaving ? "toast-slide-out 0.18s var(--ease-glide) forwards" : "toast-slide-in 0.32s var(--ease-spring) both" }}
      role="status"
    >
      <Icon size={16} className={cn(c.icon, "flex-shrink-0 mt-0.5")} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-600 text-text-1">{toast.title}</p>
        {toast.body && <p className="text-[11px] text-text-3 mt-0.5 break-words">{toast.body}</p>}
      </div>
      <button
        onClick={handleClose}
        className="text-text-3 hover:text-text-1 transition-colors p-0.5 -mt-0.5 -mr-1"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}
