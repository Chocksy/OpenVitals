/**
 * Next runs this for both runtimes. The Node-only work (timers, the import
 * scripts, the curator) lives in `instrumentation-node.ts`; the check below is
 * inlined at build time, so the Edge bundle never sees those modules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { start } = await import("./instrumentation-node");
    start();
  }
}
