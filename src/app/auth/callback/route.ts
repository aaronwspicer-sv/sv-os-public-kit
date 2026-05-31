import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { fireLoginAlert } from "@/lib/loginAlert";
import { isAllowedEmail } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user && isAllowedEmail(data.user.email)) {
      // Fire login success alert (allowlisted users only — unauthorized
      // attempts trigger the intrusion alert in middleware instead)
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
              ?? request.headers.get("x-real-ip") ?? "unknown";
      const userAgent = request.headers.get("user-agent") ?? "";
      fireLoginAlert({
        userId: data.user.id,
        email:  data.user.email ?? "",
        ip, userAgent,
      }).catch(() => {});
    }
  }

  // Land on the dashboard after OAuth — root path is reserved for the
  // future public site. If the user is not allowlisted, /d will redirect
  // back to /login (via the protected layout).
  return NextResponse.redirect(`${origin}/d`);
}
