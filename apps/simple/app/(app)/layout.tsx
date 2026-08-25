import { requireUserId } from "@/lib/auth";
import { openReviewCount } from "@/lib/curator";
import { TopNav } from "@/components/top-nav";

/** Every signed-in page. Redirects to /login and always renders the nav. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await requireUserId();
  const reviewCount = await openReviewCount(userId);
  return (
    <>
      <TopNav reviewCount={reviewCount} />
      <main className="mx-auto max-w-[1400px] px-3 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </>
  );
}
