import { CircleHelp } from "lucide-react"
import type { ReactNode } from "react"
import { Tooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type TooltipSide = "top" | "bottom"
type TooltipAlign = "start" | "center" | "end"

interface TooltipIconProps {
  content: ReactNode
  label: string
  side?: TooltipSide
  align?: TooltipAlign
  className?: string
}

export function TooltipIcon({
  content,
  label,
  side = "top",
  align = "center",
  className,
}: TooltipIconProps) {
  return (
    <Tooltip content={content} side={side} align={align}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          className
        )}
      >
        <CircleHelp className="size-3.5" />
      </button>
    </Tooltip>
  )
}
