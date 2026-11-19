"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { InstagramGlyph } from "@/components/CommitPrompts";
import { AVATARS, AvatarFace } from "@/components/Avatar";
import { Settings } from "@/components/Settings";
import { Trophies } from "@/components/Trophies";
import { ButtonLink, Card, Page } from "@/components/ui";
import { useContent, useT } from "@/lib/i18n";
import { levelIndexFor } from "@/lib/levels";
import { isInternational, saveProfile, useProfile, type Profile } from "@/lib/profile";
import { track } from "@/lib/track";
import { useVoix } from "@/lib/voix";

export function ProfileClient() {
  const p = useProfile();
  const c = useContent();
  const t = useT();
  const { total } = useVoix();
  const [mounted, setMounted] = useState(false);
  const ob = c.onboarding;

  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="flex-1" />;

  if (!p.done) {
    return (
      <Page>
        <Card className="flex flex-col gap-3">
          <h1 className="font-display text-2xl font-bold">{t("Ton profil n'est pas encore fait", "Your profile isn't set up yet")}</h1>
          <p className="text-muted">{t("Une minute pour adapter les actus à ton niveau et à tes sujets.", "One minute to adapt the news to your level and topics.")}</p>
        </Card>
        <ButtonLink href="/bienvenue">{t("Faire mon profil", "Set up my profile")}</ButtonLink>
        <Trophies />
        <Settings />
      </Page>
    );
  }

  const update = (patch: Partial<Profile>) => saveProfile({ ...p, ...patch });
  const toggleTopic = (id: string) => update({ interests: p.interests.includes(id) ? p.interests.filter((x) => x !== id) : [...p.interests, id] });

  return (
    <Page>
      <div className="flex items-center gap-4 pr-12">
        <AvatarFace profile={p} className="h-16 w-16 shrink-0 text-3xl" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-extrabold">{p.firstName || t("Mon profil", "My profile")}</h1>
          <p className="text-muted">
            {ob.levels[p.level].label} · {c.levels[levelIndexFor(total)].name} · {total} voix
          </p>
          {p.email && <p className="truncate text-sm text-muted">{p.email}</p>}
        </div>
      </div>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t("Mon avatar", "My avatar")}</h2>
        <p className="-mt-2 text-sm text-muted">{t("Un bâtiment de ta ville, ou ton initiale. Pas de photo : rien à stocker.", "A building from your city, or your initial. No photo: nothing to store.")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Choisir mon avatar", "Choose my avatar")}>
          {[{ id: null, emoji: null }, ...AVATARS].map((a) => {
            const on = p.avatar === a.id;
            return (
              <button
                key={a.id ?? "initial"}
                onClick={() => update({ avatar: a.id })}
                aria-pressed={on}
                aria-label={a.id ? (c.cityBuildings.find((b) => b.id === a.id)?.name ?? a.id) : t("Mon initiale", "My initial")}
                className={`grid h-12 w-12 place-items-center rounded-full border-2 transition active:scale-95 ${on ? "border-accent" : "border-transparent"}`}
              >
                <AvatarFace profile={{ avatar: a.id, firstName: p.firstName }} className="h-10 w-10 text-xl" />
              </button>
            );
          })}
        </div>
      </Card>

      <Trophies />

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t("Mes sujets", "My topics")}</h2>
        <p className="-mt-2 text-sm text-muted">{t("Touche un sujet pour l'ajouter ou le retirer de ton fil.", "Tap a topic to add it to or remove it from your feed.")}</p>
        <div className="flex flex-wrap gap-2">
          {c.topics.map((tp) => {
            const on = p.interests.includes(tp.id);
            return (
              <button key={tp.id} onClick={() => toggleTopic(tp.id)} aria-pressed={on} className={`min-h-10 rounded-full border-2 px-3 text-sm font-semibold ${on ? "border-accent bg-accent-soft" : "border-transparent bg-fill"}`}>
                {tp.emoji} {tp.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">{t("Ma situation", "My situation")}</h2>
        <p className="text-sm font-semibold">{ob.voter.question}</p>
        <div className="flex flex-wrap gap-2">
          {ob.voter.options.map((o) => (
            <button
              key={o.id}
              onClick={() => update({ voter: o.id as Profile["voter"] })}
              aria-pressed={p.voter === o.id}
              className={`min-h-10 rounded-full border-2 px-3 text-sm font-semibold ${p.voter === o.id ? "border-accent bg-accent-soft" : "border-transparent bg-fill"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {isInternational(p) && <p className="text-sm text-muted">🌍 {t("Mode international activé dans ton fil.", "International mode is on in your feed.")}</p>}
        <Link href="/voter" className="font-semibold text-accent underline underline-offset-4">
          🗳️ {t("Voter : mode d'emploi (les démarches selon ta situation)", "Voting: how it works (the steps for your situation)")} →
        </Link>
        {p.voter === "fr" && (
          <>
            <p>
              {t("Inscription sur les listes :", "On the electoral roll:")} <strong>{ob.registered.options.find((o) => o.id === p.registered)?.label ?? "–"}</strong>
            </p>
            {p.registered !== "oui" && (
              <a href={ob.registered.checkUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
                {t("Vérifier mon inscription avant le 12 mars 2027 ↗", "Check my registration before 12 March 2027 ↗")}
              </a>
            )}
          </>
        )}
      </Card>

      <ButtonLink href="/bienvenue" variant="secondary">
        {t("Refaire mon profil et le test de niveau", "Redo my profile and the level test")}
      </ButtonLink>

      <Card className="flex flex-col gap-3">
        <a
          href={c.site.instagram}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("instagram_click", { from: "profile" })}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(45deg,#f9a825,#e1306c,#833ab4)] px-4 font-semibold text-white"
        >
          <InstagramGlyph size={20} /> {t("Suis polis sur Instagram", "Follow polis on Instagram")}
        </a>
      </Card>

      <Settings />
    </Page>
  );
}
