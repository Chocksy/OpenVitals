import Link from 'next/link';

export function Hero() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 pt-16 md:pt-20">
      <div className="max-w-2xl">
        <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.15] tracking-[-0.025em] text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>
          Built to make your health data{' '}<em className="text-accent-600" style={{ fontStyle: 'italic' }}>extraordinarily</em>{' '}clear, OpenVitals is the best way to understand your records.
        </h1>
      </div>
      <div className="mt-7 flex items-center gap-3">
        <Link href="/register" className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
          Get started for free
        </Link>
        <a href="https://github.com/openvitals/openvitals" className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
          View on GitHub →
        </a>
      </div>
    </section>
  );
}
