// Toronto Blue Jays data fetched from MLB Stats API (public, no auth).
// Team ID: 141 · AL East division ID: 201 · AL league ID: 103
// Cached on the server with revalidate so we don't hammer the upstream.
import { config } from "@/config";

export const JAYS_TEAM_ID = 141;
export const AL_LEAGUE_ID = 103;

const STATS = "https://statsapi.mlb.com/api/v1";

function todayToronto(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}
function isoDays(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
}

export interface JaysSummary {
  fetchedAt: string;
  record: { wins: number; losses: number; pct: string } | null;
  divisionRank: number | null;
  gamesBack: string | null;
  streak: string | null;
  lastGame: GameSummary | null;
  nextGame: GameSummary | null;
  liveGame: LiveGame | null;
}

export interface GameSummary {
  gamePk: number;
  date: string;            // ISO datetime
  status: string;          // Scheduled | In Progress | Final | Postponed
  opponent: string;
  opponentAbbr: string;
  isHome: boolean;
  jaysScore: number | null;
  opponentScore: number | null;
  venue: string;
  broadcasts: string[];
  inning: number | null;
  inningState: string | null;
  probablePitcher: string | null;
}

export interface LiveGame extends GameSummary {
  outs: number | null;
  runners: { first: boolean; second: boolean; third: boolean };
  balls: number | null;
  strikes: number | null;
  batter: string | null;
  pitcher: string | null;
}

function asGameSummary(g: any): GameSummary {
  const jays = g.teams?.home?.team?.id === JAYS_TEAM_ID ? g.teams.home : g.teams?.away;
  const opp  = g.teams?.home?.team?.id === JAYS_TEAM_ID ? g.teams.away : g.teams?.home;
  const isHome = g.teams?.home?.team?.id === JAYS_TEAM_ID;
  return {
    gamePk:        g.gamePk,
    date:          g.gameDate,
    status:        g.status?.detailedState ?? "Scheduled",
    opponent:      opp?.team?.name ?? "TBD",
    opponentAbbr:  opp?.team?.abbreviation ?? opp?.team?.teamCode ?? "—",
    isHome,
    jaysScore:     typeof jays?.score === "number" ? jays.score : null,
    opponentScore: typeof opp?.score  === "number" ? opp.score  : null,
    venue:         g.venue?.name ?? "",
    broadcasts:    (g.broadcasts ?? []).map((b: any) => b.name).filter(Boolean),
    inning:        g.linescore?.currentInning ?? null,
    inningState:   g.linescore?.inningState ?? null,
    probablePitcher: jays?.probablePitcher?.fullName ?? null,
  };
}

async function fetchJson<T = any>(url: string, revalidate = 60): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export async function getJaysSummary(): Promise<JaysSummary> {
  // Wide schedule window: 7 days back, 14 days forward, so we always find a recent + next game
  const start = isoDays(-7);
  const end   = isoDays(14);
  const schedule = await fetchJson<any>(
    `${STATS}/schedule?sportId=1&teamId=${JAYS_TEAM_ID}&startDate=${start}&endDate=${end}&hydrate=team,linescore,probablePitcher,broadcasts`,
    60,
  );
  const games: any[] = (schedule?.dates ?? []).flatMap((d: any) => d.games ?? []);
  const sorted = [...games].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const now = new Date().toISOString();

  const live = sorted.find(g => ["In Progress", "Pre-Game", "Warmup", "Manager challenge"].includes(g.status?.detailedState));
  const nextGame = sorted.find(g => g.gameDate > now && g.status?.detailedState !== "Final");
  const lastGame = [...sorted].reverse().find(g => g.status?.detailedState === "Final");

  // Standings
  const standings = await fetchJson<any>(
    `${STATS}/standings?leagueId=${AL_LEAGUE_ID}&season=${new Date().getFullYear()}&standingsTypes=regularSeason`,
    300,
  );
  let record: JaysSummary["record"] = null;
  let divisionRank: number | null = null;
  let gamesBack: string | null = null;
  let streak: string | null = null;
  for (const rec of (standings?.records ?? [])) {
    const tr = (rec.teamRecords ?? []).find((t: any) => t.team?.id === JAYS_TEAM_ID);
    if (tr) {
      record = { wins: tr.wins, losses: tr.losses, pct: tr.winningPercentage };
      divisionRank = parseInt(tr.divisionRank, 10) || null;
      gamesBack = tr.gamesBack ?? null;
      streak = tr.streak?.streakCode ?? null;
      break;
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    record,
    divisionRank,
    gamesBack,
    streak,
    lastGame: lastGame ? asGameSummary(lastGame) : null,
    nextGame: nextGame ? asGameSummary(nextGame) : null,
    liveGame: live ? asLiveGame(live) : null,
  };
}

function asLiveGame(g: any): LiveGame {
  const base = asGameSummary(g);
  return {
    ...base,
    outs:    g.linescore?.outs ?? null,
    runners: {
      first:  !!g.linescore?.offense?.first,
      second: !!g.linescore?.offense?.second,
      third:  !!g.linescore?.offense?.third,
    },
    balls:   g.linescore?.balls ?? null,
    strikes: g.linescore?.strikes ?? null,
    batter:  g.linescore?.offense?.batter?.fullName ?? null,
    pitcher: g.linescore?.defense?.pitcher?.fullName ?? null,
  };
}

void todayToronto;
