import { BLOCS, type BlocCamp, type Content, type FeedCard } from "./content";
import { isInternational, type Profile } from "./profile";

/** Cards available for this profile: some basics depending on the level, then all the news. */
export function buildPool(p: Profile, c: Content): FeedCard[] {
  const intl = isInternational(p);
  const canVote = p.voter === "fr" || p.voter === null;
  const visible = c.baseCards.filter((b) => !b.audience || (b.audience === "intl" ? intl : canVote));
  const general = visible.filter((b) => !b.audience).map((b) => b.id);
  let baseIds: string[] = p.level === "debutant" ? general : p.level === "intermediaire" ? general.filter((id) => id === "dates") : [];
  // International mode: "who can vote" and why it still matters come first.
  if (intl) baseIds = [...visible.filter((b) => b.audience === "intl").map((b) => b.id), ...baseIds];
  // Can vote but not (sure to be) registered: the registration card comes first.
  else if (canVote && p.registered !== "oui") baseIds = ["inscription", ...baseIds.filter((id) => id !== "inscription")];
  const bases = baseIds.map((id) => visible.find((b) => b.id === id)).filter((b): b is FeedCard => !!b);
  return [...bases, ...c.newsCards];
}

/** Learned interest per topic id. Kept on the phone only (lib/topicScores.ts); never about a camp. */
export type TopicScores = Record<string, number>;

/** Swipe right / left and opening a card's details move the card's topic score by these amounts. */
export const SCORE = { up: 1, down: -1, details: 0.5, interest: 2 } as const;

/** Topics chosen at onboarding start at +2; the swipes add to that. */
export function effectiveScores(learned: TopicScores, interests: string[]): TopicScores {
  const out: TopicScores = { ...learned };
  for (const id of interests) out[id] = (out[id] ?? 0) + SCORE.interest;
  return out;
}

/** How likely a topic is to come up next: 1 at score 0, more with likes, never 0 (every topic can still appear). */
export function topicWeight(score: number): number {
  return Math.min(10, Math.max(0.2, 1 + score / 2));
}

/** The best-liked topics, highest score first (ties keep the given order). */
export function topTopics(scores: TopicScores, among: string[], n = 3): string[] {
  return [...among].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)).slice(0, n);
}

export type RuleContext = {
  /** Effective topic scores (effectiveScores). */
  scores: TopicScores;
  /** Random number in [0, 1). Seeded in the app, so the same phone gets the same order. */
  random: () => number;
};

const isNeutral = (c: FeedCard) => c.kind === "bases" || c.camp === "neutre";
const newestFirst = (a: FeedCard, b: FeedCard) => (b.date ?? "").localeCompare(a.date ?? "");

function weightedPick<T>(items: T[], weight: (x: T) => number, random: () => number): T {
  const total = items.reduce((s, x) => s + weight(x), 0);
  let r = random() * total;
  for (const x of items) {
    r -= weight(x);
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

/**
 * Next card of the feed. Preferences are learned per TOPIC, never per camp (decision D2):
 *
 * 1. Topic: picked at random, weighted by its score, so liked topics come up more often. Guard rails:
 *    never more than 3 cards in a row on the same topic, and at least 1 card in 4 from outside the top 3 topics.
 * 2. Neutral or camp: a neutral card (the basics first) after every 2 or 3 camp cards, never 2 neutrals
 *    in a row while camp cards remain.
 * 3. Camp, inside that topic: the camp shown least on that topic so far; ties go to the camp shown least
 *    overall. Never the same camp twice in a row when there is a choice.
 * 4. If the topic has no card left from that camp, that camp's card comes from the best-liked other topic,
 *    so the camps stay balanced over the session whatever the player likes.
 *
 * Inside a topic and camp: the most recent card first. Beginners start with the basics.
 */
export function pickNext(pool: FeedCard[], order: string[], ctx: RuleContext): FeedCard | null {
  const byId = new Map(pool.map((c) => [c.id, c]));
  const shown = order.map((id) => byId.get(id)).filter((c): c is FeedCard => !!c);
  const done = new Set(order);
  const remaining = pool.filter((c) => !done.has(c.id));
  if (!remaining.length) return null;

  const bases = remaining.filter((c) => c.kind === "bases");
  if (!shown.length && bases.length) return bases[0];

  const weight = (t: string) => topicWeight(ctx.scores[t] ?? 0);

  // 1. Topic
  const topics = [...new Set(remaining.map((c) => c.topic))];
  const top3 = topTopics(ctx.scores, topics);
  const last3 = shown.slice(-3);
  let allowed = topics;
  if (last3.length === 3 && last3.every((c) => c.topic === last3[0].topic)) allowed = allowed.filter((t) => t !== last3[0].topic);
  if (last3.length === 3 && last3.every((c) => top3.includes(c.topic))) {
    const outside = allowed.filter((t) => !top3.includes(t));
    if (outside.length) allowed = outside;
  }
  if (!allowed.length) allowed = topics;
  const topic = weightedPick(allowed, weight, ctx.random);

  // 2. Neutral or camp
  const neutrals = remaining.filter(isNeutral);
  const campCards = remaining.filter((c) => !isNeutral(c));
  let run = 0;
  for (let i = shown.length - 1; i >= 0 && !isNeutral(shown[i]); i--) run++;
  const lastWasNeutral = shown.length > 0 && isNeutral(shown[shown.length - 1]);
  const neutralSlot =
    !campCards.length || (neutrals.length > 0 && !lastWasNeutral && (run >= 3 || (run >= 2 && neutrals.some((c) => c.topic === topic))));

  if (neutralSlot) {
    if (bases.length) return bases[0];
    const here = neutrals.filter((c) => c.topic === topic).sort(newestFirst);
    if (here.length) return here[0];
    return [...neutrals].sort((a, b) => weight(b.topic) - weight(a.topic) || newestFirst(a, b))[0];
  }

  // 3. Camp inside the topic
  const shownCamp = shown.filter((c) => !isNeutral(c));
  const prev = shown[shown.length - 1];
  let camps = BLOCS.filter((b) => campCards.some((c) => c.camp === b));
  const notPrev = camps.filter((b) => !prev || isNeutral(prev) || b !== prev.camp);
  if (notPrev.length) camps = notPrev;
  const onTopic = (b: BlocCamp) => shownCamp.filter((c) => c.topic === topic && c.camp === b).length;
  const overall = (b: BlocCamp) => shownCamp.filter((c) => c.camp === b).length;
  const camp = [...camps].sort((a, b) => onTopic(a) - onTopic(b) || overall(a) - overall(b) || BLOCS.indexOf(a) - BLOCS.indexOf(b))[0];

  const inTopic = campCards.filter((c) => c.camp === camp && c.topic === topic).sort(newestFirst);
  if (inTopic.length) return inTopic[0];
  // 4. That camp, from the best-liked other topic
  return campCards.filter((c) => c.camp === camp).sort((a, b) => weight(b.topic) - weight(a.topic) || newestFirst(a, b))[0];
}

const MONTHS = {
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};
export function formatDate(iso: string | undefined, lang: "fr" | "en" = "fr"): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.round((Date.now() - d.getTime()) / 86_400_000);
  const label = lang === "en" ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}` : `${d.getDate()} ${MONTHS.fr[d.getMonth()]}`;
  if (days <= 0) return lang === "en" ? "Today" : "Aujourd'hui";
  if (days === 1) return lang === "en" ? "Yesterday" : "Hier";
  if (days < 7) return lang === "en" ? `${days} days ago · ${label}` : `Il y a ${days} jours · ${label}`;
  return label;
}

export function daysUntilFirstRound(): number {
  const target = new Date("2027-04-18T08:00:00+02:00").getTime();
  return Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
}
