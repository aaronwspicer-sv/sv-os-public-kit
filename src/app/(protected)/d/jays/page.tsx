"use client";
import { useEffect, useState, useCallback } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { StationHeader } from "@/components/ui/StationHeader";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tv, MapPin, Calendar, Trophy, Activity, ExternalLink, RefreshCw } from "lucide-react";
import type { JaysSummary, GameSummary, LiveGame } from "@/lib/jays";
import { config } from "@/config";

const JAYS_BLUE = "#134A8E"; // TBJ primary

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: config.locale.timezone, weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: config.locale.timezone, weekday: "short", month: "short", day: "numeric",
  });
}

export default function JaysPage() {
  const [data, setData]       = useState<JaysSummary | null>(null);
  const [errMsg, setErrMsg]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setErrMsg(null);
    try {
      const r = await fetch("/api/jays");
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErrMsg(d?.error ?? `MLB API returned ${r.status}`); return; }
      if (d?.error) { setErrMsg(d.error); return; }
      if (d) setData(d);
    } catch (e: any) {
      setErrMsg(e?.message ?? "Network error");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s while a game is live
  useEffect(() => {
    if (!data?.liveGame) return;
    const id = setInterval(() => load(), 30_000);
    return () => clearInterval(id);
  }, [data?.liveGame, load]);

  return (
    <div className="flex flex-col gap-5">
      <StationHeader
        station="TORONTO BLUE JAYS"
        title="Game Day"
        action={
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] border border-border-dim text-[11px] font-600 text-text-2 hover:border-accent hover:text-accent transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        }
      />

      {loading ? (
        <Card><SkeletonRows count={5} /></Card>
      ) : !data ? (
        <Card>
          <EmptyState
            title="Couldn't load Jays data"
            body={errMsg ?? "MLB Stats API may be down. Try refresh."}
          />
        </Card>
      ) : (
        <>
          {/* Live game */}
          {data.liveGame && <LiveCard game={data.liveGame} />}

          {/* Standings */}
          <StandingsCard data={data} />

          {/* Next game */}
          {data.nextGame && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-accent" />
                  <CardTitle>Next Game</CardTitle>
                </div>
                <Badge variant="muted">{data.nextGame.isHome ? "Home" : "Away"}</Badge>
              </CardHeader>
              <GameDetail game={data.nextGame} upcoming />
            </Card>
          )}

          {/* Last game */}
          {data.lastGame && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trophy size={14} className="text-text-3" />
                  <CardTitle>Last Game</CardTitle>
                </div>
                {data.lastGame.jaysScore !== null && data.lastGame.opponentScore !== null && (
                  <Badge variant={data.lastGame.jaysScore > data.lastGame.opponentScore ? "success" : "danger"}>
                    {data.lastGame.jaysScore > data.lastGame.opponentScore ? "WIN" : "LOSS"} {data.lastGame.jaysScore}-{data.lastGame.opponentScore}
                  </Badge>
                )}
              </CardHeader>
              <GameDetail game={data.lastGame} />
            </Card>
          )}

          <p className="text-center text-[10px] text-text-3">
            Data from MLB Stats API · auto-refreshes every 30s during live games
          </p>
        </>
      )}
    </div>
  );
}

function StandingsCard({ data }: { data: JaysSummary }) {
  if (!data.record) return null;
  const winning = parseFloat(data.record.pct) > 0.500;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: JAYS_BLUE }} />
          <CardTitle>AL East Standings</CardTitle>
        </div>
        {data.streak && (
          <Badge variant={data.streak.startsWith("W") ? "success" : "danger"}>{data.streak}</Badge>
        )}
      </CardHeader>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Record" value={`${data.record.wins}-${data.record.losses}`} highlight={winning ? "success" : undefined} />
        <Stat label="Pct"    value={data.record.pct} />
        <Stat label="Rank"   value={data.divisionRank ? `#${data.divisionRank}` : "—"} highlight={data.divisionRank === 1 ? "success" : undefined} />
        <Stat label="GB"     value={data.gamesBack ?? "—"} />
      </div>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "success" }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-3 rounded-[10px] bg-[rgba(255,255,255,0.03)] border border-border-dim">
      <p className={`text-[18px] font-700 tabular-nums font-mono ${highlight === "success" ? "text-success" : "text-text-1"}`}>{value}</p>
      <p className="text-[9px] uppercase tracking-widest text-text-3">{label}</p>
    </div>
  );
}

function LiveCard({ game }: { game: LiveGame }) {
  return (
    <Card variant="highlight" glow>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-danger animate-led" />
          <CardTitle>LIVE · {game.inning ? `${game.inningState ?? ""} ${game.inning}` : "Pre-game"}</CardTitle>
        </div>
        <Badge variant="danger">{game.opponentAbbr}</Badge>
      </CardHeader>
      <div className="flex items-center justify-around py-2">
        <div className="flex flex-col items-center">
          <p className="text-[10px] uppercase tracking-widest text-text-3">TOR</p>
          <p className="text-[44px] font-700 tabular-nums font-mono text-text-1">{game.jaysScore ?? 0}</p>
        </div>
        <p className="text-[18px] text-text-3 font-700">vs</p>
        <div className="flex flex-col items-center">
          <p className="text-[10px] uppercase tracking-widest text-text-3">{game.opponentAbbr}</p>
          <p className="text-[44px] font-700 tabular-nums font-mono text-text-1">{game.opponentScore ?? 0}</p>
        </div>
      </div>
      {(game.balls !== null || game.outs !== null) && (
        <div className="flex items-center justify-center gap-4 text-[11px] text-text-2 mb-2">
          <span><span className="font-700 text-text-1">{game.balls}-{game.strikes}</span> count</span>
          <span><span className="font-700 text-text-1">{game.outs}</span> out</span>
          <span className="inline-flex items-center gap-1">
            <span className={`w-2 h-2 rotate-45 ${game.runners.second ? "bg-accent" : "bg-[rgba(255,255,255,0.15)]"}`} />
            <span className={`w-2 h-2 rotate-45 ${game.runners.first ? "bg-accent" : "bg-[rgba(255,255,255,0.15)]"}`} />
            <span className={`w-2 h-2 rotate-45 ${game.runners.third ? "bg-accent" : "bg-[rgba(255,255,255,0.15)]"}`} />
          </span>
        </div>
      )}
      {(game.batter || game.pitcher) && (
        <div className="flex justify-between text-[11px] text-text-3 mt-1">
          {game.batter  && <span>AB: <span className="text-text-2 font-600">{game.batter}</span></span>}
          {game.pitcher && <span>P: <span className="text-text-2 font-600">{game.pitcher}</span></span>}
        </div>
      )}
    </Card>
  );
}

function GameDetail({ game, upcoming }: { game: GameSummary; upcoming?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-[15px] font-600 text-text-1">
            {game.isHome ? "vs " : "@ "}{game.opponent}
          </p>
          <p className="text-[12px] text-text-3 mt-0.5">{upcoming ? fmtDateTime(game.date) : fmtDate(game.date)}</p>
        </div>
        {game.broadcasts.length > 0 && (
          <div className="inline-flex items-center gap-1 text-[11px] text-text-2">
            <Tv size={11} /> {game.broadcasts.slice(0, 2).join(", ")}
          </div>
        )}
      </div>
      {game.venue && (
        <p className="text-[11px] text-text-3 inline-flex items-center gap-1">
          <MapPin size={10} /> {game.venue}
        </p>
      )}
      {upcoming && game.probablePitcher && (
        <p className="text-[11px] text-text-2">Probable: <span className="font-600 text-text-1">{game.probablePitcher}</span></p>
      )}
      <a
        href={`https://www.mlb.com/gameday/${game.gamePk}`}
        target="_blank" rel="noopener noreferrer"
        className="text-[11px] text-accent inline-flex items-center gap-1 hover:underline mt-1"
      >
        Open on MLB.com <ExternalLink size={10} />
      </a>
    </div>
  );
}
