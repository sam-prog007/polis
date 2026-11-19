"use client";

import { useEffect } from "react";

/**
 * Extra "liquid" refraction for the glass chrome. Only Chromium applies an SVG filter inside backdrop-filter,
 * so the class that turns it on (glass-refract, see globals.css) is only added there; Safari and Firefox keep
 * the plain blur. Skipped when the phone asks for less transparency or less motion.
 */
export function GlassFilter() {
  useEffect(() => {
    try {
      const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands ?? [];
      const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand));
      const calm = window.matchMedia("(prefers-reduced-transparency: reduce), (prefers-reduced-motion: reduce)").matches;
      if (chromium && !calm) document.documentElement.classList.add("glass-refract");
    } catch {
      // no userAgentData: plain blur
    }
  }, []);

  return (
    <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
      <filter id="polis-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
        <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
        <feDisplacementMap in="SourceGraphic" in2="soft" scale="10" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
