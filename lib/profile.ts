"use client";

import onboarding from "@/content/onboarding.json";
import { readJSON, writeJSON } from "./storage";
import { createPersistedStore } from "./store";

export type LevelId = "debutant" | "intermediaire" | "avance";

export type Profile = {
  done: boolean;
  firstName: string;
  /** Account email, given at onboarding (no password). */
  email: string;
  followsNews: "jamais" | "parfois" | "souvent" | null;
  voted: "oui" | "non" | null;
  /** Can vote at the French presidential election: "fr" = yes; "eu" / "non-eu" / "nsp" = international mode. */
  voter: "fr" | "eu" | "non-eu" | "nsp" | null;
  registered: "oui" | "non" | "nsp" | null;
  knowledge: number; // 0-3 right answers to the level test
  level: LevelId;
  interests: string[]; // topic ids
  /** Avatar: a city building id (content/city.json), or null for the first letter of the name. No photos. */
  avatar: string | null;
};

export const EMPTY_PROFILE: Profile = {
  done: false,
  firstName: "",
  email: "",
  followsNews: null,
  voted: null,
  voter: null,
  registered: null,
  knowledge: 0,
  level: "debutant",
  interests: [],
  avatar: null,
};

/**
 * The left–right slider was removed (decision D2): the feed learns from topics only. Phones that still hold
 * a stored position get it deleted the first time this module loads, before anything reads the profile.
 */
function dropStoredPosition() {
  if (typeof window === "undefined") return;
  const saved = readJSON<Record<string, unknown> | null>("p27.profile", null);
  if (saved && "position" in saved) {
    delete saved.position;
    writeJSON("p27.profile", saved);
  }
}
dropStoredPosition();

const store = createPersistedStore<Profile>("p27.profile", EMPTY_PROFILE);

export const getProfile = store.get;

export function saveProfile(p: Profile) {
  writeJSON("p27.firstName", p.firstName.trim().slice(0, 20));
  store.set(p);
}

export function resetProfile() {
  saveProfile({ ...EMPTY_PROFILE });
}

export function computeLevel(knowledge: number, followsNews: Profile["followsNews"]): LevelId {
  const follow = onboarding.followsNews.options.find((o) => o.id === followsNews)?.points ?? 0;
  const points = knowledge + follow;
  if (points >= 4) return "avance";
  if (points >= 2) return "intermediaire";
  return "debutant";
}

/** International mode: the player can't (or isn't sure they can) vote at the presidential election. */
export function isInternational(p: Profile) {
  return p.voter === "eu" || p.voter === "non-eu" || p.voter === "nsp";
}

export const useProfile = store.use;
