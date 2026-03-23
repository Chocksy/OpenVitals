import { Button } from "@/components/button";
import { CubeBadge } from "@/components/decorations/dot-badge";
import Link from "next/link";
import { ReactNode } from "react";

type FeatureExampleCardProps = {
  topLabel: string;
  title: string;
  description: string;
  children: ReactNode;
};
export function FeatureExampleCard({
  topLabel,
  title,
  description,
  children,
}: FeatureExampleCardProps) {
  return (
    <div className="mt-10 border border-neutral-200 bg-white rounded-md">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
        <CubeBadge className="">{topLabel}</CubeBadge>
      </div>
      <div className="px-5 py-4 border-b border-neutral-100">{children}</div>
      <div className="px-5 py-5 flex flex-col gap-4">
        <div>
          <h3 className="font-display text-[18px] font-medium text-neutral-900">
            {title}
          </h3>
          <p className="mt-2 font-display text-[14px] text-neutral-500 leading-[1.6]">
            {description}
          </p>
        </div>
        <Link href="/register">
          <Button text="Learn more →" variant="default" />
        </Link>
      </div>
    </div>
  );
}
