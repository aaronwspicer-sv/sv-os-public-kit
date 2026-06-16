import { redirect } from "next/navigation";

// The activity feed moved into the Alfred cockpit. Keep this path working for
// old links / bookmarks / notifications by redirecting.
export default function ActivityRedirect() {
  redirect("/d/alfred");
}
