"use client";

/**
 * "Post", wherever a server component wants to open the composer.
 *
 * ponytail: the modal is a native `<dialog>` rendered once in the layout, so
 * opening it is one `getElementById` and this file is three lines of state-free
 * client code instead of a context provider.
 */
import { openComposer } from "./composer";

export function PostButton({ label = "Post" }: { label?: string }) {
  return (
    <button
      onClick={openComposer}
      className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-400 transition-colors hover:text-neutral-900"
    >
      {label}
    </button>
  );
}
