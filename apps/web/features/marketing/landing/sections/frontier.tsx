export function Frontier() {
  return (
    <section className="border-t border-neutral-200/50">
      <div className="mx-auto max-w-[1120px] px-6 py-20">
        <h3 className="text-[13px] font-medium text-neutral-400 mb-1" style={{ fontFamily: 'var(--font-body)' }}>Stay on the frontier</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mt-6">
          {[
            { title: 'Use the right parser for every lab', desc: 'Quest, LabCorp, hospital systems, and CSVs. The pipeline classifies, extracts, normalizes, and maps to standard codes.', label: 'Ingestion' },
            { title: 'Complete medication understanding', desc: 'Track medications, supplements, dosage, adherence, and interactions — all linked to your health timeline.', label: 'Medications' },
            { title: 'Developer-first plugin ecosystem', desc: 'Build custom parsers, views, and analyzers with the SDK. Register new metrics, add data sources, publish to npm.', label: 'Plugins' },
          ].map(c => (
            <div key={c.title} className="rounded-xl border border-neutral-200 bg-white p-5">
              <div className="mb-1 text-[11px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{c.label}</div>
              <h4 className="text-[14px] font-medium text-neutral-900 tracking-[-0.01em] leading-snug" style={{ fontFamily: 'var(--font-body)' }}>{c.title}</h4>
              <p className="mt-2 text-[13px] leading-[1.6] text-neutral-500" style={{ fontFamily: 'var(--font-body)' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
