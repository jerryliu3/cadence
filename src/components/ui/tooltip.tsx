import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

type TooltipSide = "top" | "bottom"
type TooltipAlign = "start" | "center" | "end"

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: TooltipSide
  align?: TooltipAlign
  className?: string
  contentClassName?: string
}

const SIDE_CLASS: Record<TooltipSide, string> = {
  top: "bottom-[calc(100%+0.35rem)]",
  bottom: "top-[calc(100%+0.35rem)]",
}

const ALIGN_CLASS: Record<TooltipAlign, string> = {
  start: "left-0",
  center: "left-1/2 -translate-x-1/2",
  end: "right-0",
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
  contentClassName,
}: TooltipProps) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-20 w-max max-w-[16rem] rounded-md border border-border/60 bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100",
          SIDE_CLASS[side],
          ALIGN_CLASS[align],
          contentClassName
        )}
      >
        {content}
      </span>
    </span>
  )
}
