"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DeleteAllData } from "@/components/DeleteAllData";
import { Card } from "@/components/ui";
import { setLang, useLang, useT } from "@/lib/i18n";
import { setTheme, useTheme, type Theme } from "@/lib/theme";

/** iOS-style segmented control. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="grid gap-0.5 rounded-[11px] bg-fill p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`min-h-9 rounded-[9px] px-1 text-[13px] font-semibold transition ${value === o.id ? "bg-card text-ink shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-white/20" : "text-ink/70"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Profile › Réglages: language, appearance (decision D6), personal data and the delete button. */
export function Settings() {
  const t = useT();
  const lang = useLang();
  const theme = useTheme();
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-bold">{t("Réglages", "Settings")}</h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("Langue", "Language")}</p>
        <Segmented
          label={t("Langue", "Language")}
          value={lang}
          onChange={setLang}
          options={[
            { id: "fr", label: "Français" },
            { id: "en", label: "English" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{t("Apparence", "Appearance")}</p>
        <Segmented<Theme>
          label={t("Apparence", "Appearance")}
          value={theme}
          onChange={setTheme}
          options={[
            { id: "auto", label: t("Automatique", "Automatic") },
            { id: "light", label: t("Clair", "Light") },
            { id: "dark", label: t("Sombre", "Dark") },
          ]}
        />
        {theme === "auto" && <p className="text-sm text-muted">{t("Suit le réglage de ton téléphone.", "Follows your phone's setting.")}</p>}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-3">
        <Link href="/donnees-personnelles" className="inline-flex min-h-11 items-center font-semibold text-accent">
          {t("Données personnelles", "Personal data")} →
        </Link>
        <DeleteAllData />
      </div>
    </Card>
  );
}
