import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  children: ReactNode; footer?: ReactNode; className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <D.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2",
            "card shadow-flyout max-h-[90vh] flex flex-col",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <D.Title className="text-xl font-semibold">{title}</D.Title>
              {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
            </div>
            <D.Close className="rounded p-1 text-muted hover:bg-subtle" aria-label="Cerrar"><X size={18} /></D.Close>
          </div>
          <div className="overflow-y-auto px-6 pb-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-stroke px-6 py-3">{footer}</div> : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
