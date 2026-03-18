import Link from 'next/link';
import { PlaceholderImage } from '../components';

export function FeatureSharing() {
  return (
    <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-6 py-20 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-16">
        <div>
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25]" style={{ fontFamily: 'var(--font-display)' }}>
            Share exactly what your doctor needs
          </h2>
          <p className="mt-4 text-[14px] leading-[1.7] text-neutral-500" style={{ fontFamily: 'var(--font-body)' }}>
            Create scoped shares by category, time range, and access level. Your cardiologist sees lipids and vitals. Your nutritionist sees diet-related labs. Nobody sees what they shouldn&apos;t.
          </p>
          <Link href="/register" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
            Explore data sharing →
          </Link>
        </div>
        <PlaceholderImage label="Sharing UI screenshot" aspect="4/3" className="shadow-[0_4px_24px_rgba(0,0,0,0.06)]" />
      </div>
    </section>
  );
}
