import Link from 'next/link';

export function FeatureAiParsing() {
  return (
    <section className="border-t border-neutral-200/50">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-6 py-20 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-16">
        <div>
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25]" style={{ fontFamily: 'var(--font-display)' }}>
            Upload a PDF,<br />get structured data
          </h2>
          <p className="mt-4 text-[14px] leading-[1.7] text-neutral-500" style={{ fontFamily: 'var(--font-body)' }}>
            Accelerate understanding by handing off messy lab reports to OpenVitals. AI classifies, extracts, and normalizes — you focus on the results.
          </p>
          <Link href="/register" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>
            Learn about ingestion →
          </Link>
        </div>
        {/* Live UI: import job status cards over placeholder bg */}
        <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 4px_24px rgba(0,0,0,0.06)' }}>
          <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(160deg, #E8E4DB 0%, #D8D4C8 100%)' }} />
          <div className="relative z-10 p-5 space-y-2.5">
            {[
              { file: 'quest_labs_mar2026.pdf', type: 'Lab report', status: 'Completed', conf: '0.96', records: '18', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
              { file: 'physical_notes.pdf', type: 'Encounter note', status: 'Parsing...', conf: '0.84', records: '—', color: '#3162FF', bg: '#EEF1FF', border: '#D6DCFF' },
              { file: 'dental_xray_summary.pdf', type: 'Dental record', status: 'Needs review', conf: '0.62', records: '7', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
            ].map(r => (
              <div key={r.file} className="flex items-center justify-between rounded-lg border border-neutral-200/80 bg-white px-4 py-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div>
                  <div className="text-[12px] font-medium text-neutral-800" style={{ fontFamily: 'var(--font-body)' }}>{r.file}</div>
                  <div className="mt-0.5 text-[10px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{r.type}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] tabular-nums text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{r.conf}</span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[9px] font-medium" style={{ backgroundColor: r.bg, color: r.color, border: `1px solid ${r.border}` }}>
                    <span className="size-[5px] rounded-full" style={{ backgroundColor: r.color }} />{r.status}
                  </span>
                  <span className="text-[11px] font-semibold text-accent-600 tabular-nums" style={{ fontFamily: 'var(--font-mono)' }}>{r.records}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
