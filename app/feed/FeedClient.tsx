"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleSheet, Masthead, NewsCard } from "@/components/feed/NewsCard";
import { SwipeStack, type StackItem, type SwipeDir } from "@/components/feed/SwipeStack";
import { IconClose, IconInfo } from "@/components/Icons";
import { InlineChallenge } from "@/components/InlineChallenge";
import { Button, ButtonLink } from "@/components/ui";
import type { FeedCard } from "@/lib/content";
import { SCORE, buildPool, effectiveScores, pickNext, topTopics, type TopicScores } from "@/lib/feed";
import { useContent, useT } from "@/lib/i18n";
import { useProfile } from "@/lib/profile";
import { recordCampRead } from "@/lib/progress";
import { hashSeed, randomStream } from "@/lib/rng";
import { getSessionId } from "@/lib/session";
import { readJSON, readSession, writeJSON, writeSession } from "@/lib/storage";
import { addTopicScore, resetTopicScores, useTopicScores } from "@/lib/topicScores";
import { track } from "@/lib/track";
import { VOIX, addVoix } from "@/lib/voix";

// A short challenge ("Défi rapide") comes after every N cards, as a card in the stack.
const CHALLENGE_EVERY = 3;

type Item = { kind: "card"; card: FeedCard; n: number } | { kind: "challenge"; readCards: FeedCard[]; n: number } | { kind: "end" };

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

/**
 * The newspaper feed: a stack of cards. Swipe right = "J'aime", left = "Pas pour moi" (both count as read,
 * +1 voix); only the card's topic score changes (lib/feed.ts). A quick challenge comes every 3 cards and
 * can't be swiped until it is answered or skipped. Tap a card to read the whole article.
 */
function Feed() {
  const profile = useProfile();
  const c = useContent();
  const t = useT();
  const pool = useMemo(() => buildPool(profile, c), [profile, c]);
  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [reactions, setReactions] = useState<Record<string, "up" | "down">>({});
  const [history, setHistory] = useState<{ index: number; card: FeedCard; reaction: "up" | "down" }[]>([]);
  const [article, setArticle] = useState<FeedCard | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [coach, setCoach] = useState(false);
  const seen = useRef(new Set<string>());
  const opened = useRef(new Set<string>());
  // Questions already asked in earlier quick challenges, so the next ones don't repeat them.
  const usedQuestions = useRef(new Set<string>());

  // What the feed learned, per topic only (lib/topicScores.ts), plus +2 for the topics chosen at onboarding.
  const learned = useTopicScores();
  const scores = useMemo(() => effectiveScores(learned, profile.interests), [learned, profile.interests]);
  // Random but seeded by this phone's id and the card's position: the same phone always gets the same next card.
  const next = useCallback((o: string[]) => pickNext(pool, o, { scores, random: randomStream(hashSeed(`${getSessionId()}:${o.length}`)).next }), [pool, scores]);

  useEffect(() => setCoach(!readJSON<boolean>("p27.feedCoachSeen", false)), []);

  const items: Item[] = useMemo(() => {
    const out: Item[] = [];
    order.forEach((id, i) => {
      const card = pool.find((x) => x.id === id);
      if (!card) return;
      out.push({ kind: "card", card, n: i + 1 });
      // After every 3 cards (but not after the very last one), a quick challenge on those 3 cards.
      if ((i + 1) % CHALLENGE_EVERY === 0 && i + 1 < pool.length) {
        const readCards = order.slice(i + 1 - CHALLENGE_EVERY, i + 1).map((x) => pool.find((y) => y.id === x)).filter((y): y is FeedCard => !!y);
        out.push({ kind: "challenge", readCards, n: (i + 1) / CHALLENGE_EVERY });
      }
    });
    if (order.length === pool.length && order.length) out.push({ kind: "end" });
    return out;
  }, [order, pool]);

  // Keep the stack 3 deep: pick the next cards a little ahead of the reader.
  useEffect(() => {
    if (order.length >= pool.length || items.length >= index + 3) return;
    const card = next(order);
    if (card) setOrder((o) => (o.includes(card.id) ? o : [...o, card.id]));
  }, [items.length, index, order, pool.length, next]);

  const top = items[index];

  // A card on top of the stack counts as viewed (same event as before, so /stats stays comparable).
  useEffect(() => {
    if (top?.kind !== "card" || seen.current.has(top.card.id)) return;
    seen.current.add(top.card.id);
    const all = readSession<string[]>("p27.seenCards", []);
    writeSession("p27.seenCards", [...all.filter((x) => x !== top.card.id), top.card.id]);
    track("feed_card_view", { cardId: top.card.id, camp: top.card.camp, topic: top.card.topic });
    recordCampRead(top.card.camp);
  }, [top]);

  const swipe = useCallback(
    (dir: SwipeDir) => {
      if (top?.kind !== "card") return;
      const card = top.card;
      const reaction = dir === "right" ? "up" : "down";
      // The swipe counts for the card's topic only, never for its camp.
      addTopicScore(card.topic, SCORE[reaction]);
      setReactions((r) => ({ ...r, [card.id]: reaction }));
      // Anonymous on purpose: no session id, so a reaction can never be linked to a player.
      track("feed_reaction", { cardId: card.id, camp: card.camp, topic: card.topic, reaction }, { anonymous: true });
      // Both directions count as read.
      addVoix(VOIX.feedCard, t("Carte lue", "Card read"), `feed:${card.id}`);
      setHistory((h) => [...h, { index, card, reaction }]);
      setIndex((i) => i + 1);
      if (coach) {
        setCoach(false);
        writeJSON("p27.feedCoachSeen", true);
      }
    },
    [top, index, t, coach],
  );

  const last = history[history.length - 1];
  const canUndo = !!last && last.index === index - 1;
  const undo = () => {
    if (!canUndo) return;
    addTopicScore(last.card.topic, -SCORE[last.reaction]);
    setReactions((r) => {
      const copy = { ...r };
      delete copy[last.card.id];
      return copy;
    });
    setHistory((h) => h.slice(0, -1));
    setIndex(last.index);
  };

  const openArticle = (card: FeedCard) => {
    setArticle(card);
    // Reading the whole article: +0.5 for the topic, once per card.
    if (!opened.current.has(card.id)) {
      opened.current.add(card.id);
      addTopicScore(card.topic, SCORE.details);
    }
  };

  const advance = useCallback(() => setIndex((i) => i + 1), []);

  const stack: StackItem[] = items.slice(index, index + 3).map((item) => {
    if (item.kind === "card")
      return {
        key: item.card.id,
        node: <NewsCard card={item.card} />,
        onTap: () => openArticle(item.card),
        label: `${item.card.title}. ${t("Touche pour lire l'article, glisse à droite si tu aimes, à gauche sinon.", "Tap to read the article, swipe right if you like it, left if not.")}`,
      };
    if (item.kind === "challenge")
      return {
        key: `challenge-${item.n}`,
        locked: true,
        node: <InlineChallenge readCards={item.readCards} used={usedQuestions.current} onContinue={advance} />,
      };
    return { key: "end", locked: true, node: <EndCard /> };
  });

  const cardNumber = items.slice(0, index + 1).filter((x) => x.kind === "card").length || 1;
  const total = pool.length;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-3" style={{ height: "calc(100dvh - var(--nav-space))", paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}>
      {/* Header: progress + why these cards (the avatar floats on the right of this line) */}
      <div className="mb-3 flex h-11 shrink-0 items-center gap-3 pr-14">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${(Math.min(cardNumber, total) / total) * 100}%` }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-muted" aria-live="polite">
          {Math.min(cardNumber, total)}/{total}
        </span>
        <button onClick={() => setShowInfo(true)} className="grid h-9 w-9 place-items-center rounded-full bg-fill text-muted" aria-label={t("Pourquoi ces actus ?", "Why these news?")}>
          <IconInfo width={18} height={18} />
        </button>
      </div>

      <SwipeStack
        items={stack}
        onSwipe={swipe}
        onUndo={undo}
        canUndo={canUndo}
        paused={!!article || showInfo}
        lockedActions={
          top?.kind === "challenge" ? (
            <button onClick={advance} className="min-h-11 rounded-full px-4 text-[15px] font-semibold text-muted underline underline-offset-4">
              {t("Passer le défi →", "Skip the challenge →")}
            </button>
          ) : null
        }
      />

      {coach && top?.kind === "card" && (
        <div className="glass pointer-events-auto fixed inset-x-6 bottom-[calc(var(--nav-space)+5.5rem)] z-20 mx-auto max-w-sm rounded-2xl p-4 text-center" role="note">
          <p className="text-[15px] font-semibold">
            <span className="text-bad">← {t("Pas pour moi", "Not for me")}</span> · <span className="text-ok">{t("J'aime", "I like it")} →</span>
          </p>
          <p className="mt-1 text-sm text-muted">{t("Glisse la carte, ou utilise les boutons. Touche-la pour lire l'article en entier.", "Swipe the card, or use the buttons. Tap it to read the whole article.")}</p>
          <button
            onClick={() => {
              setCoach(false);
              writeJSON("p27.feedCoachSeen", true);
            }}
            className="mt-2 min-h-10 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink"
          >
            {t("Compris", "Got it")}
          </button>
        </div>
      )}

      {article && <ArticleSheet card={article} onClose={() => setArticle(null)} />}
      {showInfo && <InfoSheet onClose={() => setShowInfo(false)} scores={scores} learned={learned} />}
    </div>
  );
}

/** "Fin de l'édition": the last card of the stack. */
function EndCard() {
  const t = useT();
  return (
    <article className="tile flex h-full flex-col overflow-y-auto rounded-[22px] pt-4">
      <Masthead />
      <div className="flex flex-1 flex-col justify-center gap-4 px-6 pb-6 text-center">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-rouge">{t("Fin de l'édition", "End of the edition")}</p>
        <h2 className="font-serif text-[32px] font-semibold leading-[1.1]">{t("Tu es à jour sur la campagne !", "You're up to date on the campaign!")}</h2>
        <p className="text-muted">{t("De nouvelles actus arrivent régulièrement jusqu'au 18 avril.", "New stories keep coming until 18 April.")}</p>
        <ButtonLink href="/quiz">{t("Tester ce que j'ai retenu", "Test what I remember")}</ButtonLink>
        <Link href="/defis" className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-fill font-semibold text-accent">
          {t("Voir les défis", "See the challenges")}
        </Link>
      </div>
    </article>
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
