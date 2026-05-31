"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SvMark } from "@/components/SvMark";
import { config } from "@/config";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function LoginForm() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    if (searchParams.get("error") === "unauthorized") {
      setError("Access denied. This dashboard is private.");
    }
  }, [searchParams]);

  async function handleGoogleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
    setLoading(false);
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Fire login alert (fire-and-forget — don't block redirect)
      fetch("/api/auth/notify-login", { method: "POST" }).catch(() => {});
      // Hard navigate so the (protected) layout mounts fresh, BootGate triggers the splash
      window.location.href = "/d";
    }
  }

  return (
    <div className="glass-2 rounded-[18px] p-6 flex flex-col gap-4">
      <Button
        variant="outline"
        size="lg"
        className="w-full gap-2"
        onClick={handleGoogleLogin}
        loading={loading}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border-dim" />
        <span className="text-text-3 text-[11px] uppercase tracking-widest">or</span>
        <div className="flex-1 h-px bg-border-dim" />
      </div>

      <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-4 py-2.5 text-[13px]"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-4 py-2.5 text-[13px]"
        />
        {error && (
          <p className="text-danger text-[12px] text-center">{error}</p>
        )}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  // If already authenticated and lands on /login, send to home — BootGate will splash
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) window.location.href = "/";
    });
  }, []);

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent opacity-[0.05] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#a78bfa] opacity-[0.04] rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-sm relative z-10 flex flex-col gap-6">
        {/* Logo + wordmark */}
        <div className="text-center flex flex-col items-center gap-3" style={{ animation: "fade-up 0.5s var(--ease-glide) both" }}>
          <div className="rounded-[16px] animate-glow p-2">
            <SvMark size={72} />
          </div>
          <div>
            <h1 className="text-[26px] font-700 tracking-tight text-text-1">
              SpicerVisions<span className="text-accent"> OS</span>
            </h1>
            <p className="text-text-3 text-[12px] mt-0.5 uppercase tracking-[0.28em]">{config.brand.tagline}</p>
          </div>
        </div>

        <div style={{ animation: "fade-up 0.6s var(--ease-glide) 0.15s both" }}>
          <Suspense fallback={<div className="glass-2 rounded-[18px] p-6 h-48 animate-pulse" />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-text-3 text-[11px]" style={{ animation: "fade-up 0.7s var(--ease-glide) 0.3s both" }}>
          Private dashboard. Unauthorized access is blocked.
        </p>
      </div>
    </div>
  );
}
