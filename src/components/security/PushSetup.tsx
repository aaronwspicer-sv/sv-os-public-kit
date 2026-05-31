"use client";
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Bell, BellOff, Send } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { config } from "@/config";

type State = "unsupported" | "denied" | "unsubscribed" | "subscribed";

// VAPID public key — embedded at build time (NEXT_PUBLIC_ prefix exposes it to the client)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

// Convert a URL-safe base64 string into a Uint8Array (required by pushManager.subscribe)
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushSetup() {
  const toast = useToast();
  const [state, setState] = useState<State>("unsubscribed");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [endpoint, setEndpoint] = useState<string | null>(null);

  // Check current permission + subscription state
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) {
        setState("unsubscribed");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setEndpoint(sub.endpoint);
        setState("subscribed");
      } else {
        setState("unsubscribed");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function subscribe() {
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Push not configured", "NEXT_PUBLIC_VAPID_PUBLIC_KEY missing in Vercel env");
      return;
    }
    setWorking(true);
    try {
      // Register service worker if not already
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

      // Wait for it to be active
      if (reg.installing) await new Promise<void>(res => {
        reg!.installing!.addEventListener("statechange", function onState() {
          if (this.state === "activated") { this.removeEventListener("statechange", onState); res(); }
        });
      });

      // Ask permission
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "unsubscribed");
        toast.warning("Permission not granted");
        return;
      }

      // Subscribe — TS quirk: cast to BufferSource to satisfy the strict ArrayBuffer expectation
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // Persist server-side
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subJson),
      });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error ?? "Failed to register subscription");
      }
      setEndpoint(sub.endpoint);
      setState("subscribed");
      toast.success("Notifications enabled");
    } catch (e: any) {
      toast.error("Couldn't enable notifications", e?.message ?? "Unknown error");
    } finally {
      setWorking(false);
    }
  }

  async function unsubscribe() {
    setWorking(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEndpoint(null);
      setState("unsubscribed");
      toast.success("Notifications disabled");
    } catch (e: any) {
      toast.error("Couldn't disable", e?.message ?? "Unknown error");
    } finally {
      setWorking(false);
    }
  }

  async function sendTest() {
    setWorking(true);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const d = await r.json();
      if (d.sent > 0) {
        toast.success("Test sent", `${d.sent} device(s) received it`);
      } else if (d.failed > 0) {
        toast.error("Push failed", d.error ?? "Check VAPID keys in Vercel env vars");
      } else {
        toast.warning("No subscriptions", "No registered devices found — try re-enabling notifications");
      }
    } catch (e: any) {
      toast.error("Test failed", e?.message);
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center py-6">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </Card>
    );
  }

  if (state === "unsupported") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <BellOff size={20} className="text-text-3" />
        <p className="text-[13px] text-text-2">Push notifications aren't supported in this browser.</p>
        <p className="text-[11px] text-text-3">On iOS, install {config.brand.shortName} to your Home Screen first, then re-open.</p>
      </Card>
    );
  }

  if (state === "denied") {
    return (
      <Card className="flex flex-col items-center gap-3 py-6 text-center">
        <BellOff size={20} className="text-danger" />
        <p className="text-[13px] text-text-2">Notifications blocked at the browser/OS level.</p>
        <p className="text-[11px] text-text-3">
          Re-enable in your device settings: <span className="text-text-2">Settings → Notifications → {config.brand.shortName} → Allow</span>
        </p>
      </Card>
    );
  }

  if (state === "subscribed") {
    return (
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[rgba(52,211,153,0.10)] border border-[rgba(52,211,153,0.24)] flex items-center justify-center flex-shrink-0">
            <Bell size={16} className="text-success" />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-600 text-text-1">Notifications enabled</p>
            <p className="text-[11px] text-text-3 break-all">{endpoint?.slice(0, 60)}…</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={sendTest} loading={working} className="flex-1">
            <Send size={12} /> Send test
          </Button>
          <Button variant="danger" size="sm" onClick={unsubscribe} loading={working} className="flex-1">
            Disable
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[12px] bg-accent-dim border border-[rgba(29,155,240,0.2)] flex items-center justify-center flex-shrink-0">
          <Bell size={16} className="text-accent" />
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-600 text-text-1">Enable push notifications</p>
          <p className="text-[11px] text-text-3">Fraud alerts, journal reminders, morning tasks</p>
        </div>
      </div>
      <Button variant="primary" onClick={subscribe} loading={working} className="w-full">
        <Bell size={14} /> Enable on this device
      </Button>
    </Card>
  );
}
