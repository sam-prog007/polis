"use client";

import Link from "next/link";
import { CampIcon } from "@/components/CampIcon";
import { Sheet } from "@/components/Sheet";
import type { FeedCard } from "@/lib/content";
import { formatDate } from "@/lib/feed";
import { useContent, useT } from "@/lib/i18n";

const MONTHS = {
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** "13 nov. 2026" / "Nov 13, 2026": today's date for the masthead. */
export function editionDate(lang: "fr" | "en", d = new Date()) {
  return lang === "en" ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} ${MONTHS.fr[d.getMonth()]} ${d.getFullYear()}`;
}

/** Thin double rule, then "polis · L'édition du jour · 13 nov. 2026". */
export function Masthead() {
  const c = useContent();
  const t = useT();
  return (
    <div className="mx-5 border-t-[3px] border-double border-ink/70 pt-2.5" suppressHydrationWarning>
      <p className="flex items-center justify-between gap-2 border-b border-ink/15 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <span className="font-serif text-[13px] font-bold normal-case tracking-normal text-ink">polis</span>
        <span className="truncate">
          {t("L'édition du jour", "Today's edition")} · {editionDate(c.lang)}
        </span>
      </p>
    </div>
  );
}

/** The kicker line: topic in red small caps, the card's date, and a neutral camp chip. */
function Kicker({ card }: { card: FeedCard }) {
  const c = useContent();
  const t = useT();
  const topic = c.topicOf(card.topic);
  const date = formatDate(card.date, c.lang);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-rouge">
        {card.kind === "bases" ? t("Les bases", "The basics") : topic.label}
      </span>
      {date && <span className="text-[12px] font-semibold text-muted">· {date}</span>}
      {card.kind === "actu" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
          <CampIcon camp={card.camp} />
          {c.campLabels[card.camp]}
        </span>
      )}
    </div>
  );
}

/** Front of the card in the swipe stack: a newspaper clipping. Tapping it opens the full article (ArticleSheet). */
export function NewsCard({ card }: { card: FeedCard }) {
  const t = useT();
  const more = !!(card.why || card.sides?.length || card.guide);
  return (
    <article className="tile flex h-full flex-col overflow-hidden rounded-[22px] pt-4">
      <Masthead />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-5 pt-4">
        <Kicker card={card} />
        <h2 className="font-serif text-[30px] font-semibold leading-[1.08] tracking-[-0.01em] text-ink">{card.title}</h2>
        {card.actor && <p className="-mt-1 text-[13px] font-semibold text-muted">{card.actor}</p>}
        {/* Long texts fade out at the bottom instead of being cut mid-line; the article sheet has the rest. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <p className="text-[16px] leading-relaxed">{card.text}</p>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-card" aria-hidden />
        </div>
        <div className="flex shrink-0 items-end justify-between gap-3 border-t border-ink/15 pt-3">
          <p className="text-[13px] italic text-muted">
            {t("Source :", "Source:")} <span className="font-semibold not-italic text-ink">{card.source.label}</span>
          </p>
          <span className="shrink-0 text-[13px] font-semibold text-accent">{more ? t("Lire la suite ›", "Read more ›") : t("Détails ›", "Details ›")}</span>
        </div>
      </div>
    </article>
  );
}

/** The full article, opened by tapping a card: "Pour toi", what each camp says, the voting guide, the source. */
export function ArticleSheet({ card, onClose }: { card: FeedCard; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet onClose={onClose} labelledBy="article-title">
      <div className="flex flex-col gap-4 pb-2">
        <Kicker card={card} />
        <h2 id="article-title" className="font-serif text-[28px] font-semibold leading-[1.1]">
          {card.title}
        </h2>
        {card.actor && <p className="-mt-2 text-[14px] font-semibold text-muted">{card.actor}</p>}
        <p className="text-[17px] leading-relaxed">{card.text}</p>
        {card.why && (
          <p className="rounded-2xl bg-fill px-4 py-3 text-[15px]">
            <strong>{t("Pour toi :", "For you:")}</strong> {card.why}
          </p>
        )}
        {!!card.sides?.length && (
          <section className="flex flex-col gap-2 rounded-2xl bg-fill px-4 py-3">
            <h3 className="text-sm font-bold">
              {t("Ce que dit chaque camp", "What each side says")} ({card.sides.length})
            </h3>
            {card.sides.map((side) => (
              <p key={side.label} className="text-[15px]">
                <strong>{side.label}</strong> : {side.text}
              </p>
            ))}
          </section>
        )}
        {card.guide && (
          <Link href={card.guide === "auto" ? "/voter" : `/voter?profil=${card.guide}`} className="inline-flex min-h-11 w-fit items-center rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent">
            🗳️ {t("Les démarches, pas à pas", "The steps, one by one")} →
          </Link>
        )}
        <a href={card.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-fit items-center text-[15px] font-semibold text-accent underline underline-offset-4">
          {t("Source :", "Source:")} {card.source.label} ↗
        </a>
      </div>
    </Sheet>
  );
}
