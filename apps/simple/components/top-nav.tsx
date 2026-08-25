"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LayoutDashboard,
  ClipboardCheck,
  ListChecks,
  LogOut,
  MessageSquare,
  Sparkles,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { authClient, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

const navigation: NavItem[] = [
  { name: "Home", href: "/", icon: LayoutDashboard },
  { name: "Biomarkers", href: "/biomarkers", icon: ListChecks },
  { name: "Insights", href: "/insights", icon: Sparkles },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Uploads", href: "/uploads", icon: Upload },
  { name: "Review", href: "/review", icon: ClipboardCheck },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/**
 * ponytail: the old nav's animated highlight needed `motion`, the account menu
 * needed radix, and the search palette needed tRPC. A static pill, a `<details>`
 * menu and no palette get the same look with none of that.
 */
export function TopNav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const name = session?.user?.name || session?.user?.email || "";

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
      <div className="mx-auto h-(--top-nav-height) max-w-[1400px] px-4">
        <div className="flex h-full items-center justify-between gap-4">
          <div className="flex items-center gap-6 md:ml-2">
            <Link href="/" className="group flex items-center gap-1.5">
              <Activity className="size-5.5 text-accent-500" />
              <span className="hidden text-[16px] font-medium tracking-tight sm:inline">
                OpenVitals
              </span>
            </Link>

            <nav className="hidden items-center md:flex">
              <div className="flex items-center gap-1 rounded border bg-neutral-100 p-0.5">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "flex h-[30px] items-center gap-1.5 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
                      isActive(pathname, item.href)
                        ? "bg-accent-50 text-accent-500"
                        : "text-neutral-500 hover:text-neutral-900",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">{item.name}</span>
                    {item.href === "/review" && reviewCount > 0 && (
                      <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-health-warning)] px-1 text-[9px] font-bold text-white tabular-nums">
                        {reviewCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </nav>
          </div>

          <details className="group relative">
            <summary className="flex size-8 cursor-pointer list-none items-center justify-center bg-neutral-200 font-mono text-[13px] font-bold text-accent-500">
              {name.slice(0, 1).toUpperCase() || "?"}
            </summary>
            <div className="card absolute right-0 mt-2 w-56 bg-white p-3 shadow-md">
              <p className="truncate text-sm font-medium">{name || "User"}</p>
              <p className="truncate text-xs text-neutral-500">
                {session?.user?.email}
              </p>
              <button
                className="mt-3 flex w-full cursor-pointer items-center gap-2 border-t border-neutral-200 pt-2 text-left text-sm text-neutral-600 hover:text-neutral-900"
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

      <nav className="flex items-center gap-0.5 overflow-x-auto border-t border-neutral-100 bg-white px-3 py-1.5 md:hidden">
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-1 whitespace-nowrap px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.04em] transition-colors",
              isActive(pathname, item.href)
                ? "bg-accent-50 text-accent-500"
                : "text-neutral-500",
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.name}
            {item.href === "/review" && reviewCount > 0 && (
              <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--color-health-warning)] px-1 text-[9px] font-bold text-white tabular-nums">
                {reviewCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}
