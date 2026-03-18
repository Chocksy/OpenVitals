import Link from 'next/link';

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200/50" style={{ backgroundColor: 'rgba(250,249,247,0.88)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
      <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 h-12">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md" style={{ background: 'linear-gradient(135deg, #3162FF, #1D3DB3)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 3C7.5 3 4 6 4 9.5c0 2.5 1.5 4.5 3.5 5.5L6 21l3-2 3 2 3-2 3 2-1.5-6c2-1 3.5-3 3.5-5.5C21 6 17.5 3 12 3z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-[14px] font-semibold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>OpenVitals</span>
          </Link>
          <nav className="hidden md:flex items-center gap-5">
            {['Features', 'Docs', 'Pricing', 'Open Source'].map(l => (
              <span key={l} className="text-[13px] text-neutral-500 hover:text-neutral-800 cursor-pointer transition-colors" style={{ fontFamily: 'var(--font-body)' }}>{l}</span>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-[13px] text-neutral-600 hover:text-neutral-900 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>Sign in</Link>
          <Link href="/register" className="rounded-md bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800 transition-colors" style={{ fontFamily: 'var(--font-body)' }}>Get started</Link>
        </div>
      </div>
    </header>
  );
}
