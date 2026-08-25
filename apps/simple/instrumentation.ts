/**
 * The daily curator pass.
 *
 * ponytail: in-process timer; move to an external cron if there is ever more
 * than one web replica.
 */
const DAY = 24 * 60 * 60 * 1000;
const FIRST_RUN = 5 * 60 * 1000;

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const tick = async () => {
    try {
      const { runCuratorForAllUsers } = await import("@/lib/curator");
      const users = await runCuratorForAllUsers("daily");
      console.log(`[curator] daily pass over ${users} user(s)`);
    } catch (e) {
      console.error("[curator] daily pass failed:", e);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), DAY).unref?.();
  }, FIRST_RUN).unref?.();
}
