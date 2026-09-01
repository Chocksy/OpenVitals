"use client";

/**
 * The glossary tooltip, kept inside the window.
 *
 * `<Term>` is a server component on purpose — the whole 55-term glossary stays
 * out of the browser bundle — so there is nowhere per-term to put a hook. One
 * listener on the document is the whole client half: on the first hover or
 * focus it measures the word and the bubble, asks `placeTip` where the bubble
 * goes, and writes two attributes. `app/globals.css` does the moving.
 *
 * It writes attributes onto a node React already placed and never restructures
 * anything, so the phase 25a lock (`no-dom-mutation.test.ts`) stays green.
 */
import { useEffect } from "react";
import { placeTip } from "@/lib/tooltip-edge";

export function TermEdges() {
  useEffect(() => {
    const place = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const term = target.closest(".ov-term");
      if (!(term instanceof HTMLElement)) return;
      const tip = term.querySelector(".ov-term-tip");
      if (!(tip instanceof HTMLElement)) return;

      const box = term.getBoundingClientRect();
      // offsetWidth is the laid-out size: the hidden bubble is scaled to 0.96,
      // and a measured rect would be 4 % short of where it lands.
      const { edge, below } = placeTip(
        { center: box.left + box.width / 2, top: box.top, bottom: box.bottom },
        { width: tip.offsetWidth, height: tip.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      );

      if (edge) term.setAttribute("data-edge", edge);
      else term.removeAttribute("data-edge");
      if (below) term.setAttribute("data-below", "");
      else term.removeAttribute("data-below");
    };

    document.addEventListener("pointerover", place, true);
    document.addEventListener("focusin", place, true);
    return () => {
      document.removeEventListener("pointerover", place, true);
      document.removeEventListener("focusin", place, true);
    };
  }, []);

  return null;
}
