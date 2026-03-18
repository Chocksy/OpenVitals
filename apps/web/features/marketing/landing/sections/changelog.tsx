import Link from 'next/link';

export function Changelog() {
  return (
    <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
      <div className="mx-auto max-w-[1120px] px-6 py-16">
        <h3 className="text-[22px] font-medium tracking-[-0.02em] text-neutral-900 mb-6" style={{ fontFamily: 'var(--font-display)' }}>Changelog</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { date: 'Mar 15, 2026', title: 'AI chat with provenance', ver: 'v0.1.4' },
            { date: 'Mar 10, 2026', title: 'Medication tracking', ver: 'v0.1.3' },
            { date: 'Mar 4, 2026', title: 'Scoped data sharing', ver: 'v0.1.2' },
            { date: 'Mar 1, 2026', title: 'Lab PDF ingestion pipeline', ver: 'v0.1.0' },
          ].map(e => (
            <div key={e.ver} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="text-[10px] text-neutral-400 mb-1" style={{ fontFamily: 'var(--font-mono)' }}>{e.date}</div>
              <div className="text-[13px] font-medium text-neutral-800 leading-snug" style={{ fontFamily: 'var(--font-body)' }}>{e.title}</div>
            </div>
          ))}
        </div>
        <Link href="/register" className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
          See what&apos;s new in OpenVitals →
        </Link>
      </div>
    </section>
  );
}
