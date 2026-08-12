"use client"

import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
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

interface TooltipPosition {
  left: number
  top: number
}

const TOOLTIP_MARGIN_PX = 8
const TOOLTIP_GAP_PX = 6

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className,
  contentClassName,
}: TooltipProps) {
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const tooltipRef = useRef<HTMLSpanElement | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const updatePosition = useCallback(() => {
    const wrapper = wrapperRef.current
    const tooltip = tooltipRef.current
    if (!wrapper || !tooltip) {
      return
    }

    const wrapperRect = wrapper.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const showTop = side === "top"
    const hasTopSpace =
      wrapperRect.top - TOOLTIP_GAP_PX - tooltipRect.height >= TOOLTIP_MARGIN_PX
    const hasBottomSpace =
      wrapperRect.bottom + TOOLTIP_GAP_PX + tooltipRect.height <=
      viewportHeight - TOOLTIP_MARGIN_PX
    const shouldRenderTop = (showTop && hasTopSpace) || (!hasBottomSpace && hasTopSpace)

    const top = shouldRenderTop
      ? wrapperRect.top - TOOLTIP_GAP_PX - tooltipRect.height
      : wrapperRect.bottom + TOOLTIP_GAP_PX

    const unclampedLeft =
      align === "start"
        ? wrapperRect.left
        : align === "end"
          ? wrapperRect.right - tooltipRect.width
          : wrapperRect.left + wrapperRect.width / 2 - tooltipRect.width / 2

    const left = Math.min(
      Math.max(unclampedLeft, TOOLTIP_MARGIN_PX),
      viewportWidth - tooltipRect.width - TOOLTIP_MARGIN_PX
    )

    setPosition({ left, top })
  }, [align, side])

  useEffect(() => {
    if (!open) {
      return
    }

    updatePosition()
    const schedulePositionUpdate = () => {
      updatePosition()
    }

    window.addEventListener("resize", schedulePositionUpdate)
    window.addEventListener("scroll", schedulePositionUpdate, true)
    return () => {
      window.removeEventListener("resize", schedulePositionUpdate)
      window.removeEventListener("scroll", schedulePositionUpdate, true)
    }
  }, [open, updatePosition])

  return (
    <span
      ref={wrapperRef}
      className={cn("relative inline-flex", className)}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => {
        setOpen(false)
        setPosition(null)
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
          setPosition(null)
        }
      }}
    >
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <span
              ref={tooltipRef}
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[90] w-max max-w-[16rem] rounded-md border border-border/60 bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm transition-opacity",
                open && position ? "opacity-100" : "opacity-0",
                contentClassName
              )}
              style={
                position
                  ? {
                      left: `${position.left}px`,
                      top: `${position.top}px`,
                    }
                  : {
                      left: "-9999px",
                      top: "-9999px",
                    }
              }
            >
              {content}
            </span>,
            document.body
          )
        : null}
    </span>
  )
}
