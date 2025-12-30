import { useCallback, useEffect, useMemo, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import worldTopology from '@/data/countries-110m.json'

import { fetchLocations } from '../api'
import { useQueryContext } from '../query-context'
import type { ListItem, ListPayload, MapPayload } from '../types'
import { useSiteContext } from '../site-context'
import { MetricTable } from './list-table'
import { PanelTab, PanelTabs } from './panel-tabs'
import RemoteDetailsDialog from './remote-details-dialog'
import { numberShortFormatter } from '../lib/number-formatter'
import {
  parseDialogFromPath,
  buildDialogPath,
  baseAnalyticsPath,
  locationsSegmentForMode,
  locationsModeForSegment
} from '../lib/dialog-path'
import { analyticsPath } from '../lib/base-path'
import DetailsButton from './details-button'

const LOCATION_TABS: Array<{ value: string; label: string }> = [
  { value: 'map', label: 'Map' },
  { value: 'countries', label: 'Countries' },
  { value: 'regions', label: 'Regions' },
  { value: 'cities', label: 'Cities' }
]

const STORAGE_PREFIX = 'admin.analytics.locations'
// Vendored TopoJSON to avoid CDN/network issues in dashboards
// Source: https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
const MAP_WIDTH = 720
// Taller intrinsic viewBox so the SVG grows more vertically relative to its width
const MAP_HEIGHT = 576 // 5:4 aspect vs old 2:1
const MAP_MARGIN_X = 12 // horizontal breathing room
const MAP_MARGIN_Y = 0  // remove vertical padding to maximize map height

type LocationsPanelProps = {
  initialData: MapPayload | ListPayload
}

type PanelData = {
  type: 'map'
  payload: MapPayload
} |
  {
    type: 'list'
    payload: ListPayload
  }

export default function LocationsPanel({ initialData }: LocationsPanelProps) {
  const { query, updateQuery } = useQueryContext()
  const site = useSiteContext()

  const [mode, setMode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'map'
    }
    const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}`)
    return stored && LOCATION_TABS.some((tab) => tab.value === stored) ? stored : 'map'
  })
  const [data, setData] = useState<PanelData>(() =>
    'map' in initialData
      ? { type: 'map', payload: initialData as MapPayload }
      : { type: 'list', payload: initialData as ListPayload }
  )
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchLocations(query, { mode }, controller.signal)
      .then((result) => {
        if ('map' in result) {
          setData({ type: 'map', payload: result as MapPayload })
        } else {
          setData({ type: 'list', payload: result as ListPayload })
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [mode, query])

  // Deep-link: open Locations dialog for /_/countries, /_/regions, /_/cities
  useEffect(() => {
    const parsed = parseDialogFromPath(window.location.pathname)
    if (parsed.type === 'segment') {
      const modeFromSeg = locationsModeForSegment(parsed.segment)
      if (modeFromSeg) {
        if (mode !== modeFromSeg) setMode(modeFromSeg)
        setDetailsOpen(true)
      }
    }
  }, [])

  const highlightMetric = useMemo(() => {
    if (data.type === 'list') {
      return data.payload.metrics.includes('visitors') ? 'visitors' : data.payload.metrics[0]
    }
    return 'visitors'
  }, [data])

  const activeTitle = useMemo(() => {
    switch (mode) {
      case 'regions':
        return 'Regions'
      case 'cities':
        return 'Cities'
      case 'countries':
      case 'map':
      default:
        return 'Countries'
    }
  }, [mode])

  const firstColumnLabel = useMemo(() => {
    switch (mode) {
      case 'regions':
        return 'Region'
      case 'cities':
        return 'City'
      default:
        return 'Country'
    }
  }, [mode])

  // Render a country flag for region/city rows when a country filter is active.
  // We intentionally do not attempt per-row geocoding; if no country filter,
  // we omit the flag for regions/cities.
  const renderRegionCityFlag = useCallback(
    (item: ListItem) => {
      // Prefer explicit countryFlag provided by backend (parity with Plausible)
      const explicit = (item as any).countryFlag as string | undefined
      if (explicit && explicit.length <= 6) {
        return <span aria-hidden>{explicit}</span>
      }
      const candidate = String(
        (query.filters && (query.filters as any).country) ||
        (item as any).country ||
        (item as any).alpha2 ||
        (item as any).code ||
        ''
      )
      const flag = flagFromIso2(candidate)
      return flag ? <span aria-hidden>{flag}</span> : null
    },
    [query.filters]
  )

  // Details view now uses a remote modal; build-time list payload no longer needed

  // Limit card view to top 9 only for list modes; keep map view unchanged
  const limitedListPayload = useMemo(() => {
    if (data.type !== 'list') return null
    const metricKey = data.payload.metrics[0] ?? 'visitors'
    const sorted = [...data.payload.results].sort((a, b) => {
      const av = Number(a[metricKey] ?? 0)
      const bv = Number(b[metricKey] ?? 0)
      if (av === bv) return String(a.name).localeCompare(String(b.name))
      return bv - av
    })
    const sliced = sorted.slice(0, 9)
    return { ...data.payload, metrics: ['visitors'] as any, results: sliced, meta: { ...data.payload.meta, hasMore: data.payload.results.length > 9 } }
  }, [data])

  const handleCountrySelect = useCallback(
    (countryCode: string, countryLabel?: string) => {
      updateQuery((current) => {
        const next: any = { ...current, filters: { ...current.filters, country: countryCode } }
        if (countryLabel && countryLabel !== countryCode) {
          next.labels = { ...(current.labels || {}), country: countryLabel }
        }
        return next
      })
      setMode('regions')
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, 'regions')
      }
    },
    [site.domain, updateQuery]
  )

  const handleRegionSelect = useCallback(
    (regionCode: string, regionLabel?: string) => {
      updateQuery((current) => {
        const next: any = { ...current, filters: { ...current.filters, region: regionCode } }
        if (regionLabel && regionLabel !== regionCode) {
          next.labels = { ...(current.labels || {}), region: regionLabel }
        }
        return next
      })
      setMode('cities')
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, 'cities')
      }
    },
    [site.domain, updateQuery]
  )

  const onDetailsRowClick = useCallback(
    (item: ListItem) => {
      if (mode === 'regions') {
        handleRegionSelect(String(item.code ?? item.name), String(item.name))
        setDetailsOpen(false)
      } else if (mode === 'countries' || mode === 'map') {
        handleCountrySelect(String(item.code ?? item.name), String(item.name))
        setDetailsOpen(false)
      }
    },
    [handleCountrySelect, handleRegionSelect, mode]
  )

  return (
    <section className={`flex flex-col ${mode === 'map' ? 'gap-0' : 'gap-5'} rounded-xl border border-border bg-card p-5 shadow-[0_12px_26px_rgba(7,9,16,0.32)]`} data-testid="locations-panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg/6 font-semibold text-foreground/80">{activeTitle}</h2>
        <PanelTabs>
          {LOCATION_TABS.map((tab) => (
            <PanelTab
              key={tab.value}
              active={mode === tab.value}
              onClick={() => {
                setMode(tab.value)
                localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, tab.value)
              }}
            >
              {tab.label}
            </PanelTab>
          ))}
        </PanelTabs>
      </header>

      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : data.type === 'map' ? (
        <>
          <CountriesMap data={data.payload} onSelectCountry={handleCountrySelect} />
          <div className="flex justify-center pt-0">
            <DetailsButton onClick={() => setDetailsOpen(true)}>Details</DetailsButton>
          </div>
        </>
      ) : (
        <>
          {data.payload.results.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data yet</div>
          ) : (
          <MetricTable
            data={limitedListPayload ?? (data as Extract<PanelData, { type: 'list' }>).payload}
            highlightedMetric={highlightMetric ?? 'visitors'}
            onRowClick={(item) => {
              if (mode === 'regions') {
                handleRegionSelect(String(item.code ?? item.name), String(item.name))
              } else if (mode === 'countries') {
                handleCountrySelect(String(item.code ?? item.name), String(item.name))
              } else if (mode === 'cities') {
                updateQuery((current) => ({
                  ...current,
                  filters: { ...current.filters, city: String(item.name) },
                  labels: { ...(current.labels || {}), city: String(item.name) }
                }))
              }
            }}
            renderLeading={(mode === 'regions' || mode === 'cities') ? renderRegionCityFlag : undefined}
            displayBars={false}
            firstColumnLabel={firstColumnLabel}
            barColorTheme="cyan"
            testId="locations"
          />
          )}
          <div className="mt-auto flex justify-center pt-3">
            <DetailsButton data-testid="locations-details-btn" onClick={() => {
              setDetailsOpen(true)
              try {
                const sp = new URLSearchParams(window.location.search)
                sp.delete('dialog'); sp.delete('mode')
                const seg = locationsSegmentForMode(mode as 'map' | 'countries' | 'regions' | 'cities')
                window.history.pushState({}, '', buildDialogPath(seg, sp.toString()))
              } catch {}
            }}>Details</DetailsButton>
          </div>
        </>
      )}

      {
      <RemoteDetailsDialog
        open={detailsOpen}
          onOpenChange={(open) => {
            setDetailsOpen(open)
            try {
              const sp = new URLSearchParams(window.location.search)
              sp.delete('dialog'); sp.delete('mode')
              const qs = sp.toString()
              if (open) {
              const seg = locationsSegmentForMode(mode as 'map' | 'countries' | 'regions' | 'cities')
              window.history.pushState({}, '', buildDialogPath(seg, qs))
              } else {
                window.history.pushState({}, '', baseAnalyticsPath(qs))
              }
            } catch {}
          }}
          title={`Top ${activeTitle}`}
        endpoint={analyticsPath('locations')}
        extras={{ mode: (mode === 'map' ? 'countries' : mode) }}
        firstColumnLabel={firstColumnLabel}
        renderLeading={(mode === 'regions' || mode === 'cities') ? renderRegionCityFlag : undefined}
        defaultSortKey={'visitors'}
        onRowClick={(item) => {
            if (mode === 'cities') {
              updateQuery((current) => {
                const cityName = String(item.name)
                const next: any = { ...current, filters: { ...current.filters, city: cityName } }
                if (current.labels?.city !== cityName) {
                  next.labels = { ...(current.labels || {}), city: cityName }
                }
                return next
              })
              setDetailsOpen(false)
            } else {
              onDetailsRowClick(item)
            }
          }}
        />
      }
    </section>
  )
}

type CountriesMapProps = {
  data: MapPayload
  onSelectCountry: (isoCode: string, label?: string) => void
}

type GeoFeature = any

function CountriesMap({ data, onSelectCountry }: CountriesMapProps) {
  const [features, setFeatures] = useState<GeoFeature[]>([])
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    name: string
    flag?: string | null
    visitors: number
    width: number
    height: number
  } | null>(null)

  useEffect(() => {
    // Build features from local TopoJSON (no network required)
    try {
      const topology: any = worldTopology as any
      const collection = feature(topology, topology.objects.countries) as unknown as { features: GeoFeature[] }
      const filtered = collection.features.filter((f) => {
        const id = String((f as any).id)
        const name = String((f as any).properties?.name || (f as any).properties?.NAME || (f as any).properties?.ADMIN || '')
        if (id === '010') return false // Antarctica ISO numeric code
        if (/antarctica/i.test(name)) return false
        return true
      })
      setFeatures(filtered)
    } catch (error) {
      console.error('Failed to prepare map features', error)
    }
  }, [])

  const lookup = useMemo(() => {
    const map = new Map<string, { visitors: number; code?: string; name: string }>()
    data.map.results.forEach((entry) => {
      const record = {
        visitors: entry.visitors,
        code: entry.code?.toUpperCase(),
        name: entry.name
      }

      // Map by numeric code (used by TopoJSON)
      if (entry.numeric) {
        map.set(entry.numeric, record)
      }

      // Also map by alpha3 and alpha2 for compatibility
      const alpha3 = entry.alpha3?.toUpperCase()
      if (alpha3) {
        map.set(alpha3, record)
      }
      const alpha2 = entry.alpha2?.toUpperCase()
      if (alpha2) {
        map.set(alpha2, record)
      }
    })
    return map
  }, [data])

  // Build a projection that always fits the loaded features with a small margin
  const projection = useMemo(() => {
    const p = geoMercator()
    if (features.length > 0) {
      const fc = { type: 'FeatureCollection', features } as any
      return p.fitExtent(
        [[MAP_MARGIN_X, MAP_MARGIN_Y], [MAP_WIDTH - MAP_MARGIN_X, MAP_HEIGHT - MAP_MARGIN_Y]],
        fc
      )
    }
    // Sensible fallback before features load (same aspect as viewBox)
    return p
      .scale((MAP_WIDTH - 2 * MAP_MARGIN_X) / (2 * Math.PI))
      .translate([MAP_WIDTH / 2, MAP_HEIGHT / 2])
  }, [features])
  const pathGenerator = useMemo(() => geoPath(projection), [projection])
  const max = Math.max(...Array.from(lookup.values()).map((value) => value.visitors), 1)

  return (
    <div className="relative rounded-xs bg-card">
      <svg
        role="img"
        aria-label="World map highlighting visitor distribution"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        <g>
          {features.map((featureItem) => {
            // Try numeric ID first (TopoJSON uses ISO 3166-1 numeric codes)
            const numericId = String(featureItem.id)
            const alpha3Candidate = featureItem.properties?.ISO_A3
            const iso2Candidate = featureItem.properties?.ISO_A2

            const record =
              lookup.get(numericId) ||
              (typeof alpha3Candidate === 'string' && lookup.get(alpha3Candidate.toUpperCase())) ||
              (typeof iso2Candidate === 'string' && lookup.get(iso2Candidate.toUpperCase()))

            const intensity = record ? record.visitors / max : 0
            // Use unified accent ramp for filled countries
            const fill = record
              ? colorForIntensity(intensity)
              : 'color-mix(in oklch, var(--foreground) 12%, transparent)'
            const stroke = record
              ? 'color-mix(in oklch, var(--foreground) 28%, transparent)'
              : 'color-mix(in oklch, var(--foreground) 22%, transparent)'
            const path = pathGenerator(featureItem)
            if (!path) return null

            return (
              <path
                key={(typeof alpha3Candidate === 'string' ? alpha3Candidate : iso2Candidate) ?? path}
                d={path}
                fill={fill}
                stroke={stroke}
                strokeWidth={record ? 1 : 0.5}
                className="cursor-pointer transition-all duration-150 hover:brightness-110"
                onClick={() => {
                  if (record) {
                    onSelectCountry(record.code ?? String(alpha3Candidate ?? iso2Candidate), record.name)
                  }
                }}
                onMouseMove={(event) => {
                  if (!record) {
                    setTooltip(null)
                    return
                  }
                  const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                  if (!bounds) return
                  const pretty = prettifyCountryName(record.name)
                  const flag = flagFromIso2(record.code ?? String(iso2Candidate ?? '')) || null
                  setTooltip({
                    name: pretty,
                    flag,
                    visitors: record.visitors,
                    x: event.clientX - bounds.left,
                    y: event.clientY - bounds.top,
                    width: bounds.width,
                    height: bounds.height
                  })
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })}
        </g>
      </svg>
      {tooltip ? (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: Math.min(tooltip.x + 12, tooltip.width - 200),
            top: Math.min(tooltip.y + 12, tooltip.height - 72),
            // Match the dark chart tooltip shell
            background: 'rgba(17, 19, 27, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '8px 10px',
            color: 'rgba(255,255,255,0.9)',
            minWidth: '160px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
          }}
        >
          <div className="mb-1 flex items-center gap-1.5">
            {tooltip.flag ? (
              <span aria-hidden className="shrink-0" style={{ fontSize: '14px', lineHeight: '18px' }}>
                {tooltip.flag}
              </span>
            ) : null}
            <p
              className="truncate font-extrabold"
              style={{ fontSize: '14px', lineHeight: '18px', color: 'rgba(255,255,255,0.92)' }}
            >
              {tooltip.name}
            </p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-extrabold tabular-nums"
              style={{ fontSize: '18px', lineHeight: '22px', color: 'rgba(255,255,255,0.94)' }}
            >
              {numberShortFormatter(tooltip.visitors)}
            </span>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
              Visitors
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function colorForIntensity(value: number) {
  // Sequential ramp in the single accent family (cyan)
  // Lower intensities: softer tint + more transparency
  // Higher intensities: richer tint + higher opacity
  const clamped = Math.min(Math.max(value, 0.08), 1)
  const tint = Math.round(20 + clamped * 60)   // 20%..80% var(--accent) toward white
  const alpha = Math.round(18 + clamped * 60)  // 18%..78% vs transparent
  const hue = `color-mix(in oklch, var(--data-accent) ${tint}%, white)`
  return `color-mix(in oklch, ${hue} ${alpha}%, transparent)`
}

// Emoji flag from ISO 3166-1 alpha-2
function flagFromIso2(code?: string) {
  if (!code) return ''
  const iso2 = code.toUpperCase()
  if (!/^[A-Z]{2}$/.test(iso2)) return ''
  const A = 0x1f1e6 // regional indicator 'A'
  const chars = Array.from(iso2).map((c) => String.fromCodePoint(A + (c.charCodeAt(0) - 65)))
  return chars.join('')
}

// Prefer short, user-friendly country names for UI tooltips
function prettifyCountryName(name: string): string {
  const str = String(name || '')
  const direct: Record<string, string> = {
    'United States of America (the)': 'United States',
    'United States of America': 'United States',
    'Viet Nam': 'Vietnam'
  }
  if (direct[str]) return direct[str]
  // Trim trailing " (the)"
  const cleaned = str.replace(/\s*\(the\)\s*$/i, '').trim()
  return cleaned
}
