"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { setLang, useContent, useLang, useT } from "@/lib/i18n";
import { levelProgress } from "@/lib/levels";
import { useProfile } from "@/lib/profile";
import { useVoix, type GainDetail } from "@/lib/voix";
import { AvatarFace } from "./Avatar";
import { IconBack } from "./Icons";

/** The four tabs: no back button there. */
const ROOTS = ["/", "/feed", "/defis", "/ma-ville"];

function parentOf(path: string): string {
  if (path === "/quiz") return "/feed";
  if (path.startsWith("/defis/") || path.startsWith("/equipes") || path.startsWith("/programmes") || ["/voter", "/frise"].includes(path)) return "/defis";
  if (path === "/donnees-personnelles") return "/profil";
  return "/";
}

const top = { top: "calc(env(safe-area-inset-top, 0px) + 12px)" };

/**
 * Replaces the old top bar. Floating glass buttons, in the same style as the tab bar:
 * - top right: the player's avatar (opens the profile), ringed by the progress to the next city level;
 *   earned voix pop out of it as a "+10 voix" bubble;
 * - top left, on sub-pages: a back button.
 * Onboarding shows only a FR / EN switch (the language setting otherwise lives in the profile).
 */
export function FloatingChrome() {
  const path = usePathname();
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const c = useContent();
  const profile = useProfile();
  const { total } = useVoix();
  const [mounted, setMounted] = useState(false);
  // One bubble at a time: gains that arrive while it shows add up ("+2 voix") and keep it up 1.5 s more.
  const [gain, setGain] = useState<{ id: number; amount: number } | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onGain = (e: Event) => {
      const { amount } = (e as CustomEvent<GainDetail>).detail;
      setGain((g) => ({ id: Date.now(), amount: (g?.amount ?? 0) + amount }));
      clearTimeout(timer);
      timer = setTimeout(() => setGain(null), 1500);
    };
    window.addEventListener("voix:gain", onGain);
    return () => {
      window.removeEventListener("voix:gain", onGain);
      clearTimeout(timer);
    };
  }, []);

  if (path === "/stats") return null;

  if (path === "/bienvenue") {
    return (
      <button
        onClick={() => setLang(lang === "fr" ? "en" : "fr")}
        className="glass fixed right-4 z-30 grid h-11 min-w-11 place-items-center rounded-full px-3 text-[15px] font-semibold text-ink transition active:scale-95"
        style={top}
        aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
      >
        {lang === "fr" ? "EN" : "FR"}
      </button>
    );
  }

  const progress = levelProgress(mounted ? total : 0);
  const level = c.levels[progress.index];
  const ring = 2 * Math.PI * 20;

  return (
    <>
      {!ROOTS.includes(path) && (
        <button
          onClick={() => router.push(parentOf(path))}
          className="glass fixed left-4 z-30 grid h-11 w-11 place-items-center rounded-full text-accent transition active:scale-95"
          style={top}
          aria-label={t("Retour", "Back")}
        >
          <IconBack />
        </button>
      )}
      <Link
        href="/profil"
        className="glass fixed right-4 z-30 grid h-11 w-11 place-items-center rounded-full transition active:scale-95"
        style={top}
        aria-label={`${t("Mon profil", "My profile")} · ${level.name}, ${mounted ? total : 0} voix`}
      >
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="20" fill="none" stroke="var(--line)" strokeWidth="2.5" />
          <circle
            cx="22"
            cy="22"
            r="20"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={ring * (1 - progress.pct)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <AvatarFace profile={mounted ? profile : { avatar: null, firstName: "" }} className="h-[34px] w-[34px] text-base" />
        {gain && (
          <span key={gain.id} className="glass bubble pointer-events-none absolute right-0 top-[calc(100%+6px)] whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold text-accent" aria-hidden>
            +{gain.amount} voix
          </span>
        )}
      </Link>
    </>
  );
}
