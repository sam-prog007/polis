"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconClose, IconDown, IconInfo, IconUp } from "@/components/Icons";
import { CampIcon } from "@/components/CampIcon";
import { InlineChallenge } from "@/components/InlineChallenge";
import { Button, ButtonLink } from "@/components/ui";
import type { Camp, FeedCard } from "@/lib/content";
import { SCORE, buildPool, effectiveScores, formatDate, pickNext, topTopics, type TopicScores } from "@/lib/feed";
import { useContent, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile";
import { recordCampRead } from "@/lib/progress";
import { hashSeed, randomStream } from "@/lib/rng";
import { getSessionId } from "@/lib/session";
import { readSession, writeSession } from "@/lib/storage";
import { addTopicScore, resetTopicScores, useTopicScores } from "@/lib/topicScores";
import { track } from "@/lib/track";
import { VOIX, addVoix } from "@/lib/voix";

// A short challenge ("Défi rapide") comes after every N cards, inside the feed.
const CHALLENGE_EVERY = 3;

type Section = { kind: "card"; card: FeedCard; n: number } | { kind: "challenge"; readCards: FeedCard[]; n: number } | { kind: "end" };

export function FeedClient() {
  const profile = useProfile();
  const t = useT();
  const [mounted, setMounted] = useState(false);
  const [skipProfile, setSkipProfile] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="flex-1" />;
  if (!profile.done && !skipProfile) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 pb-8 pt-[var(--top-space)]">
        <div className="hero rounded-[2rem] p-6">
          <p className="kicker">{t("Ton fil d'actu", "Your news feed")}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold leading-tight text-hero">{t("Une minute pour l'adapter à toi ?", "One minute to make it yours?")}</h1>
          <p className="mt-2 text-muted">{t("Ton niveau et tes sujets, pour des actus utiles. Tu verras toujours tous les bords.", "Your level and topics, for useful news. You will always see every side.")}</p>
        </div>
        <ButtonLink href="/bienvenue">{t("Faire mon profil", "Set up my profile")}</ButtonLink>
        <Button variant="secondary" onClick={() => setSkipProfile(true)}>
          {t("Continuer sans profil", "Continue without a profile")}
        </Button>
      </main>
    );
  }
  return <Feed />;
}

function Feed() {
  const profile = useProfile();
  const c = useContent();
  const t = useT();
  const pool = useMemo(() => buildPool(profile, c), [profile, c]);
  const [reactions, setReactions] = useState<Record<string, "up" | "down">>({});
  const [order, setOrder] = useState<string[]>([]);
  const [current, setCurrent] = useState(0);
  const [showInfo, setShowInfo] = useState(false);
  const seen = useRef(new Set<string>());
  // Questions already asked in earlier quick challenges, so the next ones don't repeat them.
  const usedQuestions = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);

  // What the feed learned, per topic only (lib/topicScores.ts), plus +2 for the topics chosen at onboarding.
  const learned = useTopicScores();
  const scores = useMemo(() => effectiveScores(learned, profile.interests), [learned, profile.interests]);
  // Random but seeded by this phone's id and the card's position: the same phone always gets the same next card.
  const next = useCallback((o: string[]) => pickNext(pool, o, { scores, random: randomStream(hashSeed(`${getSessionId()}:${o.length}`)).next }), [pool, scores]);
  const detailsOpened = useRef(new Set<string>());

  // Start with the first card, then keep exactly one card ahead of the reader.
  useEffect(() => {
    setOrder((o) => {
      if (o.length) return o;
      const first = next([]);
      return first ? [first.id] : [];
    });
  }, [next]);

  const sections: Section[] = useMemo(() => {
    const out: Section[] = [];
    order.forEach((id, i) => {
      const card = pool.find((c) => c.id === id);
      if (!card) return;
      out.push({ kind: "card", card, n: i + 1 });
      // After every 3 cards (but not after the very last one), a quick challenge on those 3 cards.
      if ((i + 1) % CHALLENGE_EVERY === 0 && i + 1 < pool.length) {
        const readCards = order.slice(i + 1 - CHALLENGE_EVERY, i + 1).map((x) => pool.find((c) => c.id === x)).filter((c): c is FeedCard => !!c);
        out.push({ kind: "challenge", readCards, n: (i + 1) / CHALLENGE_EVERY });
      }
    });
    if (order.length === pool.length && order.length) out.push({ kind: "end" });
    return out;
  }, [order, pool]);

  const currentCardNumber = useMemo(() => {
    for (let i = Math.min(current, sections.length - 1); i >= 0; i--) {
      const s = sections[i];
      if (s?.kind === "card") return s.n;
    }
    return 1;
  }, [current, sections]);

  useEffect(() => {
    const lastCardPos = sections.map((s) => s.kind).lastIndexOf("card");
    if (current >= lastCardPos && order.length && order.length < pool.length) {
      const card = next(order);
      if (card) setOrder((o) => (o.includes(card.id) ? o : [...o, card.id]));
    }
  }, [current, sections, order, pool, next]);

  const onCardVisible = useCallback((card: FeedCard) => {
    if (seen.current.has(card.id)) return;
    seen.current.add(card.id);
    const all = readSession<string[]>("p27.seenCards", []);
    writeSession("p27.seenCards", [...all.filter((x) => x !== card.id), card.id]);
    track("feed_card_view", { cardId: card.id, camp: card.camp, topic: card.topic });
    addVoix(VOIX.feedCard, t("Carte lue", "Card read"), `feed:${card.id}`);
    recordCampRead(card.camp);
  }, [t]);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const pos = Number((e.target as HTMLElement).dataset.pos);
          setCurrent(pos);
          const s = sections[pos];
          if (s?.kind === "card") onCardVisible(s.card);
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-pos]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sections, onCardVisible]);

  const goTo = useCallback((pos: number) => {
    const el = scroller.current?.querySelector(`[data-pos="${pos}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") goTo(Math.min(current + 1, sections.length - 1));
      if (e.key === "ArrowUp") goTo(Math.max(current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, sections.length, goTo]);

  const react = (card: FeedCard, reaction: "up" | "down") => {
    const before = reactions[card.id];
    if (before === reaction) return;
    setReactions((r) => ({ ...r, [card.id]: reaction }));
    // The like counts for the card's topic only, never for its camp. Changing 👍 to 👎 undoes the first one.
    addTopicScore(card.topic, SCORE[reaction] - (before ? SCORE[before] : 0));
    // Anonymous on purpose: no session id, so a reaction can never be linked to a player.
    track("feed_reaction", { cardId: card.id, camp: card.camp, topic: card.topic, reaction }, { anonymous: true });
  };

  const openDetails = (card: FeedCard) => {
    if (detailsOpened.current.has(card.id)) return;
    detailsOpened.current.add(card.id);
    addTopicScore(card.topic, SCORE.details);
  };

  const total = pool.length;
  const atEnd = current >= sections.length - 1 && order.length === total;

  return (
    <div className="relative mx-auto w-full max-w-md flex-1">
      {/* Header: progress + why these cards */}
      <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-paper via-paper/90 to-transparent pb-4 pl-4 pr-[4.5rem]" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
        <div className="flex h-11 items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(currentCardNumber / total) * 100}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-muted" aria-live="polite">
            {currentCardNumber}/{total}
          </span>
          <button onClick={() => setShowInfo(true)} className="grid h-9 w-9 place-items-center rounded-full bg-fill text-muted" aria-label={t("Pourquoi ces actus ?", "Why these news?")}>
            <IconInfo width={18} height={18} />
          </button>
        </div>
      </div>

      {/* Up / down arrows */}
      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2">
        <button
          onClick={() => goTo(Math.max(current - 1, 0))}
          disabled={current === 0}
          className="grid h-12 w-12 place-items-center rounded-full bg-card/90 shadow-[0_4px_16px_rgba(0,0,0,0.12)] backdrop-blur transition disabled:opacity-30"
          aria-label={t("Carte précédente", "Previous card")}
        >
          <IconUp />
        </button>
        <button
          onClick={() => goTo(Math.min(current + 1, sections.length - 1))}
          disabled={atEnd}
          className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-ink shadow-md transition disabled:opacity-30"
          aria-label={t("Carte suivante", "Next card")}
        >
          <IconDown />
        </button>
      </div>

      <div
        ref={scroller}
        className="no-scrollbar h-[calc(100dvh-var(--nav-space))] snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {sections.map((s, pos) => (
          <section key={s.kind === "card" ? s.card.id : s.kind === "challenge" ? `challenge-${s.n}` : s.kind} data-pos={pos} className="no-scrollbar flex h-full snap-start snap-always flex-col overflow-y-auto pb-6 pl-4 pr-[4.25rem] pt-[var(--top-space)]">
            <div className="my-auto">
            {s.kind === "card" && <CardView card={s.card} reaction={reactions[s.card.id]} onReact={(r) => react(s.card, r)} onOpenDetails={() => openDetails(s.card)} first={pos === 0} />}
            {s.kind === "challenge" && <InlineChallenge readCards={s.readCards} used={usedQuestions.current} onContinue={() => goTo(pos + 1)} />}
            {s.kind === "end" && (
              <div className="hero pop flex flex-col gap-4 rounded-[2rem] p-6">
                <p className="text-4xl" aria-hidden>
                  🎉
                </p>
                <h2 className="font-display text-3xl font-extrabold leading-tight text-hero">{t("Tu es à jour sur la campagne !", "You're up to date on the campaign!")}</h2>
                <p className="text-muted">{t("De nouvelles actus arrivent régulièrement jusqu'au 18 avril.", "New stories keep coming until 18 April.")}</p>
                <ButtonLink href="/quiz">{t("Tester ce que j'ai retenu", "Test what I remember")}</ButtonLink>
                <Link href="/defis" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-fill font-semibold text-accent">
                  {t("Voir les défis", "See the challenges")}
                </Link>
              </div>
            )}
            </div>
          </section>
        ))}
      </div>

      {showInfo && <InfoSheet onClose={() => setShowInfo(false)} scores={scores} learned={learned} />}
    </div>
  );
}

function CardView({ card, reaction, onReact, onOpenDetails, first }: { card: FeedCard; reaction?: "up" | "down"; onReact: (r: "up" | "down") => void; onOpenDetails: () => void; first: boolean }) {
  const c = useContent();
  const t = useT();
  const topic = c.topicOf(card.topic);
  const date = formatDate(card.date, c.lang);
  return (
    <div className="flex flex-col gap-3">
      <article className="tile flex flex-col overflow-hidden rounded-[22px]">
        <div className="flex items-center justify-between gap-2 bg-accent-soft px-5 py-3 text-sm font-bold">
          <span className="inline-flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {card.kind === "bases" ? "📘" : topic.emoji}
            </span>
            {card.kind === "bases" ? t("Les bases", "The basics") : topic.label}
          </span>
          {date && <span className="font-semibold text-muted">{date}</span>}
        </div>
        <div className="flex flex-col gap-3 p-5">
          {card.kind === "actu" && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-fill px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-muted">
              <CampIcon camp={card.camp} />
              {c.campLabels[card.camp]}
              {card.actor && <span className="normal-case tracking-normal"> · {card.actor}</span>}
            </span>
          )}
          <h2 className="font-display text-[26px] font-bold leading-[1.15]">{card.title}</h2>
          <p className="text-[17px] leading-relaxed">{card.text}</p>
          {card.why && (
            <p className="rounded-2xl bg-fill px-4 py-3 text-[15px]">
              <strong>{t("Pour toi :", "For you:")}</strong> {card.why}
            </p>
          )}
          {card.sides && (
            <details className="group rounded-2xl bg-fill px-4 py-3" onToggle={(e) => e.currentTarget.open && onOpenDetails()}>
              <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold">
                {t("Ce que dit chaque camp", "What each side says")} ({card.sides.length})
                <span className="transition group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </summary>
              <div className="mt-2 flex flex-col gap-2">
                {card.sides.map((side) => (
                  <p key={side.label} className="text-[15px]">
                    <strong>{side.label}</strong> : {side.text}
                  </p>
                ))}
              </div>
            </details>
          )}
          {card.guide && (
            <Link href={card.guide === "auto" ? "/voter" : `/voter?profil=${card.guide}`} className="inline-flex min-h-11 w-fit items-center rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent">
              🗳️ {t("Les démarches, pas à pas", "The steps, one by one")} →
            </Link>
          )}
          <a href={card.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 w-fit items-center text-sm font-semibold text-accent underline underline-offset-4">
            Source : {card.source.label} ↗
          </a>
        </div>
      </article>
      <div className="grid grid-cols-2 gap-2">
        {(["up", "down"] as const).map((r) => (
          <button
            key={r}
            onClick={() => onReact(r)}
            aria-pressed={reaction === r}
            className={`min-h-12 rounded-2xl border-2 font-semibold transition ${reaction === r ? "border-accent bg-accent-soft text-accent" : "border-line bg-card"}`}
          >
            {r === "up" ? t("👍 Intéressant", "👍 Interesting") : t("👎 Bof", "👎 Meh")}
          </button>
        ))}
      </div>
      {first && (
        <p className="flex items-center justify-center gap-2 text-sm font-semibold text-muted">
          <span className="animate-bounce" aria-hidden>
            ↓
          </span>
          {t("Fais glisser vers le haut, ou touche la flèche bleue", "Swipe up, or tap the blue arrow")}
        </p>
      )}
    </div>
  );
}

function InfoSheet({ onClose, scores, learned }: { onClose: () => void; scores: TopicScores; learned: TopicScores }) {
  const c = useContent();
  const t = useT();
  // The player's favourite topics: the top 3 among those with a positive score.
  const top = topTopics(scores, c.topics.map((x) => x.id)).filter((id) => (scores[id] ?? 0) > 0);
  const hasLearned = Object.values(learned).some((v) => v !== 0);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        className="pop w-full max-w-md rounded-t-[2rem] bg-card p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-title"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="why-title" className="font-display text-2xl font-bold">
            {t("Pourquoi ces actus ?", "Why these news?")}
          </h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-fill" aria-label={t("Fermer", "Close")}>
            <IconClose width={18} height={18} />
          </button>
        </div>
        <ul className="mt-4 flex flex-col gap-3 text-[15px]">
          <li>
            👍 {t("Tes 👍 / 👎 comptent pour le thème de la carte, jamais pour le camp : les thèmes que tu aimes reviennent plus souvent.", "Your 👍 / 👎 count for the card's topic, never for its side: the topics you like come up more often.")}
          </li>
          <li>🔁 {t("Sur chaque thème, la gauche, le centre, la droite et l'extrême droite passent à tour de rôle, avec des infos neutres entre les deux.", "On every topic, the left, the centre, the right and the far right take turns, with neutral facts in between.")}</li>
          <li>🧭 {t("Au moins une carte sur quatre vient d'un autre thème, pour sortir de tes habitudes.", "At least one card in four comes from another topic, to get you out of your habits.")}</li>
          <li>✅ {t("Chaque carte a une source. On ne te dira jamais pour qui voter.", "Every card has a source. We will never tell you who to vote for.")}</li>
          <li>📰 {t("Nos sources : médias publics, AFP, sites officiels et grands quotidiens sans ligne partisane.", "Our sources: public media, AFP, official sites and major newspapers with no partisan line.")}</li>
        </ul>
        <div className="mt-5 flex flex-col gap-2 rounded-2xl bg-fill p-4">
          <p className="text-sm font-semibold">⭐ {t("Tes thèmes préférés", "Your favourite topics")}</p>
          {top.length ? (
            <div className="flex flex-wrap gap-2">
              {top.map((id) => {
                const tp = c.topicOf(id);
                return (
                  <span key={id} className="rounded-full bg-card px-3 py-1 text-sm font-semibold">
                    {tp.emoji} {tp.label}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">{t("Pas encore : réagis à quelques cartes.", "None yet: react to a few cards.")}</p>
          )}
          <p className="text-xs text-muted">{t("Gardé uniquement sur ton téléphone.", "Kept on your phone only.")}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={resetTopicScores} disabled={!hasLearned} className="!px-3 !text-[15px]">
            {t("Remettre à zéro", "Reset")}
          </Button>
          <Link href="/profil" className="inline-flex min-h-[50px] items-center justify-center rounded-[14px] bg-fill px-3 text-center text-[15px] font-semibold text-accent">
            {t("Modifier mes sujets", "Edit my topics")}
          </Link>
        </div>
      </div>
    </div>
  );
}
