"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarCheck,
  Brain,
  ClipboardCheck,
  FlaskConical,
  HeartPulse,
  History,
  LayoutDashboard,
  Library,
  ListTodo,
  LogOut,
  MessageSquare,
  Network,
  Plus,
  Settings,
  Stethoscope,
  Target,
  TrendingUp,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { openComposer } from "./composer";
import { ThemeToggle } from "./theme-toggle";
import { authClient, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/** Four destinations. Everything else lives in the avatar menu. */
const navigation: NavItem[] = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Plan", href: "/plan", icon: Stethoscope },
  { name: "Labs", href: "/labs", icon: FlaskConical },
  { name: "Graph", href: "/graph", icon: Network },
];

/**
 * The admin's own destinations, next to the four everybody has. They are
 * windows on the engine, not a queue: /brain shows how a scenario scored, /hkb
 * what the knowledge base ingested, /admin the users and the runs. A user
 * never sees this group.
 */
const system: NavItem[] = [
  { name: "Brain", href: "/brain", icon: Brain },
  { name: "HKB", href: "/hkb", icon: Library },
  { name: "Admin", href: "/admin", icon: Settings },
];

const tracker: NavItem[] = [
  { name: "Today", href: "/today", icon: CalendarCheck },
  { name: "How do you feel", href: "/feel", icon: HeartPulse },
  { name: "Protocol", href: "/protocol", icon: ListTodo },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Trends", href: "/trends", icon: TrendingUp },
];

/** `/labs` owns the lab tabs, so `/biomarkers` and `/uploads` light it up. */
const LABS_ROUTES = ["/labs", "/biomarkers", "/uploads"];

const isActive = (pathname: string, href: string) =>
  href === "/"
    ? pathname === "/"
    : href === "/labs"
      ? LABS_ROUTES.some((r) => pathname.startsWith(r))
      : pathname.startsWith(href);

const menuLink =
  "flex items-center gap-2 px-2 py-1.5 font-body text-[13px] text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900";

function MenuGroup({
  label,
  items,
  children,
}: {
  label: string;
  items?: NavItem[];
  children?: React.ReactNode;
}) {
  return (
    <div className="mt-2 border-t border-neutral-200 pt-2">
      <p className="mb-0.5 px-2 font-mono text-[10px] uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      {items?.map((item) => (
        <Link key={item.href} href={item.href} className={menuLink}>
          <item.icon className="size-3.5 text-neutral-400" />
          {item.name}
        </Link>
      ))}
      {children}
    </div>
  );
}

/**
 * ponytail: the old nav's animated highlight needed `motion`, the account menu
 * needed radix, and the search palette needed tRPC. A static pill, a `<details>`
 * menu and no palette get the same look with none of that.
 */
export function TopNav({
  reviewCount = 0,
  admin = false,
}: {
  reviewCount?: number;
  admin?: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const name = session?.user?.name || session?.user?.email || "";

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-neutral-0">
        <div className="mx-auto h-(--top-nav-height) max-w-[1400px] px-4">
          <div className="flex h-full items-center justify-between gap-4">
            <div className="flex items-center gap-6 md:ml-2">
              <Link href="/" className="group flex items-center gap-1.5">
                <Activity className="size-5.5 text-accent-500" />
                <span className="hidden text-[16px] font-medium tracking-tight sm:inline">
                  OpenVitals
                </span>
              </Link>

              <nav className="hidden items-center gap-3 md:flex">
                <div className="flex items-center gap-1 rounded border bg-neutral-100 p-0.5">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        // Concentric: the group is `rounded` (4 px) with
                        // 2 px of padding, so the pill inside is 2 px.
                        "flex h-[30px] items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors duration-150 ease-out",
                        isActive(pathname, item.href)
                          ? "bg-accent-50 text-accent-500"
                          : "text-neutral-500 hover:text-neutral-900",
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.name}
                    </Link>
                  ))}
                </div>

                {admin && (
                  <div
                    className="flex items-center gap-1 rounded border border-dashed border-neutral-300 p-0.5"
                    title="System"
                  >
                    <span className="px-1.5 font-mono text-[9px] uppercase tracking-wider text-neutral-400">
                      System
                    </span>
                    {system.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "flex h-[30px] items-center gap-1.5 rounded-[2px] px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors duration-150 ease-out",
                          isActive(pathname, item.href)
                            ? "bg-accent-50 text-accent-500"
                            : "text-neutral-500 hover:text-neutral-900",
                        )}
                      >
                        <item.icon className="h-3.5 w-3.5" />
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </nav>
            </div>

            <details className="group relative">
              <summary
                suppressHydrationWarning
                className="flex size-8 cursor-pointer list-none items-center justify-center bg-neutral-200 font-mono text-[13px] font-bold text-accent-500"
              >
                {name.slice(0, 1).toUpperCase() || "?"}
              </summary>
              <div className="card absolute right-0 mt-2 w-60 bg-neutral-0 p-3 shadow-md">
                <p
                  suppressHydrationWarning
                  className="truncate text-sm font-medium"
                >
                  {name || "User"}
                </p>
                <p
                  suppressHydrationWarning
                  className="truncate text-xs text-neutral-500"
                >
                  {session?.user?.email}
                </p>

                <MenuGroup label="Data">
                  <Link href="/review" className={menuLink}>
                    <ClipboardCheck className="size-3.5 text-neutral-400" />
                    Review
                    {reviewCount > 0 && (
                      <span className="ml-auto inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-health-warning)] px-1 font-mono text-[9px] font-bold tabular-nums text-white">
                        {reviewCount}
                      </span>
                    )}
                  </Link>
                  <Link href="/uploads" className={menuLink}>
                    <Upload className="size-3.5 text-neutral-400" />
                    Uploads
                  </Link>
                  <Link href="/history" className={menuLink}>
                    <History className="size-3.5 text-neutral-400" />
                    History
                  </Link>
                </MenuGroup>

                {/* the same three as the System pills, for a narrow screen */}
                {admin && <MenuGroup label="System" items={system} />}

                <MenuGroup label="Tracker" items={tracker} />

                <MenuGroup label="Ask the AI">
                  <Link href="/chat" className={menuLink}>
                    <MessageSquare className="size-3.5 text-neutral-400" />
                    Chat
                  </Link>
                </MenuGroup>

                <ThemeToggle />
                <button
                  className="mt-2 flex w-full cursor-pointer items-center gap-2 border-t border-neutral-200 pt-2 text-left text-sm text-neutral-600 hover:text-neutral-900"
                  onClick={async () => {
                    await signOut();
                    window.location.href = "/login";
                  }}
                >
                  <LogOut className="size-4" />
                  Sign out
                </button>
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* Five slots on the phone, and the middle one is the composer: the one
          thing you always want to reach is not a page, it is a sentence. */}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-neutral-200 bg-neutral-0 md:hidden">
        {navigation.slice(0, 2).map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em] transition-colors",
              isActive(pathname, item.href)
                ? "bg-accent-50 text-accent-500"
                : "text-neutral-500",
            )}
          >
            <item.icon className="size-4" />
            {item.name}
          </Link>
        ))}
        <button
          aria-label="Post something"
          onClick={openComposer}
          className="flex cursor-pointer flex-col items-center justify-center py-1"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-neutral-900 text-neutral-0">
            <Plus className="size-5" />
          </span>
        </button>
        {navigation.slice(2).map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.04em] transition-colors",
              isActive(pathname, item.href)
                ? "bg-accent-50 text-accent-500"
                : "text-neutral-500",
            )}
          >
            <item.icon className="size-4" />
            {item.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
