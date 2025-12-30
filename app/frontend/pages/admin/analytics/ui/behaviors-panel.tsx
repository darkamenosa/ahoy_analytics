import { useEffect, useMemo, useState } from 'react'

import { fetchBehaviors } from '../api'
import { useQueryContext } from '../query-context'
import type { BehaviorsPayload, ListMetricKey, ListPayload } from '../types'
import { useSiteContext } from '../site-context'
import { MetricTable } from './list-table'
import { PanelTab, PanelTabDropdown, PanelTabs } from './panel-tabs'
import RemoteDetailsDialog from './remote-details-dialog'
import { parseDialogFromPath, buildDialogPath, baseAnalyticsPath } from '../lib/dialog-path'
import { analyticsPath } from '../lib/base-path'
import DetailsButton from './details-button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

const BEHAVIOR_TABS: Array<{ value: string; label: string }> = [
  { value: 'conversions', label: 'Goals' },
  { value: 'props', label: 'Properties' },
  { value: 'funnels', label: 'Funnels' }
]

const STORAGE_PREFIX = 'admin.analytics.behaviors'

type BehaviorsPanelProps = {
  initialData: BehaviorsPayload
}

export default function BehaviorsPanel({ initialData }: BehaviorsPanelProps) {
  const { query, updateQuery } = useQueryContext()
  const site = useSiteContext()

  const behaviourTabs = useMemo(
    () => (site.hasGoals ? BEHAVIOR_TABS : BEHAVIOR_TABS.filter((tab) => tab.value !== 'conversions')),
    [site.hasGoals]
  )

  const defaultMode = behaviourTabs[0]?.value ?? 'props'

  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') {
      return defaultMode
    }
    const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}`)
    return stored && behaviourTabs.some((tab) => tab.value === stored) ? stored : defaultMode
  })
  const [data, setData] = useState<BehaviorsPayload>(initialData)
  const [loading, setLoading] = useState(false)
  const [selectedFunnel, setSelectedFunnel] = useState(() =>
    'funnels' in initialData && initialData.funnels.length > 0 ? initialData.funnels[0] : undefined
  )
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const setAndStoreMode = (value: string) => {
    setMode(value)
    if (typeof window !== 'undefined') {
      localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, value)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchBehaviors(query, { mode, funnel: selectedFunnel }, controller.signal)
      .then((value) => {
        setData(value)
        if ('funnels' in value && !value.funnels.includes(selectedFunnel ?? '')) {
          setSelectedFunnel(value.funnels[0])
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [mode, query, selectedFunnel])

  // Deep-link: open Behaviors dialog if path is /_/behaviors
  useEffect(() => {
    const parsed = parseDialogFromPath(window.location.pathname)
    if (parsed.type === 'segment' && parsed.segment === 'behaviors') {
      setDetailsOpen(true)
    }
  }, [])

  const listPayload: ListPayload | null = useMemo(() => {
    if ('list' in data) {
      return data.list
    }
    if (!('funnels' in data) && 'results' in data) {
      return data as ListPayload
    }
    return null
  }, [data])

  const propertyOptions = useMemo(() => {
    if (mode !== 'props' || !listPayload) {
      return []
    }
    return Array.from(new Set(listPayload.results.map((item) => String(item.name ?? ''))))
  }, [listPayload, mode])

  useEffect(() => {
    if (mode !== 'props') {
      return
    }
    if (propertyOptions.length === 0) {
      setSelectedProperty(null)
      return
    }
    setSelectedProperty((current) => (current && propertyOptions.includes(current) ? current : propertyOptions[0]))
  }, [mode, propertyOptions])

  const tablePayload = useMemo(() => {
    if (!listPayload) return null
    if (mode === 'props') {
      const target = selectedProperty
      const results = listPayload.results
        .filter((item) => (target ? String(item.name) === target : true))
        .map((item) => ({
          ...item,
          name: String((item as Record<string, unknown>).value ?? item.name)
        }))
      return {
        ...listPayload,
        results
      }
    }
    return listPayload
  }, [listPayload, mode, selectedProperty])

  // Limit card view to top 9 by first metric; Details uses full tablePayload
  const limitedTablePayload = useMemo((): ListPayload | null => {
    if (!tablePayload) return null
    const isConversions = mode === 'conversions'
    const metricKey = isConversions ? 'uniques' : (tablePayload.metrics[0] ?? 'visitors')
    const sorted = [...tablePayload.results].sort((a, b) => {
      const av = Number((a as Record<string, unknown>)[metricKey] ?? 0)
      const bv = Number((b as Record<string, unknown>)[metricKey] ?? 0)
      if (av === bv) return String(a.name).localeCompare(String(b.name))
      return bv - av
    })
    const sliced = sorted.slice(0, 9)
    return {
      ...tablePayload,
      metrics: (isConversions ? ['uniques'] : tablePayload.metrics) as ListMetricKey[],
      results: sliced,
      meta: { ...tablePayload.meta, hasMore: tablePayload.results.length > 9 }
    }
  }, [tablePayload, mode])

  const activeTitle = useMemo(() => {
    switch (mode) {
      case 'props':
        return site.propsAvailable ? 'Custom Properties' : 'Properties'
      case 'funnels':
        return 'Funnels'
      case 'conversions':
      default:
        return site.hasGoals ? 'Goal Conversions' : 'Behaviors'
    }
  }, [mode, site.hasGoals, site.propsAvailable])

  const firstColumnLabel = useMemo(() => {
    switch (mode) {
      case 'props':
        return 'Property'
      case 'funnels':
        return 'Step'
      default:
        return 'Goal'
    }
  }, [mode])

  const availableFunnels = useMemo(() => ('funnels' in data ? data.funnels : []), [data])

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-[0_12px_26px_rgba(7,9,16,0.32)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg/6 font-semibold text-foreground/80">{activeTitle}</h2>
        <PanelTabs>
          {behaviourTabs
            .filter((tab) => tab.value !== 'funnels')
            .map((tab) => (
            <PanelTab
              key={tab.value}
              active={mode === tab.value}
              onClick={() => setAndStoreMode(tab.value)}
            >
              {tab.label}
            </PanelTab>
          ))}
          {availableFunnels.length > 0 ? (
            <PanelTabDropdown
              active={mode === 'funnels'}
              label="Funnels"
              options={availableFunnels.map((funnel) => ({ value: funnel, label: funnel }))}
              onSelect={(value) => {
                setSelectedFunnel(value)
                setAndStoreMode('funnels')
              }}
            />
          ) : (
            <PanelTab active={mode === 'funnels'} onClick={() => setAndStoreMode('funnels')}>
              Funnels
            </PanelTab>
          )}
        </PanelTabs>
      </header>
      {!site.hasGoals ? (
        <p className="text-sm text-muted-foreground">
          Goal tracking configuration is coming soon. Explore properties or funnels in the meantime.
        </p>
      ) : null}

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : mode === 'funnels' && 'funnels' in data ? (
        <FunnelSteps data={data} onSelectFunnel={setSelectedFunnel} selectedFunnel={selectedFunnel} />
      ) : tablePayload ? (
        <>
          {mode === 'props' && propertyOptions.length > 0 ? (
            <div className="flex justify-end">
              <PropertyCombobox
                value={selectedProperty ?? undefined}
                options={propertyOptions}
                onChange={setSelectedProperty}
              />
            </div>
          ) : null}
          {mode === 'props' && selectedProperty ? (
            <p className="text-xs font-semibold uppercase text-muted-foreground">{selectedProperty}</p>
          ) : null}
          <MetricTable
            data={limitedTablePayload ?? tablePayload}
            highlightedMetric={
              mode === 'conversions'
                ? 'uniques'
                : (tablePayload.metrics.includes('conversionRate') ? 'conversionRate' : tablePayload.metrics[0])
            }
            onRowClick={(item) => {
              if (mode === 'props') {
                updateQuery((current) => ({
                  ...current,
                  filters: { ...current.filters, prop: String(item.name) }
                }))
              } else {
                updateQuery((current) => ({
                  ...current,
                  filters: { ...current.filters, goal: String(item.name) }
                }))
              }
            }}
            displayBars={false}
            firstColumnLabel={firstColumnLabel}
            barColorTheme="cyan"
          />
          <div className="mt-auto flex justify-center pt-3">
            <DetailsButton onClick={() => {
              setDetailsOpen(true)
              try {
                const sp = new URLSearchParams(window.location.search)
                sp.delete('dialog'); sp.delete('mode')
                window.history.pushState({}, '', buildDialogPath('behaviors', sp.toString()))
              } catch {}
            }}>Details</DetailsButton>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No data available</p>
      )}

      {tablePayload ? (
        <RemoteDetailsDialog
          open={detailsOpen}
          onOpenChange={(open) => {
            setDetailsOpen(open)
            try {
              const sp = new URLSearchParams(window.location.search)
              sp.delete('dialog'); sp.delete('mode')
              const qs = sp.toString()
              if (open) {
                window.history.pushState({}, '', buildDialogPath('behaviors', qs))
              } else {
                window.history.pushState({}, '', baseAnalyticsPath(qs))
              }
            } catch {}
          }}
          title={activeTitle}
          endpoint={analyticsPath('behaviors')}
          extras={{ mode, funnel: selectedFunnel }}
          firstColumnLabel={firstColumnLabel}
          initialSearch={mode === 'props' ? (selectedProperty ?? '') : ''}
          defaultSortKey={tablePayload.metrics.includes('conversionRate') ? 'conversionRate' as ListMetricKey : (tablePayload.metrics[0] as ListMetricKey)}
          onRowClick={(item) => {
            if (mode === 'props') {
              updateQuery((current) => ({
                ...current,
                filters: { ...current.filters, prop: String(item.name) }
              }))
            } else {
              updateQuery((current) => ({
                ...current,
                filters: { ...current.filters, goal: String(item.name) }
              }))
            }
            setDetailsOpen(false)
          }}
        />
      ) : null}
    </section>
  )
}

type FunnelStepsProps = {
  data: Extract<BehaviorsPayload, { funnels: string[]; active: { steps: unknown[] } }>
  selectedFunnel?: string
  onSelectFunnel: (name: string) => void
}

function FunnelSteps({ data, selectedFunnel, onSelectFunnel }: FunnelStepsProps) {
  const funnel = data.active
  if (!funnel) return null

  const steps = funnel.steps
  const maxVisitors = Math.max(...steps.map((step) => step.visitors), 1)
  const overallRate = steps[steps.length - 1]?.conversionRate ?? 0

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-lg font-semibold text-foreground">{funnel.name}</p>
            <p className="text-sm text-muted-foreground">
              {steps.length}-step funnel • {Math.round(overallRate * 1000) / 10}% conversion rate
            </p>
          </div>
          {!onSelectFunnel || data.funnels.length <= 1
            ? null
            : data.funnels.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectFunnel(name)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    name === (selectedFunnel ?? funnel.name)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {name}
                </button>
              ))}
        </div>
      </div>

      <div className="flex items-end gap-6 overflow-x-auto pb-4">
        {steps.map((step) => {
          const heightPercent = Math.max((step.visitors / maxVisitors) * 100, 12)
          return (
            <div key={step.name} className="flex w-20 flex-col items-center gap-3 text-center">
              <div className="relative flex h-48 w-full items-end justify-center">
                <div className="relative h-full w-12 rounded-xs bg-primary/15">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-xs bg-primary"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <div className="absolute -top-12 w-24 rounded-xs bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white shadow-xs">
                  {Math.round(step.conversionRate * 1000) / 10}%
                  <span className="mt-1 block text-[10px] font-normal text-slate-200">
                    {new Intl.NumberFormat('en-US').format(step.visitors)} visitors
                  </span>
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">{step.name}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PropertyCombobox({
  value,
  options,
  onChange
}: {
  value?: string
  options: string[]
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return options
    return options.filter((option) => option.toLowerCase().includes(search.toLowerCase()))
  }, [options, search])

  const label = value ?? 'Select property'

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-between gap-2 rounded-xs border px-3 text-sm font-medium text-foreground shadow-xs hover:bg-muted"
        >
          <span className="max-w-[10rem] truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 p-0">
        <div className="border-b p-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
            placeholder="Search properties"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {filtered.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() => {
                onChange(option)
                setOpen(false)
              }}
              className="cursor-pointer"
            >
              {option}
            </DropdownMenuItem>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
