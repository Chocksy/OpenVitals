"use client";

/**
 * The Drawer, phase 40a: 53's case panel. A native `<dialog>` opened with
 * `showModal()`, so the browser owns the focus trap, Esc and the scrim
 * (`::backdrop`). At 1024 px and up it is a 555 px panel on the right; below
 * that it is a bottom sheet at 89 % of the screen with a grabber. The slide
 * is CSS only (`.drawer` in globals.css: `@starting-style` in, a discrete
 * transition out, 53's curve), and reduced motion drops it.
 *
 * Controlled: the parent owns `open`. Esc, a tap on the scrim and the close
 * button all end in `onClose`, which is where the parent clears its state.
 * The existing `.sheet` dialogs are separate and unchanged.
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Drawer({
  open,
  onClose,
  label,
  head,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** the dialog's accessible name */
  label: string;
  /** the line beside the close button (53 `.chd`) */
  head?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      className={cn("drawer", className)}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="drawer-in">
        <div className="drawer-head">
          {head}
          <span className="grow" />
          <button
            type="button"
            aria-label="Close"
            className="drawer-x"
            onClick={() => ref.current?.close()}
          >
            <X className="ic" />
          </button>
        </div>
        {open && children}
      </div>
    </dialog>
  );
}
