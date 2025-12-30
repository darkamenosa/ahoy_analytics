import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { DateRange } from 'react-day-picker'

interface DateRangePickerProps {
  // Anchor element for positioning (hidden trigger). Kept for positioning only.
  buttonRef: React.RefObject<HTMLButtonElement | null>
  // Controlled open state (optional). When provided, component becomes controlled.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onApply: (from: string, to: string) => void
  // Preselect an existing range when opening
  initialFrom?: string | null
  initialTo?: string | null
}

export default function DateRangePicker({ buttonRef, onApply, open, onOpenChange, initialFrom, initialTo }: DateRangePickerProps) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [hasPickedStart, setHasPickedStart] = useState(false)
  const [isPreloadedRange, setIsPreloadedRange] = useState(false) // Track if current range is from initial props
  const isControlled = useMemo(() => typeof open === 'boolean', [open])
  const ignoreOutsideUntil = useRef<number>(0)
  const forceCloseOnce = useRef(false)

  const toYmd = useCallback((d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  const parseYmd = useCallback((s: string) => {
    const [y, m, d] = String(s).slice(0, 10).split('-').map((n) => Number(n))
    return new Date(y, (m || 1) - 1, d || 1, 12) // noon local to avoid tz drift
  }, [])

  // Ensure a selection state every time the popover opens (controlled prop)
  useEffect(() => {
    if (open) {
      if (initialFrom && initialTo) {
        setDateRange({ from: parseYmd(initialFrom), to: parseYmd(initialTo) })
        setHasPickedStart(false)
        setIsPreloadedRange(true) // Mark this as a preloaded range
      } else {
        setDateRange(undefined)
        setHasPickedStart(false)
        setIsPreloadedRange(false)
      }
      ignoreOutsideUntil.current = performance.now() + 250
      forceCloseOnce.current = false
    }
  }, [open, initialFrom, initialTo, parseYmd])

  const setOpen = useCallback((next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else {
      // Fallback for uncontrolled mode: toggle via trigger click
      if (!next && buttonRef.current) {
        // Close by toggling trigger if popover was opened via trigger
        try { buttonRef.current.click() } catch (_) {}
      }
    }
  }, [onOpenChange, buttonRef])

  const requestClose = useCallback(() => {
    forceCloseOnce.current = true
    setOpen(false)
  }, [setOpen])

  // Reset date range when popover opens
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      // Guard: ignore outside interactions for a short window after opening
      ignoreOutsideUntil.current = performance.now() + 250
    }
    if (!nextOpen && forceCloseOnce.current) {
      forceCloseOnce.current = false
    }
    // If controlled, delegate; if uncontrolled, Radix will handle it
    if (isControlled) onOpenChange?.(nextOpen)
  }

  // Use onDayClick to drive our own range logic so the previous selection doesn't influence the new start
  const handleDayClick = useCallback((day: Date) => {
    const clicked = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12)

    // If we're looking at a preloaded range OR starting fresh, begin new selection
    // Set both from and to to the same date to show a single-day selection
    if (isPreloadedRange || !hasPickedStart || !dateRange?.from) {
      setDateRange({ from: clicked, to: clicked })
      setHasPickedStart(true)
      setIsPreloadedRange(false)
      return
    }

    // Second pick → normalize order and apply
    const start = dateRange.from
    if (clicked < start) {
      setDateRange({ from: clicked, to: start })
      onApply(toYmd(clicked), toYmd(start))
    } else {
      setDateRange({ from: start, to: clicked })
      onApply(toYmd(start), toYmd(clicked))
    }
    requestAnimationFrame(() => requestClose())
  }, [dateRange?.from, hasPickedStart, isPreloadedRange, onApply, requestClose, toYmd])

  // Custom modifiers for styling - manually control what's highlighted
  const modifiers = useMemo(() => {
    if (!dateRange?.from) return {}

    const mods: any = {
      range_start: dateRange.from,
      range_end: dateRange.to || dateRange.from,
    }

    // Add range_middle for dates between start and end
    if (dateRange.from && dateRange.to && dateRange.from < dateRange.to) {
      const middleDays: Date[] = []
      const current = new Date(dateRange.from)
      current.setDate(current.getDate() + 1)

      while (current < dateRange.to) {
        middleDays.push(new Date(current))
        current.setDate(current.getDate() + 1)
      }

      if (middleDays.length > 0) {
        mods.range_middle = middleDays
      }
    }

    return mods
  }, [dateRange])

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <PopoverTrigger asChild>
        <button
          ref={buttonRef}
          className="h-9 w-0 outline-none opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="end"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Swallow the outside event that belongs to the dropdown click
          if (performance.now() < ignoreOutsideUntil.current) {
            e.preventDefault()
            return
          }
        }}
      >
        <div className="flex flex-col">
          <Calendar
            modifiers={modifiers}
            onDayClick={handleDayClick}
            numberOfMonths={1}
            disabled={{ after: new Date() }}
            toDate={new Date()}
            className="border-b border-border"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
