// Feed rule tests. Run with: npm test
// They check the two promises of the feed (docs/PRODUCT_NOTES.md): liked topics come up more often,
// and the camps stay balanced whatever the player likes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BLOCS, getContent, type Camp, type FeedCard } from "./content";
import { EMPTY_PROFILE } from "./profile";
import { SCORE, buildPool, effectiveScores, pickNext, topTopics, type TopicScores } from "./feed";
import { randomStream } from "./rng";

const TOPICS = ["election", "logement", "pouvoir-achat", "emploi", "etudes", "climat", "energie", "sante", "securite", "immigration", "europe", "budget", "institutions"];
const CAMPS: Camp[] = ["gauche", "centre", "droite", "extreme-droite", "neutre"];

/** A big synthetic pool: every topic × every camp, 30 cards each, so 300 swipes never run out. */
function syntheticPool(): FeedCard[] {
  const cards: FeedCard[] = [];
  for (const topic of TOPICS)
    for (const camp of CAMPS)
      for (let i = 0; i < 30; i++)
        cards.push({ id: `${topic}-${camp}-${i}`, kind: "actu", camp, topic, date: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}`, title: "", text: "", source: { label: "", url: "" } });
  return cards;
}

type Policy = (card: FeedCard) => "up" | "down";

/** Plays `swipes` cards: each one is swiped right or left by the policy, and the topic score learns from it. */
function simulate(pool: FeedCard[], policy: Policy, swipes = 300, seed = 1, interests: string[] = []) {
  const learned: TopicScores = {};
  const order: string[] = [];
  const rng = randomStream(seed);
  for (let i = 0; i < swipes; i++) {
    const card = pickNext(pool, order, { scores: effectiveScores(learned, interests), random: rng.next });
    if (!card) break;
    order.push(card.id);
    learned[card.topic] = (learned[card.topic] ?? 0) + SCORE[policy(card)];
  }
  return { cards: order.map((id) => pool.find((c) => c.id === id)!), learned };
}

const share = (n: number, total: number) => n / total;
const SEEDS = [1, 2, 3, 4, 5];

describe("feed rule", () => {
  it("always right on left-wing cards: each camp still gets 20–30 % of camp cards", () => {
    for (const seed of SEEDS) {
      const { cards } = simulate(syntheticPool(), (c) => (c.camp === "gauche" ? "up" : "down"), 300, seed);
      const campCards = cards.filter((c) => c.camp !== "neutre");
      for (const camp of BLOCS) {
        const s = share(campCards.filter((c) => c.camp === camp).length, campCards.length);
        assert.ok(s >= 0.2 && s <= 0.3, `seed ${seed}: ${camp} got ${(s * 100).toFixed(1)} % of camp cards`);
      }
    }
  });

  it("always right on energy: energy reaches ≥ 40 % of cards, and its camps stay within ±1 card", () => {
    for (const seed of SEEDS) {
      const { cards } = simulate(syntheticPool(), (c) => (c.topic === "energie" ? "up" : "down"), 300, seed);
      const energy = cards.filter((c) => c.topic === "energie");
      assert.ok(share(energy.length, cards.length) >= 0.4, `seed ${seed}: energy is only ${((energy.length / cards.length) * 100).toFixed(1)} %`);
      const perCamp = BLOCS.map((b) => energy.filter((c) => c.camp === b).length);
      assert.ok(Math.max(...perCamp) - Math.min(...perCamp) <= 1, `seed ${seed}: camps inside energy ${perCamp.join(" / ")}`);
    }
  });

  it("never more than 3 cards in a row on the same topic", () => {
    for (const seed of SEEDS) {
      const { cards } = simulate(syntheticPool(), (c) => (c.topic === "energie" ? "up" : "down"), 300, seed);
      for (let i = 3; i < cards.length; i++) {
        const four = cards.slice(i - 3, i + 1);
        assert.ok(!four.every((c) => c.topic === four[0].topic), `seed ${seed}: 4 × ${four[0].topic} at card ${i}`);
      }
    }
  });

  it("at least 1 card in 4 comes from outside the top 3 topics", () => {
    for (const seed of SEEDS) {
      const pool = syntheticPool();
      const learned: TopicScores = {};
      const order: string[] = [];
      const rng = randomStream(seed);
      const liked = new Set(["energie", "logement", "climat"]);
      for (let i = 0; i < 300; i++) {
        const scores = effectiveScores(learned, []);
        const card = pickNext(pool, order, { scores, random: rng.next })!;
        if (i >= 3) {
          const top3 = topTopics(scores, TOPICS);
          const window = [...order.slice(-3).map((id) => pool.find((c) => c.id === id)!), card];
          assert.ok(window.some((c) => !top3.includes(c.topic)), `seed ${seed}: 4 cards in a row from the top 3 at card ${i}`);
        }
        order.push(card.id);
        learned[card.topic] = (learned[card.topic] ?? 0) + (liked.has(card.topic) ? SCORE.up : SCORE.down);
      }
    }
  });

  it("never 2 cards in a row from the same camp, and a neutral card after at most 3 camp cards", () => {
    for (const seed of SEEDS) {
      const { cards } = simulate(syntheticPool(), (c) => (c.camp === "droite" ? "up" : "down"), 300, seed);
      let run = 0;
      cards.forEach((c, i) => {
        if (i > 0 && c.camp !== "neutre") assert.notEqual(c.camp, cards[i - 1].camp, `seed ${seed}: same camp twice at card ${i}`);
        run = c.camp === "neutre" ? 0 : run + 1;
        assert.ok(run <= 3, `seed ${seed}: ${run} camp cards in a row at card ${i}`);
      });
    }
  });

  it("swipes never change the camps: two opposite players get the same camp shares", () => {
    const left = simulate(syntheticPool(), (c) => (c.camp === "gauche" ? "up" : "down"), 300, 9).cards.filter((c) => c.camp !== "neutre");
    const right = simulate(syntheticPool(), (c) => (c.camp === "extreme-droite" ? "up" : "down"), 300, 9).cards.filter((c) => c.camp !== "neutre");
    for (const camp of BLOCS) {
      const a = left.filter((c) => c.camp === camp).length / left.length;
      const b = right.filter((c) => c.camp === camp).length / right.length;
      assert.ok(Math.abs(a - b) <= 0.03, `${camp}: ${(a * 100).toFixed(1)} % vs ${(b * 100).toFixed(1)} %`);
    }
  });

  it("topics picked at onboarding start ahead (+2)", () => {
    assert.equal(effectiveScores({}, ["energie"]).energie, 2);
    assert.equal(effectiveScores({ energie: -1 }, ["energie"]).energie, 1);
  });

  it("with the real content: the basics come first and every card is shown exactly once", () => {
    const c = getContent("fr");
    for (const level of ["debutant", "intermediaire", "avance"] as const) {
      const pool = buildPool({ ...EMPTY_PROFILE, done: true, level, voter: "fr", registered: "oui" }, c);
      const { cards } = simulate(pool, () => "up", pool.length + 5, 3);
      assert.equal(cards.length, pool.length);
      assert.equal(new Set(cards.map((x) => x.id)).size, pool.length);
      if (pool.some((x) => x.kind === "bases")) assert.equal(cards[0].kind, "bases");
    }
  });
});
