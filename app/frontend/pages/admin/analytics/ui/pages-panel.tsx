import { useCallback, useEffect, useMemo, useState } from 'react'

import { fetchPages } from '../api'
import { useQueryContext } from '../query-context'
import type { ListMetricKey, ListPayload } from '../types'
import { useSiteContext } from '../site-context'
import { MetricTable } from './list-table'
import RemoteDetailsDialog from './remote-details-dialog'
import {
  parseDialogFromPath,
  buildDialogPath,
  baseAnalyticsPath,
  pagesSegmentForMode,
  pagesModeForSegment
} from '../lib/dialog-path'
import { analyticsPath } from '../lib/base-path'
import DetailsButton from './details-button'
import { PanelTab, PanelTabs } from './panel-tabs'

const PAGE_TABS: Array<{ value: string; label: string; short: string }> = [
  { value: 'pages', label: 'Top Pages', short: 'Top Pages' },
  { value: 'entry', label: 'Entry Pages', short: 'Entry Pages' },
  { value: 'exit', label: 'Exit Pages', short: 'Exit Pages' }
]

const TITLE_FOR_MODE: Record<string, string> = {
  pages: 'Top Pages',
  entry: 'Entry Pages',
  exit: 'Exit Pages'
}

const STORAGE_PREFIX = 'admin.analytics.pages'

type PagesPanelProps = {
  initialData: ListPayload
}

export default function PagesPanel({ initialData }: PagesPanelProps) {
  const { query, updateQuery } = useQueryContext()
  const site = useSiteContext()

  const [data, setData] = useState<ListPayload>(initialData)
  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'pages'
    }
    const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}`)
    return stored && PAGE_TABS.some((tab) => tab.value === stored) ? stored : 'pages'
  })
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const highlightMetric = useMemo(
    () => (data.metrics.includes('visitors') ? 'visitors' : data.metrics[0]),
    [data.metrics]
  )

  const activeTitle = useMemo(() => TITLE_FOR_MODE[mode] ?? 'Pages', [mode])

  const firstColumnLabel = useMemo(() => {
    switch (mode) {
      case 'entry':
        return 'Entry page'
      case 'exit':
        return 'Exit page'
      default:
        return 'Page'
    }
  }, [mode])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchPages(query, { mode }, controller.signal)
      .then(setData)
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [mode, query])

  // Deep-link: open Pages dialog for /_/pages, /_/entry-pages, /_/exit-pages
  useEffect(() => {
    const parsed = parseDialogFromPath(window.location.pathname)
    if (parsed.type === 'segment') {
      const modeFromSeg = pagesModeForSegment(parsed.segment)
      if (modeFromSeg) {
        if (mode !== modeFromSeg) setMode(modeFromSeg)
        setDetailsOpen(true)
      }
    }
  }, [])

  const drillKey = useMemo(() => {
    switch (mode) {
      case 'entry':
        return 'entry_page'
      case 'exit':
        return 'exit_page'
      default:
        return 'page'
    }
  }, [mode])

  const drillInto = useCallback(
    (value: string) => {
      updateQuery((current) => ({
        ...current,
        filters: { ...current.filters, [drillKey]: value }
      }))
    },
    [drillKey, updateQuery]
  )

  // Limit card view to top 9 by the first metric; Details uses full list
  const limitedData = useMemo((): ListPayload => {
    const metricKey = data.metrics[0] ?? 'visitors'
    const sorted = [...data.results].sort((a, b) => {
      const av = Number(a[metricKey] ?? 0)
      const bv = Number(b[metricKey] ?? 0)
      if (av === bv) return String(a.name).localeCompare(String(b.name))
      return bv - av
    })
    const sliced = sorted.slice(0, 9)
    return { ...data, metrics: ['visitors'] as ListMetricKey[], results: sliced, meta: { ...data.meta, hasMore: data.results.length > 9 } }
  }, [data])

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-[0_12px_26px_rgba(7,9,16,0.32)]" data-testid="pages-panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg/6 font-semibold text-foreground/80">{activeTitle}</h2>
        <PanelTabs>
          {PAGE_TABS.map((tab) => (
            <PanelTab
              key={tab.value}
              active={mode === tab.value}
              onClick={() => {
                setMode(tab.value)
                localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, tab.value)
              }}
            >
              {tab.short}
            </PanelTab>
          ))}
        </PanelTabs>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : data.results.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data yet</div>
      ) : (
        <>
          <MetricTable
            data={limitedData}
            highlightedMetric={highlightMetric ?? 'visitors'}
            onRowClick={(item) => drillInto(String(item.name))}
            displayBars={false}
            firstColumnLabel={firstColumnLabel}
            metricLabels={mode === 'entry' ? { visitors: 'Unique Entrances' } : (mode === 'exit' ? { visitors: 'Unique Exits' } : undefined)}
            barColorTheme="cyan"
            testId="pages"
          />
          <div className="mt-auto flex justify-center pt-3">
            <DetailsButton data-testid="pages-details-btn" onClick={() => {
              setDetailsOpen(true)
              try {
                const sp = new URLSearchParams(window.location.search)
                sp.delete('dialog'); sp.delete('mode')
                const seg = pagesSegmentForMode(mode as 'pages' | 'entry' | 'exit')
                window.history.pushState({}, '', buildDialogPath(seg, sp.toString()))
              } catch {}
            }}>Details</DetailsButton>
          </div>
        </>
      )}

      <RemoteDetailsDialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          try {
            const sp = new URLSearchParams(window.location.search)
            sp.delete('dialog'); sp.delete('mode')
            const qs = sp.toString()
            if (open) {
              const seg = pagesSegmentForMode(mode as 'pages' | 'entry' | 'exit')
              window.history.pushState({}, '', buildDialogPath(seg, qs))
            } else {
              window.history.pushState({}, '', baseAnalyticsPath(qs))
            }
          } catch {}
        }}
        title={activeTitle}
        endpoint={analyticsPath('pages')}
        extras={{ mode }}
        defaultSortKey={'visitors'}
        firstColumnLabel={firstColumnLabel}
        onRowClick={(item) => {
          drillInto(String(item.name))
          setDetailsOpen(false)
        }}
      />
    </section>
  )
}
