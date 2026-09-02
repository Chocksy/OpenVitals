"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Brain,
  Calendar,
  Database,
  Droplet,
  House,
  LogOut,
  MessageSquare,
  Network,
  Plus,
  Shield,
  type LucideIcon,
} from "lucide-react";
import { openComposer } from "./composer";
import { ThemeToggle } from "./theme-toggle";
import { authClient, signOut } from "@/lib/auth-client";
import { AddButton } from "./ui-kit";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Five destinations, per `docs/mockups/v4/shell.html` and `system.html`
 * section 03. Everything the old nav carried in its Data and Tracker groups
 * has folded into Body, Blood and Plan, so those groups are gone.
 */
const navigation: NavItem[] = [
  { name: "Home", href: "/", icon: House },
  { name: "Body", href: "/body", icon: Activity },
  { name: "Blood", href: "/blood", icon: Droplet },
  { name: "Plan", href: "/plan", icon: Calendar },
  { name: "Graph", href: "/graph", icon: Network },
];

/** The phone's tab bar: Graph lives in the menu, the + takes the middle. */
const phone = navigation.slice(0, 4);

/**
 * The admin's own destinations. They are windows on the engine, not a queue:
 * /brain shows how a scenario scored, /hkb what the knowledge base ingested,
 * /admin the users and the runs. A user never sees this group.
 */
const system: NavItem[] = [
  { name: "Brain", href: "/brain", icon: Brain },
  { name: "HKB", href: "/hkb", icon: Database },
  { name: "Admin", href: "/admin", icon: Shield },
];

/** `/body` and `/blood` own the routes that folded into them. */
const FOLDED: Record<string, string[]> = {
  "/body": ["/body", "/today", "/feel", "/trends", "/history"],
  "/blood": ["/blood"],
  "/plan": [
    "/plan",
    "/protocol",
    "/goals",
    "/insights",
    "/review",
    "/patterns",
  ],
};

const isActive = (pathname: string, href: string) =>
  href === "/"
    ? pathname === "/"
    : (FOLDED[href] ?? [href]).some((r) => pathname.startsWith(r));

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
      <header className="nav-bar sticky top-0 z-50">
        <div className="topbar mx-auto max-w-[1400px] px-4">
          <Link href="/" className="brand">
            OpenVitals
          </Link>

          <nav className="pills hidden md:flex" aria-label="Destinations">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                aria-current={
                  isActive(pathname, item.href) ? "page" : undefined
                }
                className={cn(isActive(pathname, item.href) && "on")}
              >
                <item.icon className="ic" />
                {item.name}
              </Link>
            ))}
          </nav>

          <span className="grow" />

          <AddButton
            className="hidden md:inline-grid"
            onClick={() => openComposer()}
          >
            <Plus className="ic i24" />
          </AddButton>

          <details className="avmenu">
            <summary suppressHydrationWarning aria-label="Account">
              {name.slice(0, 1).toUpperCase() || "?"}
            </summary>
            <div className="avpanel">
              <div className="who">
                <b suppressHydrationWarning>{name || "User"}</b>
                <span suppressHydrationWarning>{session?.user?.email}</span>
              </div>
              <hr />
              <Link href="/graph" className="md:hidden">
                <Network className="ic" />
                Graph
              </Link>
              <Link href="/chat">
                <MessageSquare className="ic" />
                Chat
                {reviewCount > 0 && <span className="cnt">{reviewCount}</span>}
              </Link>
              <ThemeToggle />
              {admin && (
                <>
                  <hr />
                  <div className="grp">System</div>
                  {system.map((item) => (
                    <Link key={item.href} href={item.href}>
                      <item.icon className="ic" />
                      {item.name}
                    </Link>
                  ))}
                </>
              )}
              <hr />
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  window.location.href = "/login";
                }}
              >
                <LogOut className="ic" />
                Sign out
              </button>
            </div>
          </details>
        </div>
      </header>

      <nav
        className="nav-bar tabbar fixed inset-x-0 bottom-0 z-50 md:hidden"
        aria-label="Destinations"
      >
        {phone.slice(0, 2).map((item) => (
          <Link
            key={item.name}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(isActive(pathname, item.href) && "on")}
          >
            <item.icon className="ic i24" />
            {item.name}
          </Link>
        ))}
        <span className="plusslot">
          <button
            type="button"
            aria-label="Add data"
            onClick={() => openComposer()}
          >
            <Plus className="ic i24" />
          </button>
        </span>
        {phone.slice(2).map((item) => (
          <Link
            key={item.name}
            href={item.href}
            aria-current={isActive(pathname, item.href) ? "page" : undefined}
            className={cn(isActive(pathname, item.href) && "on")}
          >
            <item.icon className="ic i24" />
            {item.name}
          </Link>
        ))}
      </nav>
    </>
  );
}
