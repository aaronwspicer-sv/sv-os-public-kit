"use client";
// Settings → Health
// At-a-glance view of "is the OS healthy?":
//   - Setup validation (env vars, Notion DBs reachable, Supabase tables, required props)
//   - Cron status (last run per job, stale flag)
//   - PWA install hint
// Reads from /api/health/setup and /api/health/cron.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { CheckCircle, AlertCircle, RefreshCw, ChevronLeft, Clock, AlertTriangle } from "lucide-react";

interface SetupCheck { name: string; ok: boolean; detail?: string }
interface SetupPayload {
  ok: boolean;
  checkedAt: string;
  summary: { total: number; passed: number; failed: number; warnings: number };
  checks: SetupCheck[];
  warnings: SetupCheck[];
}

interface CronJob { status: string; ranAt: string; durationMs: number | null; error: string | null; ageSeconds: number }
interface StaleJob { name: string; ageHours: number | null; status: string | null }
interface CronPayload { ok: boolean; checkedAt: string; jobs: Record<string, CronJob>; stale: StaleJob[] }

export default function HealthPage() {
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [cron,  setCron]  = useState<CronPayload  | null>(null);
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [cronErr,  setCronErr]  = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    setSetupErr(null); setCronErr(null);
    const [s, c] = await Promise.all([
      fetch("/api/health/setup", { cache: "no-store" }).then(r => r.json()).catch((e) => ({ error: e?.message })),
      fetch("/api/health/cron",  { cache: "no-store" }).then(r => r.json()).catch((e) => ({ error: e?.message })),
    ]);
    if (s?.error) setSetupErr(s.error); else setSetup(s);
    if (c?.error) setCronErr(c.error);  else setCron(c);
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <Link href="/d/settings" className="text-[11px] text-text-3 hover:text-accent inline-flex items-center gap-1 mb-1">
            <ChevronLeft size={11} /> Settings
          </Link>
          <h1 className="text-[24px] font-700 tracking-tight">Health</h1>
          <p className="text-[12px] text-text-3 mt-0.5">Is the OS wired up correctly?</p>
        </div>
        <Button variant="outline" size="sm" loading={refreshing} onClick={load}>
          <RefreshCw size={12} /> Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      {setup && (
        <Card variant={setup.ok ? "default" : "warning"} className="flex items-center gap-3">
          {setup.ok ? (
            <CheckCircle size={22} className="text-success flex-shrink-0" />
          ) : (
            <AlertCircle size={22} className="text-warning flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="text-[14px] font-600 text-text-1">
              {setup.ok ? "All systems green" : "Some checks failed"}
            </p>
            <p className="text-[11px] text-text-3 mt-0.5">
              {setup.summary.passed}/{setup.summary.total} passed
              {setup.summary.failed > 0 && ` · ${setup.summary.failed} failed`}
              {setup.summary.warnings > 0 && ` · ${setup.summary.warnings} warning${setup.summary.warnings === 1 ? "" : "s"}`}
            </p>
          </div>
        </Card>
      )}

      {/* Cron status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <CardTitle>Scheduled jobs</CardTitle>
          </div>
          {cron && cron.stale.length > 0 && (
            <Badge variant="warning">{cron.stale.length} stale</Badge>
          )}
        </CardHeader>

        {!cron && !cronErr ? <Skeleton width="100%" height={60} /> : null}
        {cronErr && <p className="text-[12px] text-danger">{cronErr}</p>}

        {cron && (
          <div className="flex flex-col gap-2">
            {Object.keys(cron.jobs).length === 0 ? (
              <p className="text-[12px] text-text-3">
                No cron runs recorded yet. Either the jobs haven't fired since this feature was added,
                or the cron_runs table isn't in Supabase yet (re-run the schema migration).
              </p>
            ) : (
              Object.entries(cron.jobs).map(([name, job]) => {
                const stale = cron.stale.find(s => s.name === name);
                const tone = job.status === "success" && !stale ? "success" : job.status === "failure" ? "danger" : "warning";
                return (
                  <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : "bg-warning"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-600 text-text-1">{name}</p>
                      <p className="text-[10px] text-text-3 mt-0.5">
                        {job.status} · {timeSince(job.ageSeconds)} ago
                        {job.durationMs != null && ` · ${job.durationMs}ms`}
                        {stale && " · STALE"}
                        {job.error && ` · ${job.error.slice(0, 60)}`}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>

      {/* Setup checks */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle size={14} className="text-accent" />
            <CardTitle>Setup validation</CardTitle>
          </div>
          {setup && <Badge variant={setup.ok ? "success" : "warning"}>{setup.summary.passed}/{setup.summary.total}</Badge>}
        </CardHeader>

        {!setup && !setupErr ? <Skeleton width="100%" height={120} /> : null}
        {setupErr && <p className="text-[12px] text-danger">{setupErr}</p>}

        {setup && (
          <div className="flex flex-col gap-1">
            {setup.checks.filter(c => !c.ok).map(c => (
              <CheckRow key={c.name} check={c} />
            ))}
            {setup.warnings.map(w => (
              <CheckRow key={w.name} check={w} warning />
            ))}
            {setup.checks.filter(c => c.ok).length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] text-text-3 cursor-pointer hover:text-text-2 select-none">
                  {setup.checks.filter(c => c.ok).length} passing — show all
                </summary>
                <div className="flex flex-col gap-1 mt-2">
                  {setup.checks.filter(c => c.ok).map(c => <CheckRow key={c.name} check={c} />)}
                </div>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* PWA install hint */}
      <PwaHint />
    </div>
  );
}

function CheckRow({ check, warning }: { check: SetupCheck; warning?: boolean }) {
  const ok = check.ok && !warning;
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
      {ok ? (
        <CheckCircle size={12} className="text-success flex-shrink-0" />
      ) : warning ? (
        <AlertTriangle size={12} className="text-warning flex-shrink-0" />
      ) : (
        <AlertCircle size={12} className="text-danger flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono text-text-2">{check.name}</p>
        {check.detail && <p className="text-[10px] text-text-3 mt-0.5">{check.detail}</p>}
      </div>
    </div>
  );
}

function timeSince(seconds: number): string {
  if (seconds < 60)    return `${seconds}s`;
  if (seconds < 3600)  return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

// ── PWA install hint ──────────────────────────────────────────
// Shows only when the OS is NOT currently running as an installed PWA.
// On iOS the install prompt isn't programmatic — surface the manual steps.
function PwaHint() {
  const [installed, setInstalled] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches
        || (window as any).navigator?.standalone === true;
      setInstalled(!!standalone);
    } catch {
      setInstalled(null);
    }
  }, []);

  if (installed === null || installed) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Install as app</CardTitle>
      </CardHeader>
      <p className="text-[12px] text-text-2 leading-relaxed">
        You're using the OS in a browser tab. Installing as a PWA gives you push notifications,
        offline support, and an app-like home-screen icon.
      </p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-text-3">
        <div className="px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
          <p className="font-600 text-text-2 mb-1">iPhone / iPad</p>
          Safari → Share → Add to Home Screen
        </div>
        <div className="px-3 py-2 rounded-[10px] bg-[rgba(255,255,255,0.02)] border border-border-dim">
          <p className="font-600 text-text-2 mb-1">Desktop (Chrome / Edge)</p>
          Click the install icon in the address bar (⊕) — or three-dot menu → Install Spicer OS
        </div>
      </div>
    </Card>
  );
}
