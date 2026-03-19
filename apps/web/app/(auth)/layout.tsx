import Link from 'next/link';
import { LogoWordmark } from '@/assets/app/images/logo';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 relative overflow-hidden" style={{ background: 'linear-gradient(145deg, #1D3DB3 0%, #3162FF 50%, #5A75FF 100%)' }}>
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }} />

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/" className="text-white">
            <LogoWordmark
              className="gap-2.5"
              logoProps={{ className: "size-7" }}
              workmarkProps={{ className: "text-[18px] tracking-[-0.01em]" }}
            />
          </Link>
        </div>

        {/* Central content */}
        <div className="relative z-10 space-y-8">
          <h2 className="text-[32px] font-medium leading-[1.15] tracking-[-0.03em] text-white font-display">
            Your health data,<br />traced to the source.
          </h2>

          {/* Mini data showcase */}
          <div className="space-y-3">
            {[
              { metric: 'LDL Cholesterol', value: '98', unit: 'mg/dL', status: 'Normal' },
              { metric: 'HbA1c', value: '5.9', unit: '%', status: 'Borderline' },
              { metric: 'Ferritin', value: '14', unit: 'ng/mL', status: 'Low' },
            ].map((row) => (
              <div key={row.metric} className="flex items-center justify-between rounded-lg bg-white/10 backdrop-blur-sm px-4 py-3">
                <span className="text-[13px] font-medium text-white/80 font-body">
                  {row.metric}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[14px] font-semibold text-white tabular-nums font-mono">
                    {row.value}
                  </span>
                  <span className="text-[10px] text-white/50 font-mono">
                    {row.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            {['◎ Quest Diagnostics', '⚙ lab-pdf-parser v2.1', '◉ 0.94'].map((pill) => (
              <span
                key={pill}
                className="rounded-md bg-white/10 px-2 py-1 text-[10px] text-white/60 font-mono"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-white p-6 md:p-10">
        {children}
      </div>
    </div>
  );
}
