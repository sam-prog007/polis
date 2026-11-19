"use client";

import { useSyncExternalStore } from "react";
import { readJSON, writeJSON } from "./storage";
import { THEME_KEY as KEY } from "./theme-script";

/** Apparence setting (decision D6). "auto" follows the phone and is the default. */
export type Theme = "auto" | "light" | "dark";

const listeners = new Set<() => void>();

function read(): Theme {
  const t = readJSON<Theme>(KEY, "auto");
  return t === "light" || t === "dark" ? t : "auto";
}

/** Saves the choice and applies it at once (no reload). */
export function setTheme(theme: Theme) {
  writeJSON(KEY, theme);
  try {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "auto",
  );
}
