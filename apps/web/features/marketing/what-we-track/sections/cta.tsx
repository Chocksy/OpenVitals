import Link from "next/link";
import { TOTAL_COUNT } from "../data";

export function Cta() {
  return (
    <section
      className="border-t border-neutral-200/40"
      style={{ backgroundColor: "#F5F4F1" }}
    >
      <div className="mx-auto max-w-[1120px] px-6 py-20">
        <h2 className="text-[clamp(1.6rem,3.5vw,2rem)] font-medium tracking-[-0.025em] text-neutral-900 font-display">
          Start tracking your biomarkers.
        </h2>
        <p className="mt-3 text-[14px] leading-[1.7] text-neutral-400 max-w-lg font-body">
          Upload your lab results, connect your wearables, and see all{" "}
          {TOTAL_COUNT}+ biomarkers come to life on your personal health
          dashboard.
        </p>
        <div className="mt-7 flex items-center gap-3">
          <Link
            href="/register"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors font-body"
          >
            Get started for free
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
