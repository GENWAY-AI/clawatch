"use client"

import { useState, useRef, useLayoutEffect, useId } from "react"

import { cn } from "@/lib/utils"

interface InfoTooltipProps {
  content: string
  className?: string
}

export function InfoTooltip({ content, className }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<"top" | "bottom">("top")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceAbove = rect.top
    const spaceBelow = window.innerHeight - rect.bottom
    setPosition(spaceBelow > spaceAbove ? "bottom" : "top")
  }, [visible])

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={tooltipId}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        className="inline-flex items-center justify-center size-4 rounded-full border border-muted-foreground/30 text-muted-foreground text-[10px] font-medium cursor-help hover:border-muted-foreground/60 hover:text-foreground transition-colors"
      >
        i
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        aria-hidden={!visible}
        className={cn(
          "absolute z-50 w-64 px-3 py-2 text-xs leading-relaxed text-foreground bg-popover border border-border rounded-lg shadow-lg transition-opacity left-1/2 -translate-x-1/2",
          position === "top" ? "bottom-full mb-2" : "top-full mt-2",
          visible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {content}
      </div>
    </span>
  )
}
