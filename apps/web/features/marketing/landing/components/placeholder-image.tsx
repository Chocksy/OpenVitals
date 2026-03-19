import { cn } from '@/lib/utils';

export function PlaceholderImage({ label, aspect = '16/10', className = '' }: { label: string; aspect?: string; className?: string }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100', className)}
      style={{ aspectRatio: aspect }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[13px] text-neutral-400 font-mono">{label}</span>
      </div>
      {/* Subtle scanline texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 3px)',
      }} />
    </div>
  );
}
