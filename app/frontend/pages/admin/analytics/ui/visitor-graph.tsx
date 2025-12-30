import {
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip as ChartTooltip,
  type ChartDataset
} from 'chart.js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Download, ChevronDown } from 'lucide-react'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
// Tooltip imports removed (sampling tooltip currently commented out)

import { exportCsv, fetchMainGraph, fetchTopStats } from '../api'
import { useLastLoadContext } from '../last-load-context'
import { useQueryContext } from '../query-context'
import { useSiteContext } from '../site-context'
import { useTopStatsContext } from '../top-stats-context'
import type { MainGraphPayload, TopStat } from '../types'

dayjs.extend(utc)
dayjs.extend(timezone)

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler)

const INTERVAL_LABELS: Record<string, string> = {
  minute: 'Minutes',
  hour: 'Hours',
  day: 'Days',
  week: 'Weeks',
  month: 'Months'
}

const STORAGE_PREFIX = 'admin.analytics'

// Detect if user prefers 12-hour clock
function is12HourClock(): boolean {
  const browserFormat = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' })
  return browserFormat.resolvedOptions().hour12 ?? false
}

// Date formatting utilities matching Plausible's exact logic
function formatHour(isoDate: string, tz: string): string {
  const date = dayjs.utc(isoDate).tz(tz)
  if (is12HourClock()) {
    return date.format('ha') // "3pm", "12am"
  } else {
    return date.format('HH:mm') // "15:00", "00:00"
  }
}

function formatDay(isoDate: string, includeYear: boolean, tz: string): string {
  const date = dayjs.utc(isoDate).tz(tz)
  if (includeYear) {
    return date.format('D MMM YY') // "5 Oct 25"
  } else {
    return date.format('D MMM') // "5 Oct"
  }
}

function formatMonth(isoDate: string, tz: string): string {
  const date = dayjs.utc(isoDate).tz(tz)
  return date.format('MMMM YYYY') // "October 2025"
}

function hasMultipleYears(labels: string[]): boolean {
  const years = labels
    .filter((label) => typeof label === 'string')
    .map((label) => label.split('-')[0])
  return new Set(years).size > 1
}

type VisitorGraphProps = {
  initialGraph: MainGraphPayload
}

export default function VisitorGraph({ initialGraph }: VisitorGraphProps) {
  const { query, updateQuery } = useQueryContext()
  const { payload, update } = useTopStatsContext()
  const { touch } = useLastLoadContext()
  const site = useSiteContext()

  const [graph, setGraph] = useState<MainGraphPayload>(initialGraph)
  const [loading, setLoading] = useState(false)
  const [metric, setMetric] = useState(() => initialGraph.metric)
  const [interval, setInterval] = useState(() => initialGraph.interval)
  const abortRef = useRef<AbortController | null>(null)
  const mouseYRef = useRef<number | null>(null)

  const graphableMetrics = payload.graphableMetrics

  useEffect(() => {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}.metric`)
    if (stored && graphableMetrics.includes(stored)) {
      setMetric(stored)
    }
  }, [graphableMetrics, site.domain])

  const fetchGraph = useCallback(
    async (
      nextMetric: string,
      nextInterval: string,
      controller: AbortController
    ) => {
      const data = await fetchMainGraph(query, { metric: nextMetric, interval: nextInterval }, controller.signal)
      setGraph(data)
    },
    [query]
  )

  useEffect(() => {
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller

    setLoading(true)

    fetchTopStats(query, controller.signal)
      .then((data) => {
        update(data)
        touch()
        const preferredMetric = (() => {
          const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}.metric`)
          if (stored && data.graphableMetrics.includes(stored)) {
            return stored
          }
          return data.graphableMetrics[0] ?? 'visitors'
        })()
        setMetric(preferredMetric)
        const preferredInterval = data.interval || interval
        setInterval(preferredInterval)
        return fetchGraph(preferredMetric, preferredInterval, controller)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error(error)
        }
      })
      .finally(() => {
        setLoading(false)
      })

    return () => controller.abort()
  }, [fetchGraph, query, site.domain, update])

  const changeMetric = useCallback(
    (next: string) => {
      setMetric(next)
      localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}.metric`, next)
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      setLoading(true)
      fetchGraph(next, interval, controller)
        .catch((error) => {
          if (error.name !== 'AbortError') console.error(error)
        })
        .finally(() => setLoading(false))
    },
    [fetchGraph, interval, site.domain]
  )

  const changeInterval = useCallback(
    (nextInterval: string) => {
      setInterval(nextInterval)
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      setLoading(true)
      fetchGraph(metric, nextInterval, controller)
        .catch((error) => {
          if (error.name !== 'AbortError') console.error(error)
        })
        .finally(() => setLoading(false))
    },
    [fetchGraph, metric]
  )

  const onExport = async () => {
    try {
      const blob = await exportCsv(query)
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'analytics-export.csv'
      anchor.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error(error)
    }
  }

  const chartData = useMemo(() => createChartData(graph), [graph])
  const chartOptions = useMemo(
    () => createChartOptions({ ...graph, metric }, query.period, site.timezone, mouseYRef),
    [graph, metric, query.period, site.timezone]
  )

  return (
    <section className="rounded-xl border border-border bg-card shadow-[0_12px_26px_rgba(7,9,16,0.32)]">
      <div className="space-y-4 p-4 sm:p-6">
        <TopStatsGrid
          stats={payload.topStats}
          graphableMetrics={graphableMetrics}
          selectedMetric={metric}
          onSelectMetric={changeMetric}
          comparingFrom={payload.comparingFrom}
          comparingTo={payload.comparingTo}
          period={query.period}
          timezone={site.timezone}
          showComparison={Boolean(query.comparison && payload.comparingFrom)}
          primaryFrom={payload.from}
          primaryTo={payload.to}
        />

        <div className="relative mt-4">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xs bg-card/75 backdrop-blur-sm">
              <Spinner />
            </div>
          )}
          <div className="flex justify-end gap-2 pb-2">
            {/* <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Sampling notice" disabled>
                    <Info className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sampling disabled in demo mode</TooltipContent>
              </Tooltip>
            </TooltipProvider> */}
            {payload.withImportedSwitch.visible && (
              <Button
                variant={query.withImported ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  updateQuery((current) => ({
                    ...current,
                    withImported: !current.withImported
                  }))
                }
                disabled={!payload.withImportedSwitch.togglable}
              >
                {query.withImported ? 'Showing imported' : 'Show imported'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="mr-2 size-4" /> Export CSV
            </Button>
            <IntervalPicker interval={interval} onChange={changeInterval} />
          </div>
          <div className="h-96">
            <Line options={chartOptions} data={chartData} />
          </div>
        </div>
      </div>
    </section>
  )
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Skeleton className="size-6 rounded-full" />
      Loading…
    </div>
  )
}

function createChartData(graph: MainGraphPayload) {
  // Plausible-like palette with better contrast on dark backgrounds
  // const isDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  // Borrow hues from Live View metric card sparkline (cyan)
  const CYAN = 'rgba(56, 189, 248, 1)'            // sky-400
  const CYAN_SOFT = 'rgba(56, 189, 248, 0.55)'
  const CYAN_FILL = 'rgba(56, 189, 248, 0.10)'
  const CYAN_FILL_SOFT = 'rgba(56, 189, 248, 0.08)'

  const PRIMARY_STROKE = CYAN
  const PRIMARY_FILL_START = CYAN_FILL
  const COMP_STROKE = CYAN_SOFT
  const COMP_POINT = CYAN_SOFT
  const COMP_POINT_HOVER = 'rgba(56, 189, 248, 0.9)'
  const COMP_FILL_START = CYAN_FILL_SOFT

  const datasets: ChartDataset<'line', number[]>[] = [
    {
      label: graph.metric,
      data: graph.plot,
      borderColor: PRIMARY_STROKE,
      backgroundColor: (context) => {
        const ctx = context.chart.ctx
        const gradient = ctx.createLinearGradient(0, 0, 0, 300)
        gradient.addColorStop(0, PRIMARY_FILL_START)
        gradient.addColorStop(1, 'rgba(101, 116, 205, 0)')
        return gradient
      },
      tension: 0, // Straight lines, not curved
      fill: true,
      pointRadius: 0,
      pointBackgroundColor: PRIMARY_STROKE,
      pointHoverBackgroundColor: 'rgba(71, 87, 193, 1)',
      pointBorderColor: 'transparent',
      pointHoverRadius: 3,
      borderWidth: 2.25
    }
  ]

  if (graph.comparisonPlot) {
    datasets.push({
      label: 'Comparison',
      data: graph.comparisonPlot,
      borderDash: [5, 4],
      borderColor: COMP_STROKE,
      backgroundColor: (context) => {
        const ctx = context.chart.ctx
        const gradient = ctx.createLinearGradient(0, 0, 0, 300)
        gradient.addColorStop(0, COMP_FILL_START)
        gradient.addColorStop(1, 'rgba(101, 116, 205, 0)')
        return gradient
      },
      tension: 0,
      pointRadius: 0,
      pointBackgroundColor: COMP_POINT,
      pointHoverBackgroundColor: COMP_POINT_HOVER,
      pointBorderColor: 'transparent',
      pointHoverRadius: 3,
      fill: true,
      borderWidth: 2,
      yAxisID: 'y' // Use same y-axis
    })
  }

  return {
    labels: graph.labels,
    datasets
  }
}

function createChartOptions(graph: MainGraphPayload, period: string, tz: string, mouseYRef: React.MutableRefObject<number | null>) {
  const METRIC_LABELS: Record<string, string> = {
    visitors: 'Visitors',
    visits: 'Visits',
    pageviews: 'Pageviews',
    views_per_visit: 'Views per visit',
    bounce_rate: 'Bounce rate',
    visit_duration: 'Visit duration'
  }
  const metricFormatter = (val: number): string => {
    const m = graph.metric
    if (m === 'visit_duration') return durationFormatter(val)
    if (m === 'bounce_rate' || m === 'conversion_rate' || m === 'scroll_depth') return `${val.toFixed(2)}%`
    if (m === 'views_per_visit') return val.toFixed(2)
    return numberShortFormatter(val)
  }

  const externalTooltip = (ctx: any) => {
    const { chart, tooltip } = ctx
    let el = chart.canvas.parentNode.querySelector('.analytics-tooltip') as HTMLDivElement | null
    if (!el) {
      el = document.createElement('div')
      el.className = 'analytics-tooltip'
      el.style.position = 'absolute'
      el.style.pointerEvents = 'none'
      el.style.background = 'rgba(17, 19, 27, 0.95)'
      el.style.border = '1px solid rgba(255,255,255,0.12)'
      el.style.borderRadius = '10px'
      el.style.padding = '10px 12px'
      el.style.color = 'rgba(255,255,255,0.9)'
      el.style.zIndex = '60'
      el.style.minWidth = '220px'
      el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35)'
      chart.canvas.parentNode.appendChild(el)
    }

    if (tooltip.opacity === 0) {
      el.style.opacity = '0'
      return
    }

    const idx = tooltip.dataPoints?.[0]?.dataIndex ?? 0
    const labelISO = graph.labels[idx]
    const comparisonISO = graph.comparisonLabels?.[idx]

    const shouldShowYear = hasMultipleYears(graph.labels)
    const baseTitle = METRIC_LABELS[graph.metric] || graph.metric

    const fmtPrimary = (() => {
      if (!labelISO) return ''
      if (graph.interval === 'hour') return `${formatDay(labelISO, shouldShowYear, tz)}, ${formatHour(labelISO, tz)}`
      if (graph.interval === 'minute') return formatHour(labelISO, tz)
      if (graph.interval === 'month') return formatMonth(labelISO, tz)
      return formatDay(labelISO, shouldShowYear, tz)
    })()

    const fmtComparison = (() => {
      if (!comparisonISO) return null
      if (graph.interval === 'hour') return `${formatDay(comparisonISO, hasMultipleYears(graph.comparisonLabels || []), tz)}, ${formatHour(comparisonISO, tz)}`
      if (graph.interval === 'minute') return formatHour(comparisonISO, tz)
      if (graph.interval === 'month') return formatMonth(comparisonISO, tz)
      return formatDay(comparisonISO, hasMultipleYears(graph.comparisonLabels || []), tz)
    })()

    const currentVal = Number(graph.plot[idx] ?? 0)
    const comparisonVal = graph.comparisonPlot ? Number(graph.comparisonPlot[idx] ?? 0) : null
    const changePct = comparisonVal && comparisonVal !== 0 ? ((currentVal - comparisonVal) / comparisonVal) * 100 : null

    const up = changePct != null && changePct >= 0
    const changeStr = changePct == null ? '' : `${up ? '▲' : '▼'} ${Math.round(Math.abs(changePct))}%`
    const changeColor = up ? '#34d399' : '#fb7185'

    // Colors based on datasets
    const ds = chart.config.data.datasets || []
    const primaryColor = (ds[0]?.borderColor as string) || 'rgba(96,165,250,1)'
    const compColor = (ds[1]?.borderColor as string) || 'rgba(167,139,250,0.75)'

    const primaryValStr = metricFormatter(currentVal)
    const compValStr = comparisonVal == null ? null : metricFormatter(comparisonVal)

    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.alignItems = 'center'
    header.style.gap = '12px'
    header.style.marginBottom = '6px'

    const title = document.createElement('div')
    title.style.fontWeight = '800'
    title.style.fontSize = '16px'
    title.style.lineHeight = '1.2'
    title.textContent = baseTitle
    header.appendChild(title)

    if (changePct != null) {
      const change = document.createElement('div')
      change.style.marginLeft = 'auto'
      change.style.fontWeight = '600'
      change.style.color = changeColor
      change.textContent = changeStr
      header.appendChild(change)
    }

    const grid = document.createElement('div')
    grid.style.display = 'grid'
    grid.style.gridTemplateColumns = 'auto 1fr auto'
    grid.style.gap = '6px 10px'
    grid.style.alignItems = 'center'

    const primaryDot = document.createElement('span')
    primaryDot.style.width = '10px'
    primaryDot.style.height = '10px'
    primaryDot.style.borderRadius = '50%'
    primaryDot.style.background = primaryColor
    primaryDot.style.display = 'inline-block'

    const primaryLabel = document.createElement('div')
    primaryLabel.style.opacity = '0.85'
    primaryLabel.style.fontSize = '13px'
    primaryLabel.textContent = fmtPrimary

    const primaryValue = document.createElement('div')
    primaryValue.style.fontWeight = '800'
    primaryValue.style.fontSize = '16px'
    primaryValue.textContent = primaryValStr

    grid.appendChild(primaryDot)
    grid.appendChild(primaryLabel)
    grid.appendChild(primaryValue)

    if (compValStr != null) {
      const compDot = document.createElement('span')
      compDot.style.width = '10px'
      compDot.style.height = '10px'
      compDot.style.borderRadius = '50%'
      compDot.style.background = compColor
      compDot.style.display = 'inline-block'
      compDot.style.opacity = '0.7'

      const compLabel = document.createElement('div')
      compLabel.style.opacity = '0.65'
      compLabel.style.fontSize = '13px'
      compLabel.textContent = fmtComparison || ''

      const compValue = document.createElement('div')
      compValue.style.fontWeight = '800'
      compValue.style.fontSize = '16px'
      compValue.style.opacity = '0.85'
      compValue.textContent = compValStr

      grid.appendChild(compDot)
      grid.appendChild(compLabel)
      grid.appendChild(compValue)
    }

    el.replaceChildren(header, grid)

    const parent = chart.canvas.parentNode as HTMLElement
    const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas
    el.style.opacity = '1'

    // Use tracked mouse Y position or fall back to caret Y
    const mouseY = mouseYRef.current ?? tooltip.caretY

    // Position tooltip top-left corner at mouse cursor
    let left = positionX + tooltip.caretX
    let top = positionY + mouseY

    // Clamp to container bounds
    const minX = 6
    const maxX = parent.clientWidth - el.offsetWidth - 6
    const minY = 6
    const maxY = parent.clientHeight - el.offsetHeight - 6
    if (left < minX) left = minX
    if (left > maxX) left = maxX
    if (top < minY) top = minY
    if (top > maxY) top = maxY
    el.style.left = left + 'px'
    el.style.top = top + 'px'
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event: any, _activeElements: any, chart: any) => {
      // Track mouse Y position relative to canvas
      if (event.native) {
        const canvasPosition = chart.canvas.getBoundingClientRect()
        mouseYRef.current = event.native.clientY - canvasPosition.top
      }
      // Change cursor to pointer when hovering over chart
      chart.canvas.style.cursor = 'pointer'
    },
    interaction: {
      mode: 'index' as const,
      intersect: false
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: false,
        external: externalTooltip
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: 'rgba(255, 255, 255, 0.5)',
          callback: function (value: number | string) {
            const num = Number(value)
            // Plausible shows whole numbers on Y-axis for views per visit
            if (graph.metric === 'views_per_visit') return String(Math.round(num))
            return metricFormatter(num)
          }
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.06)',
          drawBorder: false
        }
      },
      x: {
        ticks: {
          maxRotation: 0,
          maxTicksLimit: 8,
          autoSkip: true,
          autoSkipPadding: 20,
          color: 'rgba(255, 255, 255, 0.5)',
          callback: function (val: number | string) {
            // Use Chart.js label mapping like Plausible
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const scale = this as any
            const label: string = scale.getLabelForValue(val)
            if (!label || label === '__blank__') return ''

            const shouldShowYear = hasMultipleYears(graph.labels)

            if (graph.interval === 'hour' && period !== 'day') {
              const d = formatDay(label, shouldShowYear, tz)
              const h = formatHour(label, tz)
              return `${d}, ${h}`
            }
            if (graph.interval === 'minute' && period !== 'realtime') {
              return formatHour(label, tz)
            }

            switch (graph.interval) {
              case 'minute':
              case 'hour':
                return formatHour(label, tz)
              case 'day':
              case 'week':
                return formatDay(label, shouldShowYear, tz)
              case 'month':
                return formatMonth(label, tz)
              default:
                return formatDay(label, shouldShowYear, tz)
            }
          }
        },
        grid: {
          display: false
        }
      }
    }
  }
}

type TopStatsGridProps = {
  stats: TopStat[]
  graphableMetrics: string[]
  selectedMetric: string
  onSelectMetric: (metric: string) => void
  comparingFrom?: string | null
  comparingTo?: string | null
  period?: string
  timezone?: string
  showComparison?: boolean
  primaryFrom?: string
  primaryTo?: string
}

function TopStatsGrid({ stats, graphableMetrics, selectedMetric, onSelectMetric, comparingFrom, comparingTo, period = 'day', timezone = dayjs.tz.guess(), showComparison = false, primaryFrom, primaryTo }: TopStatsGridProps) {
  const selectable = new Set(graphableMetrics)

  // Filter out "Live visitors" - it's shown in the top bar, not as a graphable metric
  const displayStats = stats.filter((stat) => stat.graphMetric !== 'currentVisitors')

  const items = displayStats.map((stat) => {
    const canSelect = stat.graphMetric && selectable.has(stat.graphMetric)
    const isSelected = canSelect && stat.graphMetric === selectedMetric
    const classes = [
      'group flex min-w-[140px] flex-1 flex-col gap-1 px-4 py-3 text-left transition',
      canSelect ? 'hover:bg-white/5 focus:bg-white/8 focus:outline-hidden' : 'cursor-default',
      isSelected ? 'bg-cyan-400/5' : ''
    ]
      .filter(Boolean)
      .join(' ');

    // Primary period label (always shown like Plausible)
    const primaryLabel = formatPrimaryRangeLabel(period, primaryFrom, primaryTo, timezone)

    // Optional comparison value + range label (rendered as two lines like Plausible)
    const hasComparison = showComparison && typeof stat.comparisonValue === 'number' && !Number.isNaN(stat.comparisonValue)
    let comparisonValue: string | null = null
    let comparisonLabel: string | null = null
    if (hasComparison) {
      const comp: TopStat = { ...stat, value: stat.comparisonValue as number }
      comparisonValue = formatTopStatValue(comp)
      comparisonLabel = formatComparisonRangeLabel(comparingFrom, comparingTo, period, timezone)
    }

    return (
      <button
        key={stat.name}
        type="button"
        className={classes}
        onClick={() => {
          if (canSelect && stat.graphMetric) {
            onSelectMetric(stat.graphMetric)
          }
        }}
        disabled={!canSelect}
      >
        <span
          className={[
            'text-[11px] font-semibold uppercase tracking-wide w-fit border-b',
            isSelected ? 'text-cyan-400/70 border-cyan-400' : 'text-foreground/60 border-transparent group-hover:text-cyan-400/50'
          ].join(' ')}
        >
          {stat.name}
        </span>
        <span className="text-xl font-bold tabular-nums text-foreground/90">
          {formatTopStatValue(stat)}
        </span>
        {primaryLabel && showComparison ? (
          <span className="text-xs text-foreground/60">
            {primaryLabel}
          </span>
        ) : null}
        {comparisonValue ? (
          <>
            <span className="text-xl font-bold tabular-nums text-foreground/60">
              {comparisonValue}
            </span>
            {comparisonLabel ? (
              <span className="text-xs text-foreground/60">{comparisonLabel}</span>
            ) : null}
          </>
        ) : null}
        {!showComparison && stat.change != null ? (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium ${
              stat.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {stat.change >= 0 ? '▲' : '▼'} {Math.round(Math.abs(stat.change) * 1000) / 10}%
          </span>
        ) : null}
      </button>
    )
  })

  return (
    <div className="flex flex-wrap divide-y divide-white/12 border-b border-white/12 sm:divide-y-0 sm:divide-x">
      {items}
    </div>
  )
}

// Plausible's exact formatting logic
function numberShortFormatter(num: number): string {
  const THOUSAND = 1000
  const HUNDRED_THOUSAND = 100000
  const MILLION = 1000000
  const HUNDRED_MILLION = 100000000
  const BILLION = 1000000000
  const HUNDRED_BILLION = 100000000000

  if (num >= THOUSAND && num < MILLION) {
    const thousands = num / THOUSAND
    if (thousands === Math.floor(thousands) || num >= HUNDRED_THOUSAND) {
      return Math.floor(thousands) + 'k'
    } else {
      return Math.floor(thousands * 10) / 10 + 'k'
    }
  } else if (num >= MILLION && num < BILLION) {
    const millions = num / MILLION
    if (millions === Math.floor(millions) || num >= HUNDRED_MILLION) {
      return Math.floor(millions) + 'M'
    } else {
      return Math.floor(millions * 10) / 10 + 'M'
    }
  } else if (num >= BILLION) {
    const billions = num / BILLION
    if (billions === Math.floor(billions) || num >= HUNDRED_BILLION) {
      return Math.floor(billions) + 'B'
    } else {
      return Math.floor(billions * 10) / 10 + 'B'
    }
  } else {
    return num.toString()
  }
}

function durationFormatter(duration: number): string {
  const hours = Math.floor(duration / 60 / 60)
  const minutes = Math.floor(duration / 60) % 60
  const seconds = Math.floor(duration - minutes * 60 - hours * 60 * 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  } else if (minutes > 0) {
    const paddedSeconds = seconds.toString().padStart(2, '0')
    return `${minutes}m ${paddedSeconds}s`
  } else {
    return `${seconds}s`
  }
}

function formatTopStatValue(stat: TopStat) {
  const value = Number(stat.value ?? 0)

  // Prefer explicit metric key when present for stable formatting
  const metric = (stat.graphMetric || '').toString().toLowerCase()
  switch (metric) {
    case 'bounce_rate':
    case 'conversion_rate':
    case 'scroll_depth':
      return `${value.toFixed(2)}%`
    case 'visit_duration':
      return durationFormatter(value)
    case 'views_per_visit':
      return value.toFixed(2)
    case 'visitors':
    case 'visits':
    case 'pageviews':
      return numberShortFormatter(value)
    default: {
      // Fallback to name heuristics (covers rare tiles without graphMetric)
      const name = (stat.name || '').toLowerCase()
      if (name.includes('rate') || name.includes('scroll')) return `${value.toFixed(2)}%`
      if (name.includes('duration') || name.includes('time on')) return durationFormatter(value)
      if (name.includes('views per')) return value.toFixed(2)
      return numberShortFormatter(value)
    }
  }
}

// Format the comparison period label to mirror Plausible cards
function formatComparisonRangeLabel(fromISO?: string | null, toISO?: string | null, period = 'day', tz = dayjs.tz.guess()) {
  if (!fromISO && !toISO) return ''
  const from = fromISO ? dayjs.utc(fromISO).tz(tz) : null
  const to = toISO ? dayjs.utc(toISO).tz(tz) : null

  // Helper formatters
  const fmtDay = (d: dayjs.Dayjs) => d.format('ddd, D MMM YYYY')
  const fmtMonth = (d: dayjs.Dayjs) => d.format('MMM YYYY')

  // Prefer concise single-labels when the comparison covers a whole day/month/year
  if (period === 'day' && from) return fmtDay(from)

  if (period === 'month' && from && to) {
    const isFullMonth = from.date() === 1 && to.endOf('month').isSame(to)
    if (isFullMonth) return fmtMonth(from)
  }

  if (period === 'year' && from && to) {
    const isFullYear = from.month() === 0 && from.date() === 1 && to.month() === 11 && to.date() === 31
    if (isFullYear) return from.format('YYYY')
  }

  // Generic fallback: compact range
  if (from && to) return `${from.format('D MMM YYYY')} – ${to.format('D MMM YYYY')}`
  if (from) return fmtDay(from)
  if (to) return fmtDay(to)
  return ''
}

function formatPrimaryRangeLabel(period?: string, fromISO?: string | null, toISO?: string | null, tz = dayjs.tz.guess()) {
  if (!period) return ''
  if (fromISO) {
    const from = dayjs.utc(fromISO).tz(tz)
    const to = toISO ? dayjs.utc(toISO).tz(tz) : null
    switch (period) {
      case 'day':
        return from.format('ddd, D MMM')
      case 'month':
        return from.format('MMM YYYY')
      case 'year':
        return from.format('YYYY')
      default:
        if (to) return `${from.format('D MMM YYYY')} – ${to.format('D MMM YYYY')}`
        return from.format('D MMM YYYY')
    }
  }
  return ''
}

type IntervalPickerProps = {
  interval: string
  onChange: (interval: string) => void
}

function IntervalPicker({ interval, onChange }: IntervalPickerProps) {
  // Determine allowed options similar to Plausible
  const { query } = useQueryContext()
  const options = (() => {
    switch (query.period) {
      case 'realtime':
        return ['minute']
      case 'day':
        return ['minute', 'hour']
      case '7d':
        return ['hour', 'day']
      case '28d':
      case '30d':
        return ['day', 'week']
      case '91d':
        return ['day', 'week', 'month']
      case 'month':
        return ['day', 'week']
      case '12mo':
      case 'year':
      case 'all':
      case 'custom':
        return ['day', 'week', 'month']
      default:
        return ['day']
    }
  })()

  const currentLabel = INTERVAL_LABELS[interval] || interval

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="link" size="sm" className="text-primary">
          {currentLabel}
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((opt) => (
          <DropdownMenuItem key={opt} onClick={() => onChange(opt)} data-selected={opt === interval}>
            <span className={opt === interval ? 'font-semibold' : ''}>{INTERVAL_LABELS[opt]}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
