// External data sources for the daily briefing.
// All fetches must be cheap, parallel, and fault-tolerant — one bad upstream
// can't break the email. Each function returns null on failure and the
// renderer falls back to a "—" cell.
import { config } from "@/config";

export interface Weather {
  tempC: number;
  highC: number;
  lowC: number;
  code: number;
  emoji: string;
  sunrise: string;  // "5:47"
  sunset:  string;  // "8:38"
}

export interface NewsItem { title: string; url: string; source: string }
export interface Ticker   { symbol: string; price: number; changePct: number }
export interface JaysBrief {
  lastResult: string | null;   // "W 5-3 vs BAL"
  tonight:    string | null;   // "tonight 7:05 vs NYY"
}

const WEATHER_EMOJI: Record<number, string> = {
  0:  "☀️",  1:  "🌤", 2: "⛅", 3: "☁️",
  45: "🌫", 48: "🌫",
  51: "🌦", 53: "🌦", 55: "🌧",
  61: "🌧", 63: "🌧", 65: "🌧",
  71: "🌨", 73: "🌨", 75: "❄️", 77: "🌨",
  80: "🌧", 81: "🌧", 82: "🌧",
  85: "🌨", 86: "❄️",
  95: "⛈", 96: "⛈", 99: "⛈",
};

const TORONTO = { lat: config.locale.weather.latitude, lon: config.locale.weather.longitude };

async function withTimeout<T>(p: Promise<T>, ms = 4000): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

export async function fetchWeather(): Promise<Weather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${TORONTO.lat}&longitude=${TORONTO.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=${encodeURIComponent(config.locale.timezone)}&forecast_days=1`;
    const r = await withTimeout(fetch(url, { cache: "no-store" }));
    if (!r.ok) return null;
    const d = await r.json();
    const code = d.current?.weather_code ?? 0;
    const sr = (d.daily?.sunrise?.[0] ?? "").slice(11, 16); // "HH:MM"
    const ss = (d.daily?.sunset?.[0]  ?? "").slice(11, 16);
    return {
      tempC: Math.round(d.current?.temperature_2m ?? 0),
      highC: Math.round(d.daily?.temperature_2m_max?.[0] ?? 0),
      lowC:  Math.round(d.daily?.temperature_2m_min?.[0] ?? 0),
      code,
      emoji: WEATHER_EMOJI[code] ?? "🌥",
      sunrise: sr,
      sunset:  ss,
    };
  } catch { return null; }
}

/** BBC World top 3 headlines via RSS (no key needed). */
export async function fetchHeadlines(): Promise<NewsItem[]> {
  try {
    const r = await withTimeout(fetch("https://feeds.bbci.co.uk/news/world/rss.xml", { cache: "no-store" }));
    if (!r.ok) return [];
    const xml = await r.text();
    const items: NewsItem[] = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) && items.length < 3) {
      const block = m[1];
      const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(block)?.[1]?.trim();
      const link  = /<link>([\s\S]*?)<\/link>/.exec(block)?.[1]?.trim();
      if (title && link) items.push({ title, url: link, source: "BBC" });
    }
    return items;
  } catch { return []; }
}

/** Crypto via CoinGecko + stocks via Yahoo. */
export async function fetchMarkets(): Promise<Ticker[]> {
  const out: Ticker[] = [];
  // Crypto
  try {
    const r = await withTimeout(fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
      { cache: "no-store" },
    ));
    if (r.ok) {
      const d = await r.json();
      if (d.bitcoin)  out.push({ symbol: "BTC", price: d.bitcoin.usd,  changePct: d.bitcoin.usd_24h_change });
      if (d.ethereum) out.push({ symbol: "ETH", price: d.ethereum.usd, changePct: d.ethereum.usd_24h_change });
    }
  } catch {}
  // Stocks
  try {
    const r = await withTimeout(fetch(
      "https://query1.finance.yahoo.com/v7/finance/quote?symbols=NVDA,AAPL,GOOGL,MSFT,TSLA",
      { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (SpicerOS briefing)" } },
    ));
    if (r.ok) {
      const d = await r.json();
      for (const q of d?.quoteResponse?.result ?? []) {
        out.push({
          symbol:    q.symbol,
          price:     q.regularMarketPrice ?? 0,
          changePct: q.regularMarketChangePercent ?? 0,
        });
      }
    }
  } catch {}
  return out;
}

/** Jays — last finished + next scheduled game. Mirrors /api/jays logic. */
export async function fetchJays(): Promise<JaysBrief> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  const yest  = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });
  const tomr  = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: config.locale.timezone });

  let lastResult: string | null = null;
  let tonight:    string | null = null;
  const teamId = 141; // Toronto Blue Jays MLB ID

  try {
    // Yesterday's game (last result)
    const u1 = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&date=${yest}`;
    const r1 = await withTimeout(fetch(u1, { cache: "no-store" }));
    if (r1.ok) {
      const d = await r1.json();
      const g = d?.dates?.[0]?.games?.[0];
      if (g && g.status?.statusCode === "F") {
        const isHome = g.teams.home.team.id === teamId;
        const us = isHome ? g.teams.home : g.teams.away;
        const them = isHome ? g.teams.away : g.teams.home;
        const result = us.score > them.score ? "W" : us.score < them.score ? "L" : "T";
        const opp = them.team.abbreviation ?? them.team.teamCode?.toUpperCase() ?? "OPP";
        lastResult = `${result} ${us.score}-${them.score} ${isHome ? "vs" : "@"} ${opp}`;
      }
    }
  } catch {}

  try {
    // Today's or tomorrow's scheduled game
    for (const date of [today, tomr]) {
      const u = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${teamId}&date=${date}`;
      const r = await withTimeout(fetch(u, { cache: "no-store" }));
      if (!r.ok) continue;
      const d = await r.json();
      const g = d?.dates?.[0]?.games?.[0];
      if (g && (g.status?.statusCode === "S" || g.status?.statusCode === "P" || g.status?.statusCode === "PW")) {
        const isHome = g.teams.home.team.id === teamId;
        const opp = isHome ? g.teams.away.team : g.teams.home.team;
        const oppAbbr = opp.abbreviation ?? opp.teamCode?.toUpperCase() ?? "OPP";
        const time = new Date(g.gameDate).toLocaleTimeString("en-US", {
          timeZone: config.locale.timezone, hour: "numeric", minute: "2-digit",
        });
        const when = date === today ? "tonight" : "tomorrow";
        tonight = `${when} ${time} ${isHome ? "vs" : "@"} ${oppAbbr}`;
        break;
      }
    }
  } catch {}

  return { lastResult, tonight };
}
