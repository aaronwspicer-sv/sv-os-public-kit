import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fireIntrusionAlert } from "@/lib/intrusion";
import { hasValidTwoFaFromCookie, TWO_FA_COOKIE_NAME } from "@/lib/twofa";
import { isAllowedEmail } from "@/lib/ownerAllowlist";

// Routes that don't require authentication.
//   /api/cron/* is included here because Vercel cron has no Supabase session
//   cookie — without this, every scheduled job (morning brief, evening recap,
//   Sunday Alfred review, weekly reconcile reminder) was being 302-redirected
//   to /login and never actually executed. The cron handlers do their OWN
//   auth via the Authorization: Bearer <CRON_SECRET> header, so opening
//   them at the middleware layer is safe.
const PUBLIC_ROUTES = ["/login", "/auth/callback", "/u/", "/api/public/", "/api/cron/", "/get", "/about", "/os", "/contact", "/api/waitlist", "/api/contact"];
// Exact-match public routes (no trailing slash)
const PUBLIC_EXACT = new Set(["/u", "/"]);

// Routes a logged-in user can reach BEFORE clearing the 2FA gate
const TWO_FA_BYPASS_ROUTES = [
  "/auth/2fa-verify",
  "/api/auth/2fa-verify",
  "/api/auth/2fa-status",
  // Passkey auth needs to run BEFORE 2FA is cleared (it's the thing that clears it)
  "/api/auth/passkey/auth-options",
  "/api/auth/passkey/auth-verify",
];

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// Per-request CSP nonce → forwarded to React via request header so
// <Script nonce={nonce}> tags can opt in. Strict CSP via 'strict-dynamic'
// means only scripts loaded by a nonced script can execute → kills XSS.
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // data: needed because Next inlines small fonts as base64 data URLs
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    // 'unsafe-eval' still required by Plaid SDK; nonce + strict-dynamic
    // covers our app + Next.js runtime additions
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`,
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.notion.com https://api.open-meteo.com https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com https://ip-api.com https://api.openai.com",
    "worker-src 'self' blob:",
    "frame-src https://calendar.google.com https://vercel.live https://www.youtube-nocookie.com https://www.youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_ROUTES.some((r) => path.startsWith(r)) || PUBLIC_EXACT.has(path);

  // Not logged in — send to login (except public routes)
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Logged in with unauthorized account → fire alert, sign out, redirect
  if (user && !isAllowedEmail(user.email)) {
    const ip = getClientIP(request);
    const userAgent = request.headers.get("user-agent") ?? "";
    // Fire alert directly — no public HTTP endpoint, no spoofable POST.
    // Pass our supabase client so it doesn't try to call createClient()
    // (which uses next/headers cookies() — not available in middleware).
    fireIntrusionAlert(
      { attemptedEmail: user.email, ip, userAgent, path },
      supabase,
    ).catch(() => {});

    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
  }

  // Logged in, on login page — send to the dashboard (BootGate handles splash).
  // / is reserved for the future public marketing site; /d is the OS.
  if (user && path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/d", request.url));
  }

  // ── 2FA gate ──
  // If user has TOTP enabled and the current session hasn't cleared 2FA,
  // bounce to /auth/2fa-verify. Bypass for the 2fa-verify route itself
  // and the verify API endpoint.
  if (user && !isPublic && !TWO_FA_BYPASS_ROUTES.some(r => path.startsWith(r))) {
    // Check if user has TOTP enabled
    const { data: totp } = await supabase
      .from("user_totp")
      .select("enabled")
      .eq("user_id", user.id)
      .maybeSingle();

    if (totp?.enabled) {
      const cookieVal = request.cookies.get(TWO_FA_COOKIE_NAME)?.value;
      if (!(await hasValidTwoFaFromCookie(cookieVal, user.id))) {
        return NextResponse.redirect(new URL("/auth/2fa-verify", request.url));
      }
    }
  }

  // Set the per-request CSP + the nonce header on whatever final response we return
  supabaseResponse.headers.set("Content-Security-Policy", buildCsp(nonce));
  supabaseResponse.headers.set("x-nonce", nonce);
  // Permissions-Policy — must explicitly allow microphone (and camera for
  // future vision features) for our origin. Vercel/Next default is to deny
  // these, which makes getUserMedia throw "Permission denied" with the
  // browser-console violation "Permissions policy violation: microphone is
  // not allowed in this document" — completely separate from site permission.
  supabaseResponse.headers.set(
    "Permissions-Policy",
    [
      'microphone=(self)',
      'camera=(self)',
      'display-capture=(self)',  // screen share (for J2)
      'autoplay=(self)',
      'geolocation=()',           // explicitly deny
      'payment=()',
      'usb=()',
      'serial=()',
      'bluetooth=()',
    ].join(", "),
  );
  return supabaseResponse;
}

export const config = {
  // Skip middleware for Next.js internals, known static files, and any
  // public-folder asset (images, fonts, video, audio, docs).
  // Without the asset extensions, the middleware intercepts /aaron-aws.jpg etc.
  // and 302s unauthenticated requests to /login → broken <img> tags for public visitors.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|icons|sw\\.js|theme-init\\.js|[^/]+\\.(?:jpg|jpeg|png|gif|webp|svg|ico|mp4|mp3|mov|woff|woff2|ttf|otf|pdf)).*)"]
};
