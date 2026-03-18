/* ── Shared components for the marketing landing page ──── */

/* ── sparkline ─────────────────────────────────────────────── */
export function Spark({ data, color, w = 100, h = 28 }: { data: number[]; color: string; w?: number; h?: number }) {
  const mn = Math.min(...data), mx = Math.max(...data), r = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - mn) / r) * (h - 6)}`).join(' ');
  const last = pts.split(' ').pop()!.split(',');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}

/* ── placeholder image ─────────────────────────────────────── */
export function PlaceholderImage({ label, aspect = '16/10', className = '' }: { label: string; aspect?: string; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 ${className}`}
      style={{ aspectRatio: aspect }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{label}</span>
      </div>
      {/* Subtle scanline texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 3px)',
      }} />
    </div>
  );
}

/* ── inline lab table mockup (for hero) ────────────────────── */
export function HeroMockup() {
  const rows = [
    { metric: 'LDL Cholesterol', val: '98', unit: 'mg/dL', range: '0–100', st: 'normal', trend: [142, 130, 125, 118, 112, 98] },
    { metric: 'HDL Cholesterol', val: '58', unit: 'mg/dL', range: '> 40', st: 'normal', trend: [52, 54, 55, 56, 57, 58] },
    { metric: 'Triglycerides', val: '162', unit: 'mg/dL', range: '< 150', st: 'warning', trend: [128, 135, 142, 148, 155, 162] },
    { metric: 'HbA1c', val: '5.9', unit: '%', range: '< 5.7', st: 'warning', trend: [5.2, 5.3, 5.4, 5.5, 5.6, 5.9] },
    { metric: 'Ferritin', val: '14', unit: 'ng/mL', range: '20–300', st: 'critical', trend: [45, 38, 32, 25, 18, 14] },
  ];
  const sc: Record<string, string> = { normal: '#16A34A', warning: '#D97706', critical: '#DC2626' };
  const sl: Record<string, string> = { normal: 'Normal', warning: 'Borderline', critical: 'Low' };
  const sb: Record<string, string> = { normal: '#F0FDF4', warning: '#FFFBEB', critical: '#FEF2F2' };
  const sbo: Record<string, string> = { normal: '#BBF7D0', warning: '#FDE68A', critical: '#FECACA' };

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200/80 bg-white" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 12px 48px rgba(0,0,0,0.04)' }}>
      {/* Chrome */}
      <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-2.5">
        <div className="flex gap-1.5"><div className="size-[9px] rounded-full bg-[#FF5F57]" /><div className="size-[9px] rounded-full bg-[#FEBC2E]" /><div className="size-[9px] rounded-full bg-[#28C840]" /></div>
        <div className="ml-2 flex-1 rounded bg-neutral-100 px-3 py-[3px]">
          <span className="text-[10px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>openvitals.dev/labs</span>
        </div>
      </div>
      {/* Summary row */}
      <div className="grid grid-cols-4 gap-2.5 px-4 pt-4 pb-3">
        {[
          { label: 'LDL Cholesterol', val: '98', unit: 'mg/dL', delta: '↓ 14', color: '#16A34A', d: [142, 130, 118, 98] },
          { label: 'HbA1c', val: '5.9', unit: '%', delta: '↑ 0.3', color: '#D97706', d: [5.2, 5.4, 5.6, 5.9] },
          { label: 'Ferritin', val: '14', unit: 'ng/mL', delta: '↓ 8', color: '#DC2626', d: [45, 32, 18, 14] },
          { label: 'Vitamin D', val: '22', unit: 'ng/mL', delta: '↓ 6', color: '#DC2626', d: [42, 35, 28, 22] },
        ].map(c => (
          <div key={c.label} className="rounded-lg border border-neutral-200/80 p-2.5">
            <div className="text-[9px] text-neutral-400" style={{ fontFamily: 'var(--font-body)' }}>{c.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-[18px] font-medium tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>{c.val}</span>
              <span className="text-[8px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{c.unit}</span>
            </div>
            <div className="mt-1.5 flex items-end justify-between">
              <span className="text-[8px] font-medium" style={{ fontFamily: 'var(--font-mono)', color: c.color }}>{c.delta}</span>
              <Spark data={c.d} color={c.color} w={44} h={14} />
            </div>
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="grid grid-cols-[1.6fr_0.9fr_1fr_0.7fr_0.8fr] gap-2 border-t border-b border-neutral-100 bg-neutral-50/80 px-4 py-1.5">
        {['Metric', 'Value', 'Reference', 'Status', 'Trend'].map(h => (
          <div key={h} className="text-[8px] font-semibold uppercase tracking-[0.06em] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{h}</div>
        ))}
      </div>
      {rows.map((r, i) => (
        <div key={r.metric} className={`grid grid-cols-[1.6fr_0.9fr_1fr_0.7fr_0.8fr] items-center gap-2 px-4 py-2 ${i < rows.length - 1 ? 'border-b border-neutral-100/80' : ''}`}>
          <div className="text-[10px] font-medium text-neutral-800" style={{ fontFamily: 'var(--font-body)' }}>{r.metric}</div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-[11px] font-semibold tabular-nums" style={{ fontFamily: 'var(--font-mono)', color: r.st === 'normal' ? '#141414' : sc[r.st] }}>{r.val}</span>
            <span className="text-[8px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{r.unit}</span>
          </div>
          <div className="text-[9px] text-neutral-400" style={{ fontFamily: 'var(--font-mono)' }}>{r.range}</div>
          <span className="inline-flex w-fit items-center gap-[3px] rounded-full px-1.5 py-[2px] text-[8px] font-medium" style={{ backgroundColor: sb[r.st], color: sc[r.st], border: `1px solid ${sbo[r.st]}` }}>
            <span className="size-[5px] rounded-full" style={{ backgroundColor: sc[r.st] }} />{sl[r.st]}
          </span>
          <div className="flex justify-end"><Spark data={r.trend} color={sc[r.st]!} w={52} h={16} /></div>
        </div>
      ))}
    </div>
  );
}
