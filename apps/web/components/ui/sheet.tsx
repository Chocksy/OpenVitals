'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px] data-[state=open]:animate-[sheet-overlay-in_300ms_ease] data-[state=closed]:animate-[sheet-overlay-out_200ms_ease]',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed z-50 flex flex-col bg-white shadow-lg',
          side === 'right' &&
            'inset-y-0 right-0 h-full w-full max-w-[520px] data-[state=open]:animate-[sheet-slide-in-right_300ms_ease] data-[state=closed]:animate-[sheet-slide-out-right_200ms_ease]',
          side === 'left' &&
            'inset-y-0 left-0 h-full w-full max-w-[520px] data-[state=open]:animate-[sheet-slide-in-left_300ms_ease] data-[state=closed]:animate-[sheet-slide-out-left_200ms_ease]',
          side === 'top' &&
            'inset-x-0 top-0 h-auto data-[state=open]:animate-[sheet-slide-in-top_300ms_ease] data-[state=closed]:animate-[sheet-slide-out-top_200ms_ease]',
          side === 'bottom' &&
            'inset-x-0 bottom-0 h-auto data-[state=open]:animate-[sheet-slide-in-bottom_300ms_ease] data-[state=closed]:animate-[sheet-slide-out-bottom_200ms_ease]',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-5 right-5 z-10 p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors cursor-pointer">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1.5 p-6', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-6', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-lg font-semibold text-neutral-900', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-neutral-500', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
