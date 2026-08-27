import { isAdmin, requireUserId } from "@/lib/auth";
import { openReviewCount } from "@/lib/curator";
import { TopNav } from "@/components/top-nav";

/** Every signed-in page. Redirects to /login and always renders the nav. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireUserId();
  const [reviewCount, admin] = await Promise.all([
    openReviewCount(userId),
    isAdmin(),
  ]);
  return (
    <>
      <TopNav reviewCount={reviewCount} admin={admin} />
      {/* pb leaves room for the mobile bottom bar. */}
      <main className="mx-auto max-w-[1400px] px-3 pb-24 pt-6 md:px-6 md:pb-8 md:pt-8">
        {children}
      </main>
    </>
  );
}
