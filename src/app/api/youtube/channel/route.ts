import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";

export async function GET() {
  const gate = await requireOwner();
  if (!gate.ok) return gate.error;

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return NextResponse.json({ error: "YOUTUBE_API_KEY not configured" }, { status: 500 });

  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!channelId) return NextResponse.json({ error: "YOUTUBE_CHANNEL_ID not configured" }, { status: 500 });

  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${key}`,
      { next: { revalidate: 3600 } },
    );
    if (!r.ok) return NextResponse.json({ error: `YouTube API error: ${r.status}` }, { status: 502 });

    const d = await r.json();
    const c = d.items?.[0];
    if (!c) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    return NextResponse.json({
      subs:       Number(c.statistics?.subscriberCount ?? 0),
      totalViews: Number(c.statistics?.viewCount ?? 0),
      videos:     Number(c.statistics?.videoCount ?? 0),
      title:      c.snippet?.title ?? "",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
