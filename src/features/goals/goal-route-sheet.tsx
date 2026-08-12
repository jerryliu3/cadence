"use client";

import { X } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface GoalRouteSheetProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
}

export function GoalRouteSheet({ children, onClose, title }: GoalRouteSheetProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="left-0 top-0 z-[70] grid h-dvh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none border-0 bg-background p-0 ring-0 sm:rounded-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="sticky top-0 z-10 flex items-center justify-end border-b bg-background/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close goal editor"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
