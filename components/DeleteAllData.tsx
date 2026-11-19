"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { IconClose } from "@/components/Icons";
import { deleteMyData } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { getSessionId } from "@/lib/session";
import { readJSON } from "@/lib/storage";

/** Removes every polis key from this browser (same scope as the old "Effacer mes données sur ce téléphone"). */
function wipeLocal() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("p27."))
      .forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch {}
}

/**
 * "Supprimer toutes mes informations": erases the player's rows on the server first, then this phone's data.
 * If the server can't be reached, nothing is erased on the phone, so the player can try again.
 */
export function DeleteAllData() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && state !== "working" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state]);

  const confirm = async () => {
    setState("working");
    const matches = readJSON<Record<string, { pid?: string }>>("p27.matches", {});
    const pids = Object.values(matches)
      .map((m) => m?.pid)
      .filter((p): p is string => typeof p === "string");
    const res = await deleteMyData(getSessionId(), pids);
    if (!res) {
      setState("failed");
      return;
    }
    wipeLocal();
    window.location.href = "/";
  };

  const close = () => {
    if (state === "working") return;
    setOpen(false);
    setState("idle");
  };

  return (
    <>
      <Button variant="ghost" className="!text-bad" onClick={() => setOpen(true)}>
        {t("Supprimer toutes mes informations", "Delete all my information")}
      </Button>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={close}>
          <div
            className="pop w-full max-w-md rounded-t-[2rem] bg-card p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="delete-title" className="font-display text-2xl font-bold">
                {t("Supprimer toutes mes informations ?", "Delete all my information?")}
              </h2>
              <button onClick={close} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fill" aria-label={t("Fermer", "Close")}>
                <IconClose width={18} height={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-3 text-[15px]">
              <div>
                <p className="font-semibold">📱 {t("Sur ce téléphone", "On this phone")}</p>
                <p className="text-muted">{t("Tes voix, ta ville, tes trophées et ton profil.", "Your voix, your city, your badges and your profile.")}</p>
              </div>
              <div>
                <p className="font-semibold">🗄️ {t("Sur notre serveur", "On our server")}</p>
                <p className="text-muted">
                  {t(
                    "Ton compte, ton email, ton historique de jeu (défis, scores, pronostics, matchs en équipe) et tes statistiques d'usage.",
                    "Your account, your email, your game history (challenges, scores, predictions, team matches) and your usage statistics.",
                  )}
                </p>
              </div>
              <p className="text-sm text-muted">{t("C'est définitif : on ne pourra rien récupérer.", "This is permanent: nothing can be recovered.")}</p>
              {state === "failed" && (
                <p role="alert" className="rounded-2xl bg-bad-soft p-3 font-semibold">
                  {t(
                    "Notre serveur ne répond pas. Rien n'a été effacé : vérifie ta connexion et réessaie.",
                    "Our server isn't responding. Nothing was deleted: check your connection and try again.",
                  )}
                </p>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={close} disabled={state === "working"}>
                {t("Annuler", "Cancel")}
              </Button>
              <Button onClick={confirm} disabled={state === "working"} className="!bg-bad">
                {state === "working" ? t("Suppression…", "Deleting…") : state === "failed" ? t("Réessayer", "Try again") : t("Tout supprimer", "Delete all")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
