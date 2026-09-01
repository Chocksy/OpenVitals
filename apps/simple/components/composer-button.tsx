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
      onClick={() => openComposer()}
      className="hit-40 t-meta cursor-pointer text-[12px] text-neutral-400 transition-colors hover:text-neutral-900"
    >
      {label}
    </button>
  );
}
