import Link from 'next/link';
import { PlaceholderImage } from '../components';

export function FeatureMedications() {
  return (
    <section className="border-t border-neutral-200/50">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-6 py-20 md:grid-cols-[1.3fr_1fr] md:items-center md:gap-16">
        <PlaceholderImage label="Medication tracking screenshot" aspect="4/3" className="shadow-[0_4px_24px_rgba(0,0,0,0.06)]" />
        <div>
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25]" style={{ fontFamily: 'var(--font-display)' }}>
            Medication tracking with{' '}<em className="text-accent-600" style={{ fontStyle: 'italic' }}>full context</em>
          </h2>
          <p className="mt-4 text-[14px] leading-[1.7] text-neutral-500" style={{ fontFamily: 'var(--font-body)' }}>
            Active medications, supplements, dosage, frequency, and daily adherence — all linked to your health timeline and lab results.
          </p>
          <Link href="/register" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
            Learn about medications →
          </Link>
        </div>
      </div>
    </section>
  );
}
