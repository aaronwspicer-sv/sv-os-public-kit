"use client";
import { usePathname } from "next/navigation";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Keying on pathname makes React re-mount on route change, replaying the page-enter animation
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
