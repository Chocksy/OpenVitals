import { headers } from "next/headers";
import { isAdmin, requireUserId } from "@/lib/auth";
import { openReviewCount } from "@/lib/curator";
import { localDay } from "@/lib/daily";
import { Composer } from "@/components/composer";
import { TopNav } from "@/components/top-nav";

/**
 * Every signed-in page. Redirects to /login and renders the nav.
 *
 * Phase 23b: inside the iOS app the tab bar is the only navigation, so the
 * site drops its own. The webview appends `OpenVitalsiOS/1` to the user agent
 * (`Api.userAgentTag`), and this is the only place that looks — a browser
 * never takes the branch, so it renders exactly what it rendered before.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireUserId();
  const [reviewCount, admin, headerList] = await Promise.all([
    openReviewCount(userId),
    isAdmin(),
    headers(),
  ]);
  const app = headerList.get("user-agent")?.includes("OpenVitalsiOS") ?? false;
  return (
    <>
      {!app && <TopNav reviewCount={reviewCount} admin={admin} />}
      {/* pb leaves room for the mobile bottom bar, which the app has not got.
          `data-app` is what the 16 px input rule in globals.css hangs on. */}
      <main
        data-app={app ? "" : undefined}
        className={
          app
            ? "mx-auto max-w-[1400px] px-3 pb-8 pt-4 md:px-6 md:pt-8"
            : "mx-auto max-w-[1400px] px-3 pb-24 pt-6 md:px-6 md:pb-8 md:pt-8"
        }
      >
        {children}
      </main>
      <Composer today={localDay()} app={app} />
    </>
  );
}
