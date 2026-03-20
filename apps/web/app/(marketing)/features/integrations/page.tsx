import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Watch,
  Activity,
  CircleGauge,
  CircleDot,
  Zap,
  Heart,
  Smartphone,
  TestTubes,
  FlaskConical,
  FileHeart,
  Hospital,
  ArrowRight,
  Shield,
  RefreshCw,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { Nav } from '@/features/marketing/landing/sections/nav';
import { Footer } from '@/features/marketing/landing/sections/footer';
import { BrowserWindow } from '@/features/marketing/landing/components/browser-window';

export const metadata: Metadata = {
  title: 'Integrations | OpenVitals',
  description:
    'Connect your wearables, health platforms, and lab services. Sync data from Whoop, Apple Watch, Fitbit, Garmin, Oura, Quest, LabCorp, and more.',
};

/* ── Provider catalog (static, no tRPC) ── */

interface Provider {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: LucideIcon;
  color: string;
  iconBg: string;
  dataTypes: string[];
}

const providers: Provider[] = [
  { id: 'whoop', name: 'Whoop', description: 'Strain tracking, recovery analysis, and sleep performance', category: 'Wearables', icon: Zap, color: 'text-amber-600', iconBg: 'bg-amber-50', dataTypes: ['Strain', 'Recovery', 'Sleep', 'HRV'] },
  { id: 'apple-watch', name: 'Apple Watch', description: 'Heart rate, activity, sleep, and ECG data', category: 'Wearables', icon: Watch, color: 'text-rose-600', iconBg: 'bg-rose-50', dataTypes: ['Heart Rate', 'Steps', 'Sleep', 'ECG'] },
  { id: 'fitbit', name: 'Fitbit', description: 'Activity tracking, sleep analysis, and heart rate monitoring', category: 'Wearables', icon: Activity, color: 'text-teal-600', iconBg: 'bg-teal-50', dataTypes: ['Steps', 'Sleep', 'Heart Rate', 'SpO2'] },
  { id: 'garmin', name: 'Garmin', description: 'GPS tracking, performance metrics, and health monitoring', category: 'Wearables', icon: CircleGauge, color: 'text-sky-600', iconBg: 'bg-sky-50', dataTypes: ['GPS', 'Heart Rate', 'VO2 Max', 'Steps'] },
  { id: 'oura-ring', name: 'Oura Ring', description: 'Sleep tracking, readiness scores, and temperature trends', category: 'Wearables', icon: CircleDot, color: 'text-violet-600', iconBg: 'bg-violet-50', dataTypes: ['Sleep', 'HRV', 'Temperature', 'Readiness'] },
  { id: 'apple-health', name: 'Apple Health', description: 'Centralized health data from all your Apple devices', category: 'Platforms', icon: Heart, color: 'text-pink-600', iconBg: 'bg-pink-50', dataTypes: ['Vitals', 'Activity', 'Nutrition', 'Sleep'] },
  { id: 'google-health-connect', name: 'Google Health Connect', description: 'Unified health data from Android apps and devices', category: 'Platforms', icon: Smartphone, color: 'text-emerald-600', iconBg: 'bg-emerald-50', dataTypes: ['Activity', 'Vitals', 'Sleep', 'Nutrition'] },
  { id: 'quest-diagnostics', name: 'Quest Diagnostics', description: 'Lab test results and diagnostic reports', category: 'Lab Services', icon: TestTubes, color: 'text-orange-600', iconBg: 'bg-orange-50', dataTypes: ['Blood Work', 'Metabolic', 'Lipid Panel'] },
  { id: 'labcorp', name: 'Labcorp', description: 'Laboratory testing results and health screening data', category: 'Lab Services', icon: FlaskConical, color: 'text-cyan-600', iconBg: 'bg-cyan-50', dataTypes: ['Blood Work', 'Urinalysis', 'Hormones'] },
  { id: 'epic-mychart', name: 'Epic MyChart', description: 'Medical records and visit summaries from Epic providers', category: 'Medical Records', icon: FileHeart, color: 'text-fuchsia-600', iconBg: 'bg-fuchsia-50', dataTypes: ['Records', 'Rx', 'Labs', 'Visits'] },
  { id: 'cerner', name: 'Cerner', description: 'Electronic health records and clinical data', category: 'Medical Records', icon: Hospital, color: 'text-slate-600', iconBg: 'bg-slate-100', dataTypes: ['Records', 'Labs', 'Imaging', 'Notes'] },
];

const steps = [
  {
    number: '01',
    title: 'Choose your source',
    description: 'Browse our integration catalog and pick from wearables, health platforms, lab services, or medical records systems.',
    icon: Activity,
  },
  {
    number: '02',
    title: 'Authorize securely',
    description: 'Sign in through the provider\'s own OAuth flow. We never see or store your password — only a scoped access token.',
    icon: Shield,
  },
  {
    number: '03',
    title: 'Sync automatically',
    description: 'Data flows in automatically. Sync on demand or let OpenVitals pull new observations on a schedule.',
    icon: RefreshCw,
  },
  {
    number: '04',
    title: 'Track and analyze',
    description: 'View trends, compare metrics across sources, and get AI-powered insights — all from a single dashboard.',
    icon: BarChart3,
  },
];

function ProviderCard({ provider }: { provider: Provider }) {
  const Icon = provider.icon;
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-white p-4 transition-shadow hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg ${provider.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-[18px] w-[18px] ${provider.color}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium text-neutral-900 font-body">{provider.name}</h3>
          <p className="text-[12px] text-neutral-500 mt-0.5 line-clamp-1 font-body">{provider.description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mt-3">
        {provider.dataTypes.map((type) => (
          <span key={type} className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-mono text-neutral-500">
            {type}
          </span>
        ))}
      </div>
    </div>
  );
}

function StepCard({ step }: { step: typeof steps[number] }) {
  const Icon = step.icon;
  return (
    <div className="relative">
      <div className="text-[11px] font-semibold text-accent-500 font-mono mb-3">{step.number}</div>
      <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center mb-3">
        <Icon className="h-4 w-4 text-accent-600" />
      </div>
      <h3 className="text-[15px] font-medium text-neutral-900 tracking-[-0.01em] font-body">{step.title}</h3>
      <p className="mt-2 text-[13px] leading-[1.6] text-neutral-500 font-body">{step.description}</p>
    </div>
  );
}

/* ── Mockup: Integration detail card ── */

function DetailMockup() {
  return (
    <BrowserWindow url="app.openvitals.com/integrations/whoop">
      <div className="p-4 md:p-5" style={{ backgroundColor: '#FAF9F7' }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
            <Zap className="h-[18px] w-[18px] text-amber-600" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-neutral-900 font-body">Whoop</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="flex h-[6px] w-[6px] rounded-full bg-green-500" />
              <span className="text-[11px] text-neutral-500 font-mono">Connected</span>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {[
            { label: 'Status', value: 'Connected', color: 'text-green-600' },
            { label: 'Connected', value: 'Mar 18', color: 'text-neutral-900' },
            { label: 'Last Sync', value: '2m ago', color: 'text-neutral-900' },
            { label: 'Observations', value: '47', color: 'text-accent-600' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
              <div className="text-[8px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono">{s.label}</div>
              <div className={`mt-0.5 text-[14px] font-medium tracking-[-0.02em] font-display ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: 'Recovery Score', value: '72%', status: 'normal', spark: [45, 68, 55, 72] },
            { name: 'HRV', value: '48 ms', status: 'warning', spark: [62, 55, 50, 48] },
            { name: 'Sleep Duration', value: '7h 12m', status: 'normal', spark: [6.5, 7.2, 6.8, 7.2] },
          ].map((m) => (
            <div key={m.name} className="rounded-lg border border-neutral-200 bg-white px-2.5 py-2">
              <div className="text-[9px] text-neutral-400 font-mono truncate">{m.name}</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[13px] font-semibold text-neutral-900 font-mono tabular-nums">{m.value}</span>
                <span
                  className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[7px] font-medium"
                  style={{
                    backgroundColor: m.status === 'normal' ? '#F0FDF4' : '#FFFBEB',
                    color: m.status === 'normal' ? '#16A34A' : '#D97706',
                    border: `1px solid ${m.status === 'normal' ? '#BBF7D0' : '#FDE68A'}`,
                  }}
                >
                  <span className="size-[4px] rounded-full" style={{ backgroundColor: m.status === 'normal' ? '#16A34A' : '#D97706' }} />
                  {m.status === 'normal' ? 'Normal' : 'Low'}
                </span>
              </div>
              {/* Mini sparkline */}
              <svg viewBox="0 0 60 16" className="mt-1.5 h-3 w-full" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke={m.status === 'normal' ? '#16A34A' : '#D97706'}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={m.spark
                    .map((v, i) => {
                      const min = Math.min(...m.spark);
                      const max = Math.max(...m.spark);
                      const range = max - min || 1;
                      const x = (i / (m.spark.length - 1)) * 60;
                      const y = 14 - ((v - min) / range) * 12;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
            </div>
          ))}
        </div>
      </div>
    </BrowserWindow>
  );
}

/* ── Mockup: Integration catalog grid ── */

function CatalogMockup() {
  return (
    <BrowserWindow url="app.openvitals.com/integrations">
      <div className="p-4 md:p-5" style={{ backgroundColor: '#FAF9F7' }}>
        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-4">
          {['All', 'Connected', 'Wearables', 'Lab Services'].map((tab, i) => (
            <span
              key={tab}
              className="rounded-md px-2.5 py-1 text-[10px] font-medium font-mono"
              style={{
                backgroundColor: i === 0 ? 'white' : 'transparent',
                color: i === 0 ? '#141414' : '#A3A3A3',
                boxShadow: i === 0 ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              }}
            >
              {tab}
            </span>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { name: 'Whoop', icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50', connected: true, types: ['Strain', 'Recovery', 'Sleep'] },
            { name: 'Apple Watch', icon: Watch, color: 'text-rose-600', bg: 'bg-rose-50', connected: false, types: ['Heart Rate', 'Steps', 'ECG'] },
            { name: 'Oura Ring', icon: CircleDot, color: 'text-violet-600', bg: 'bg-violet-50', connected: false, types: ['Sleep', 'HRV', 'Temp'] },
          ].map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.name} className="rounded-lg border border-neutral-200 bg-white p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-7 h-7 rounded-md ${p.bg} flex items-center justify-center`}>
                    <Icon className={`h-3.5 w-3.5 ${p.color}`} />
                  </div>
                  <span className="text-[11px] font-medium text-neutral-900 font-body">{p.name}</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-2.5">
                  {p.types.map((t) => (
                    <span key={t} className="rounded-full bg-neutral-100 px-1.5 py-[1px] text-[8px] font-mono text-neutral-500">{t}</span>
                  ))}
                </div>
                {p.connected ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-[5px] w-[5px] rounded-full bg-green-500" />
                    <span className="text-[9px] text-neutral-500 font-mono">Synced 2m ago</span>
                  </div>
                ) : (
                  <div className="rounded-md bg-accent-600 text-center py-1 text-[9px] font-medium text-white">Connect</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </BrowserWindow>
  );
}

/* ── Page ── */

export default function FeaturesIntegrationsPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAF9F7' }}>
      <Nav />

      {/* Hero */}
      <section className="mx-auto max-w-[1120px] px-6 pt-16 md:pt-20 pb-16">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-600 font-mono mb-3">Integrations</div>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] leading-[1.15] tracking-[-0.025em] text-neutral-900 font-display">
            Connect your devices.{' '}
            <em className="text-accent-600" style={{ fontStyle: 'italic' }}>Unify</em> your health data.
          </h1>
          <p className="mt-5 text-[15px] leading-[1.7] text-neutral-500 max-w-xl font-body">
            OpenVitals integrates with the wearables, health platforms, lab services, and medical records systems you already use. One dashboard for all your health data.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <Link
              href="/register"
              className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors font-body"
            >
              Get started for free
            </Link>
            <Link
              href="/"
              className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors font-body"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>

      {/* Provider grid */}
      <section className="border-t border-neutral-200/50">
        <div className="mx-auto max-w-[1120px] px-6 py-20">
          <h3 className="text-[13px] font-medium text-neutral-400 mb-1 font-body">Supported integrations</h3>
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25] font-display mt-1">
            11 providers and counting
          </h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-neutral-500 max-w-lg font-body">
            From wrist-worn wearables to hospital EHR systems — connect the sources that matter to you.
          </p>

          {/* Category groups */}
          {(['Wearables', 'Platforms', 'Lab Services', 'Medical Records'] as const).map((cat) => {
            const catProviders = providers.filter((p) => p.category === cat);
            if (catProviders.length === 0) return null;
            return (
              <div key={cat} className="mt-8 first:mt-10">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-neutral-400 font-mono mb-3">{cat}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catProviders.map((p) => (
                    <ProviderCard key={p.id} provider={p} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
        <div className="mx-auto max-w-[1120px] px-6 py-20">
          <h3 className="text-[13px] font-medium text-neutral-400 mb-1 font-body">How it works</h3>
          <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25] font-display mt-1">
            Connected in under a minute
          </h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-neutral-500 max-w-lg font-body">
            No API keys, no CSV exports, no manual data entry. Just authenticate and go.
          </p>

          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step.number} className="relative">
                <StepCard step={step} />
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-10 -right-5 h-4 w-4 text-neutral-300" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* UI showcase — catalog view */}
      <section className="border-t border-neutral-200/50">
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-6 py-20 md:grid-cols-[1fr_1.3fr] md:items-center md:gap-16">
          <div>
            <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25] font-display">
              Browse, connect,<br />and manage
            </h2>
            <p className="mt-4 text-[14px] leading-[1.7] text-neutral-500 font-body">
              The integration catalog shows every available provider at a glance. Filter by category, see what data each source provides, and connect with a single click.
            </p>
            <Link href="/register" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors font-body">
              Try it now <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <CatalogMockup />
          </div>
        </div>
      </section>

      {/* UI showcase — detail view */}
      <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
        <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-10 px-6 py-20 md:grid-cols-[1.3fr_1fr] md:items-center md:gap-16">
          <div className="relative rounded-xl overflow-hidden" style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            <DetailMockup />
          </div>
          <div>
            <h2 className="text-[24px] font-medium tracking-[-0.02em] text-neutral-900 leading-[1.25] font-display">
              Deep visibility into every connection
            </h2>
            <p className="mt-4 text-[14px] leading-[1.7] text-neutral-500 font-body">
              Each integration has its own detail page showing sync status, connection health, and every metric flowing in. See trends, abnormal values, and sparklines — all updated in real time.
            </p>
            <Link href="/register" className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600 hover:text-accent-700 transition-colors font-body">
              Explore integrations <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Security + privacy callout */}
      <section className="border-t border-neutral-200/50">
        <div className="mx-auto max-w-[1120px] px-6 py-20">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              {
                title: 'OAuth 2.0 everywhere',
                desc: 'We use industry-standard OAuth flows. Your provider credentials never touch our servers — only scoped tokens with the minimum required permissions.',
              },
              {
                title: 'Encrypted at rest',
                desc: 'All access tokens are encrypted with AES-256-GCM before storage. Even if our database were breached, tokens remain unreadable.',
              },
              {
                title: 'Revoke anytime',
                desc: 'Disconnect an integration with one click. We immediately delete the token and stop all syncing. Your data on the provider side is never modified.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-neutral-200 bg-white p-5">
                <div className="mb-1 text-[11px] text-accent-500 font-mono">Security</div>
                <h4 className="text-[14px] font-medium text-neutral-900 tracking-[-0.01em] leading-snug font-body">
                  {item.title}
                </h4>
                <p className="mt-2 text-[13px] leading-[1.6] text-neutral-500 font-body">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-neutral-200/50" style={{ backgroundColor: '#F5F4F1' }}>
        <div className="mx-auto max-w-[1120px] px-6 py-16">
          <h2 className="text-[clamp(1.6rem,3.5vw,2rem)] font-medium tracking-[-0.025em] text-neutral-900 font-display">
            Ready to connect your health data?
          </h2>
          <p className="mt-3 text-[14px] leading-[1.7] text-neutral-500 max-w-lg font-body">
            Sign up for free, connect your first integration, and start seeing your unified health timeline in minutes.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <Link
              href="/register"
              className="rounded-md bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 transition-colors font-body"
            >
              Get started for free
            </Link>
            <Link
              href="/"
              className="rounded-md px-4 py-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900 transition-colors font-body"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
