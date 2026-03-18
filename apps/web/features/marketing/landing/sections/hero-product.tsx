import { HeroMockup } from '../components';

export function HeroProduct() {
  return (
    <section className="mx-auto max-w-[1020px] px-6 pt-12 pb-16">
      <div className="relative rounded-2xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 12px 48px rgba(0,0,0,0.04)' }}>
        {/* Background placeholder image */}
        <div className="absolute inset-0 bg-neutral-200" style={{
          backgroundImage: 'linear-gradient(135deg, #C9D6C3 0%, #D4C9A8 30%, #DDD5C0 60%, #C4CFC0 100%)',
        }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[13px] text-neutral-400/60" style={{ fontFamily: 'var(--font-mono)' }}>landscape placeholder</span>
          </div>
        </div>
        {/* Floating UI panels on top */}
        <div className="relative z-10 p-6 md:p-8 pt-10 md:pt-12">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}
