"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { haptic } from "@/lib/feedback";
import { useT } from "@/lib/i18n";

export type SwipeDir = "left" | "right";

export type StackItem = {
  key: string;
  node: ReactNode;
  /** Can't be swiped (the quick challenge until it is answered or skipped, the end card). */
  locked?: boolean;
  /** Tap (or Enter) on the top card. */
  onTap?: () => void;
  /** Accessible name of the top card. */
  label?: string;
};

type Props = {
  /** The top card first; up to 3 are drawn. */
  items: StackItem[];
  onSwipe: (dir: SwipeDir) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Shown under the stack instead of ✕ ↺ ♥ when the top card is locked. */
  lockedActions?: ReactNode;
  /** Keyboard arrows are ignored while something covers the stack (a sheet). */
  paused?: boolean;
};

const FLY_MS = 280;
/** Past 30 % of the card width, or a fast flick, the card flies off. */
const THRESHOLD = 0.3;
const FLICK_PX_PER_MS = 0.6;

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * A stack of 3 cards, no animation library: pointer events and CSS transforms.
 * The top card follows the finger and tilts; a "J'aime" (right) or "Pas pour moi" (left) stamp fades in.
 * Buttons ✕ ↺ ♥ and the ← → keys do the same for one-handed and accessible use.
 * Under prefers-reduced-motion the card fades instead of flying.
 */
export function SwipeStack({ items, onSwipe, onUndo, canUndo, lockedActions, paused = false }: Props) {
  const t = useT();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<SwipeDir | null>(null);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  const top = items[0];
  const locked = !top || !!top.locked;

  const fly = useCallback(
    (dir: SwipeDir) => {
      if (locked || flying) return;
      haptic("tap");
      setFlying(dir);
      setTimeout(() => {
        onSwipe(dir);
        setFlying(null);
        setDx(0);
      }, reducedMotion() ? 120 : FLY_MS);
    },
    [locked, flying, onSwipe],
  );

  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight") fly("right");
      if (e.key === "ArrowLeft") fly("left");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fly, paused]);

  const down = (e: PointerEvent) => {
    if (locked || flying || e.button > 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    moved.current = false;
    setDragging(true);
  };
  const move = (e: PointerEvent) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const ddx = e.clientX - s.x;
    if (!moved.current && Math.abs(ddx) > 6) {
      moved.current = true;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    if (moved.current) setDx(ddx);
  };
  const up = (e: PointerEvent) => {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setDragging(false);
    const width = card.current?.offsetWidth ?? 320;
    const ddx = e.clientX - s.x;
    const speed = Math.abs(ddx) / Math.max(1, performance.now() - s.t);
    if (!moved.current) {
      setDx(0);
      top?.onTap?.();
      return;
    }
    if (Math.abs(ddx) > width * THRESHOLD || (Math.abs(ddx) > 40 && speed > FLICK_PX_PER_MS)) fly(ddx > 0 ? "right" : "left");
    else setDx(0);
  };
  const cancel = () => {
    start.current = null;
    setDragging(false);
    setDx(0);
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && top?.onTap && e.target === e.currentTarget) {
      e.preventDefault();
      top.onTap();
    }
  };

  const width = card.current?.offsetWidth ?? 320;
  const offset = flying ? (flying === "right" ? 1 : -1) * width * 1.4 : dx;
  const fade = flying && reducedMotion();
  const like = Math.min(1, Math.max(0, offset / 90));
  const nope = Math.min(1, Math.max(0, -offset / 90));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        {items
          .slice(0, 3)
          .map((item, i) => {
            const isTop = i === 0;
            // Cards behind: a little smaller and lower; they come forward as the top card leaves.
            const lift = isTop ? 0 : Math.min(1, Math.abs(offset) / (width * THRESHOLD));
            const depth = Math.max(0, i - lift);
            const style = isTop
              ? {
                  transform: fade ? undefined : `translateX(${offset}px) rotate(${offset / 22}deg)`,
                  opacity: fade ? 0 : 1,
                  transition: dragging ? "none" : `transform ${FLY_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${FLY_MS}ms ease-out`,
                }
              : { transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.045})`, transition: dragging ? "none" : `transform ${FLY_MS}ms ease-out` };
            return (
              <div
                key={item.key}
                ref={isTop ? card : undefined}
                className={`absolute inset-0 ${isTop ? (item.locked ? "overflow-y-auto overscroll-contain" : "cursor-grab touch-pan-y select-none active:cursor-grabbing") : "pointer-events-none"}`}
                style={{ ...style, zIndex: 10 - i }}
                aria-hidden={!isTop}
                role={isTop && item.onTap && !item.locked ? "button" : undefined}
                tabIndex={isTop && item.onTap && !item.locked ? 0 : undefined}
                aria-label={isTop ? item.label : undefined}
                onKeyDown={isTop ? onKeyDown : undefined}
                onPointerDown={isTop ? down : undefined}
                onPointerMove={isTop ? move : undefined}
                onPointerUp={isTop ? up : undefined}
                onPointerCancel={isTop ? cancel : undefined}
              >
                {item.node}
                {isTop && !item.locked && (
                  <>
                    <span
                      className="pointer-events-none absolute left-4 top-20 -rotate-12 rounded-xl border-[3px] border-ok bg-card/80 px-2.5 py-0.5 font-serif text-xl font-bold uppercase text-ok"
                      style={{ opacity: like }}
                      aria-hidden
                    >
                      {t("J'aime", "Like")}
                    </span>
                    <span
                      className="pointer-events-none absolute right-4 top-20 rotate-12 rounded-xl border-[3px] border-bad bg-card/80 px-2.5 py-0.5 font-serif text-xl font-bold uppercase text-bad"
                      style={{ opacity: nope }}
                      aria-hidden
                    >
                      {t("Pas pour moi", "Not for me")}
                    </span>
                  </>
                )}
              </div>
            );
          })
          .reverse()}
      </div>

      {locked && lockedActions ? (
        <div className="flex min-h-14 items-center justify-center">{lockedActions}</div>
      ) : (
        <div className="flex items-center justify-center gap-5" role="group" aria-label={t("Réagir à la carte", "React to the card")}>
          <button
            onClick={() => fly("left")}
            disabled={locked}
            className="grid h-14 w-14 place-items-center rounded-full border-2 border-bad/40 bg-card text-2xl text-bad shadow-sm transition active:scale-90 disabled:opacity-30"
            aria-label={t("Pas pour moi (flèche gauche)", "Not for me (left arrow)")}
          >
            ✕
          </button>
          <button
            onClick={onUndo}
            disabled={!canUndo || !!flying}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-card text-lg text-muted shadow-sm transition active:scale-90 disabled:opacity-30"
            aria-label={t("Annuler le dernier choix", "Undo the last swipe")}
          >
            ↺
          </button>
          <button
            onClick={() => fly("right")}
            disabled={locked}
            className="grid h-14 w-14 place-items-center rounded-full border-2 border-ok/40 bg-card text-2xl text-ok shadow-sm transition active:scale-90 disabled:opacity-30"
            aria-label={t("J'aime (flèche droite)", "Like (right arrow)")}
          >
            ♥
          </button>
        </div>
      )}
    </div>
  );
}
