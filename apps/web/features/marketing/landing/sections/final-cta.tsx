import Link from "next/link";
import { Logo } from "@/assets/app/images/logo";
import { Button } from "@/components/button";
import { DashBadge } from "@/components/decorations/dot-badge";
import { GetStartedCard } from "../../components/get-started-card";

export function FinalCta() {
  return (
    <section className="px-6 md:px-10 py-14">
      <div className="mx-auto max-w-[1280px]">
        {/* Dark CTA card */}
        <GetStartedCard />
      </div>
    </section>
  );
}
