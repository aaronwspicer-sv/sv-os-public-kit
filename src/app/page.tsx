import { redirect } from "next/navigation";

// Self-host kit: no public marketing site. The owner's dashboard lives at
// /d; unauthenticated visitors are redirected to /login by the protected
// layout. Replace this with your own landing page if you want one.
export default function RootPage() {
  redirect("/d");
}
