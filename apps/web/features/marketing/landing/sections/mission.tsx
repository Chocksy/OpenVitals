import Link from 'next/link';
import { PlaceholderImage } from '../components';

export function Mission() {
  return (
    <section className="border-t border-neutral-200/50">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-10 px-6 py-20 md:items-end md:gap-16">
        <div>
          <h2 className="text-[22px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.3]" style={{ fontFamily: 'var(--font-display)' }}>
            OpenVitals is an open-source project focused on giving people control over their health data.
          </h2>
          <Link href="https://github.com/openvitals/openvitals" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
            Contribute on GitHub →
          </Link>
        </div>
        <PlaceholderImage label="Team / community image" aspect="16/9" />
      </div>
    </section>
  );
}
