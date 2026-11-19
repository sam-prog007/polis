"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/feedback";
import { useT } from "@/lib/i18n";
import { useReturningPlayer } from "@/lib/returning";
import { IconCity, IconHome, IconNews, IconTrophy } from "./Icons";

const TABS = [
  { href: "/", fr: "Accueil", en: "Home", Icon: IconHome },
  { href: "/feed", fr: "Actu", en: "News", Icon: IconNews },
  { href: "/defis", fr: "Défis", en: "Challenges", Icon: IconTrophy },
  { href: "/ma-ville", fr: "Ville", en: "City", Icon: IconCity },
];

const HIDDEN = ["/bienvenue", "/stats"];

/** Which tab a page belongs to, or -1 (profile, privacy page…): then no tab is lit. */
function activeTab(path: string): number {
  if (path === "/") return 0;
  if (path === "/feed" || path === "/quiz") return 1;
  // Pages opened from the challenges hub (team match, voting guide, timeline, programmes) keep Défis lit.
  if (path.startsWith("/defis") || path.startsWith("/equipes") || path.startsWith("/programmes") || ["/voter", "/frise"].includes(path)) return 2;
  if (path.startsWith("/ma-ville")) return 3;
  return -1;
}

/**
 * Liquid glass tab bar: a floating capsule 16px from the sides and 12px above the safe area.
 * The open tab sits in a glass lens that slides from tab to tab (see .glass and .glass-lens in globals.css).
 */
export function BottomNav() {
  const path = usePathname();
  const params = useSearchParams();
  const returning = useReturningPlayer();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The home page is a welcome screen for new visitors and friends opening a challenge link: no tab bar there.
  const welcome = path === "/" && (!mounted || !returning || params.has("c"));
  if (HIDDEN.includes(path) || welcome) return null;
  const active = activeTab(path);

  return (
    <>
      <div className="h-[var(--nav-space)] shrink-0" aria-hidden />
      <nav
        aria-label={t("Navigation principale", "Main navigation")}
        className="glass fixed inset-x-4 z-30 mx-auto max-w-[26rem] rounded-full"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        <ul className="relative grid h-16 grid-cols-4 p-1.5">
          {/* The lens: a quarter-width track moved by whole steps, so translateX(100%) is exactly one tab. */}
          <li aria-hidden className="glass-lens-track pointer-events-none absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/4)]" style={{ transform: `translateX(${Math.max(active, 0) * 100}%)` }}>
            <span className={`glass-lens block h-full w-full rounded-full ${active < 0 ? "opacity-0" : "opacity-100"}`} />
          </li>
          {TABS.map(({ href, fr, en, Icon }, i) => {
            const on = i === active;
            return (
              <li key={href} className="relative">
                <Link
                  href={href}
                  onClick={() => haptic("tap")}
                  aria-current={on ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-[11px] font-semibold tracking-normal transition active:scale-95 ${on ? "text-accent" : "text-ink/70"}`}
                >
                  <Icon width={24} height={24} strokeWidth={on ? 2.3 : 1.8} />
                  {t(fr, en)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
