"use client";

import type { TopicScores } from "./feed";
import { createPersistedStore } from "./store";

/**
 * What the feed has learned about the player's interests, per TOPIC only (decision D2): swipe right +1,
 * swipe left −1, opening a card's details +0.5. Kept on the phone (`p27.topicScores`), never sent anywhere,
 * and nothing about camps is ever stored. "Remettre à zéro" in the feed's info sheet clears it.
 */
const store = createPersistedStore<{ scores: TopicScores }>("p27.topicScores", { scores: {} });

export function addTopicScore(topic: string, delta: number) {
  if (!delta) return;
  const scores = store.get().scores;
  store.set({ scores: { ...scores, [topic]: Math.round(((scores[topic] ?? 0) + delta) * 10) / 10 } });
}

export function resetTopicScores() {
  store.set({ scores: {} });
}

export function useTopicScores(): TopicScores {
  return store.use().scores;
}
