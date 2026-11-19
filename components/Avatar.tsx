"use client";

import { cityBuildings } from "@/lib/content";
import type { Profile } from "@/lib/profile";
import { IconUser } from "./Icons";

/** The drawn avatars: the city's buildings. No photo upload (a photo would be personal data to store and protect). */
export const AVATARS = cityBuildings.map((b) => ({ id: b.id, emoji: b.emoji }));

/** The player's face: their chosen building, the first letter of their name, or a neutral person icon. */
export function AvatarFace({ profile, className = "" }: { profile: Pick<Profile, "avatar" | "firstName">; className?: string }) {
  const chosen = AVATARS.find((a) => a.id === profile.avatar);
  return (
    <span className={`grid place-items-center rounded-full bg-accent-soft font-display font-extrabold text-hero ${className}`} aria-hidden>
      {chosen ? chosen.emoji : profile.firstName ? profile.firstName.slice(0, 1).toUpperCase() : <IconUser width="60%" height="60%" strokeWidth={2} />}
    </span>
  );
}
