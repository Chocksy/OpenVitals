export function Testimonials() {
  return (
    <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
      <div className="mx-auto max-w-[1120px] px-6 py-20">
        <h2 className="text-center text-[clamp(1.6rem,3.5vw,2.2rem)] font-medium tracking-[-0.025em] text-neutral-900 leading-[1.2]" style={{ fontFamily: 'var(--font-display)' }}>
          The new way to own your health data.
        </h2>
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { quote: 'I finally understand my lab results without having to Google every acronym. The provenance chain is brilliant — I can show my doctor exactly what changed.', name: 'Sarah M.', role: 'Patient, annual lab tracking' },
            { quote: 'The scoped sharing is exactly what I needed. My endocrinologist only sees thyroid panels and nothing else. Privacy should always work this way.', name: 'James R.', role: 'Managing hypothyroidism' },
            { quote: "Open source health data infrastructure is long overdue. The plugin SDK means the community can add parsers for any lab format.", name: 'Dr. Priya K.', role: 'Health tech researcher' },
            { quote: 'Being able to trace every value back to the source PDF with one click is incredible. No more wondering where a number came from.', name: 'Michael C.', role: 'Tracking lipid trends' },
            { quote: 'The AI chat is grounded in my actual records — not generic medical knowledge. It cited specific observations from my Quest results.', name: 'Elena V.', role: 'Managing chronic conditions' },
            { quote: "I've used five different health apps. This is the first one where I feel like I actually own my data. The export and provenance features are unmatched.", name: 'David L.', role: 'Quantified self enthusiast' },
          ].map((t, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 bg-white p-5">
              <p className="text-[13px] leading-[1.65] text-neutral-600" style={{ fontFamily: 'var(--font-body)' }}>
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-2.5">
                <div className="flex size-7 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-500" style={{ fontFamily: 'var(--font-body)' }}>
                  {t.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <div className="text-[12px] font-medium text-neutral-800" style={{ fontFamily: 'var(--font-body)' }}>{t.name}</div>
                  <div className="text-[11px] text-neutral-400" style={{ fontFamily: 'var(--font-body)' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
