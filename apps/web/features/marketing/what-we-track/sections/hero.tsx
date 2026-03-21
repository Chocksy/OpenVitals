import Link from "next/link";
import { TOTAL_COUNT } from "../data";

export function Hero() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-20 md:pt-28 pb-14 md:pb-20">
      <div className="max-w-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-400 font-mono mb-4">
          Biomarker Library
        </p>
        <h1 className="text-[clamp(2rem,4.5vw,2.8rem)] leading-[1.1] tracking-[-0.03em] text-neutral-900 font-display">
          {TOTAL_COUNT}+ biomarkers{" "}
          <br className="hidden sm:block" />
          tracked across{" "}
          <em className="text-neutral-900" style={{ fontStyle: "italic" }}>
            every system
          </em>
        </h1>
        <p className="mt-5 text-[15px] leading-[1.7] text-neutral-400 max-w-lg font-body">
          From metabolic panels and hormone levels to wearable metrics and
          cardiac markers — OpenVitals tracks, trends, and contextualizes every
          biomarker that matters to your health.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors font-body"
          >
            Get started
          </Link>
          <Link
            href="/"
            className="px-4 py-2.5 text-[13px] text-neutral-400 hover:text-neutral-900 transition-colors font-body"
          >
            Back to home →
          </Link>
        </div>
      </div>
    </section>
  );
}
