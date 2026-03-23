import { Button } from "@/components/button";
import { CubeBadge, DashBadge } from "@/components/decorations/dot-badge";
import Link from "next/link";
import { Logo } from "@/assets/app/images/logo";
export function GetStartedCard() {
  return (
    <div className="bg-neutral-900 p-5 max-w-md rounded-xl aspect-square flex flex-col">
      {/* Card header */}
      <div className="flex items-center justify-between mb-12">
        <DashBadge className="text-neutral-300">Get Started</DashBadge>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
          Start Tracking
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-end">
        {/* Logo icon */}
        <Logo className="size-8 text-white mb-6" />

        {/* Headline */}
        <h2 className="font-display text-[28px] md:text-[32px] font-medium tracking-[-0.03em] leading-[1.1] text-white">
          Ready to understand
          <br />
          your health data?
        </h2>

        {/* Button */}
        <div className="mt-5">
          <Link href="/register">
            <Button
              text="Start tracking →"
              className="bg-white text-neutral-900 hover:bg-neutral-100"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
