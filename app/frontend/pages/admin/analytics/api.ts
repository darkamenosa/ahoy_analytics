import type {
  AnalyticsQuery,
  BehaviorsPayload,
  DevicesPayload,
  ListPayload,
  MainGraphPayload,
  MapPayload,
  TopStatsPayload
} from './types'
import { analyticsPath } from './lib/base-path'

// --- URL param helpers (Plausible-style f/l scheme) ---
const NOT_URL_ENCODED_CHARACTERS = ':/'

function encodeURIComponentPermissive(input: string, permittedCharacters: string): string {
  let result = encodeURIComponent(input)
  for (const ch of permittedCharacters) {
    const enc = encodeURIComponent(ch)
    if (enc !== ch) {
      // Replace all occurrences without using replaceAll (ES2021)
      result = result.split(enc).join(ch)
    }
  }
  return result
}

function serializeFilterEntry(operator: string, key: string, value: string) {
  // f=<operator>,<dimension>,<clause>
  const op = encodeURIComponentPermissive(operator, NOT_URL_ENCODED_CHARACTERS)
  const dim = encodeURIComponentPermissive(key, NOT_URL_ENCODED_CHARACTERS)
  const clause = encodeURIComponentPermissive(value, NOT_URL_ENCODED_CHARACTERS)
  return `f=${op},${dim},${clause}`
}

function serializeLabelEntry(key: string, label: string) {
  const k = encodeURIComponentPermissive(key, NOT_URL_ENCODED_CHARACTERS)
  const v = encodeURIComponentPermissive(label, NOT_URL_ENCODED_CHARACTERS)
  return `l=${k},${v}`
}

export function buildQueryParams(query: AnalyticsQuery, extras: Record<string, unknown> = {}) {
  const pieces: string[] = []
  const merged: Record<string, unknown> = { ...query, ...extras }

  if (merged.period) pieces.push(`period=${encodeURIComponent(String(merged.period))}`)
  if (merged.comparison) pieces.push(`comparison=${encodeURIComponent(String(merged.comparison))}`)
  if (merged.metric) pieces.push(`metric=${encodeURIComponent(String(merged.metric))}`)
  if (merged.interval) pieces.push(`interval=${encodeURIComponent(String(merged.interval))}`)
  if (merged.mode) pieces.push(`mode=${encodeURIComponent(String(merged.mode))}`)
  if (merged.funnel) pieces.push(`funnel=${encodeURIComponent(String(merged.funnel))}`)
  if (merged.withImported) pieces.push(`with_imported=${encodeURIComponent(String(merged.withImported))}`)
  if ((merged as any).dialog) pieces.push(`dialog=${encodeURIComponent(String((merged as any).dialog))}`)
  if ((merged as any).date) pieces.push(`date=${encodeURIComponent(String((merged as any).date))}`)
  if ((merged as any).from) pieces.push(`from=${encodeURIComponent(String((merged as any).from))}`)
  if ((merged as any).to) pieces.push(`to=${encodeURIComponent(String((merged as any).to))}`)
  if (merged.comparison) {
    if ((merged as any).compareFrom) pieces.push(`compare_from=${encodeURIComponent(String((merged as any).compareFrom))}`)
    if ((merged as any).compareTo) pieces.push(`compare_to=${encodeURIComponent(String((merged as any).compareTo))}`)
    if ((merged as any).matchDayOfWeek != null) pieces.push(`match_day_of_week=${encodeURIComponent(String((merged as any).matchDayOfWeek))}`)
  }

  const filters = (merged.filters as AnalyticsQuery['filters']) || {}
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === '') continue
    pieces.push(serializeFilterEntry('is', key, String(value)))
  }

  // Advanced filters (is_not / contains) — append as repeated f entries
  const advanced = (merged.advancedFilters as AnalyticsQuery['advancedFilters']) || []
  for (const entry of advanced) {
    if (!Array.isArray(entry) || entry.length < 3) continue
    const [op, dim, clause] = entry
    if (!op || !dim || clause == null) continue
    pieces.push(serializeFilterEntry(String(op), String(dim), String(clause)))
  }

  const labels = (merged.labels as AnalyticsQuery['labels']) || {}
  const filtersObj = (merged.filters as AnalyticsQuery['filters']) || {}
  for (const [k, v] of Object.entries(labels)) {
    if (!v) continue
    // Skip numeric label keys (e.g., city ID) — backend maps them to dimension labels.
    if (/^\d+$/.test(k)) continue
    // Only emit a label when there's a corresponding filter present.
    const hasFilter = Object.prototype.hasOwnProperty.call(filtersObj, k)
    if (!hasFilter) continue
    // Avoid duplicate when label equals the filter value (e.g., city "Mumbai").
    const filterVal = (filtersObj as any)[k]
    if (String(filterVal) === String(v)) continue
    pieces.push(serializeLabelEntry(k, String(v)))
  }

  // Extras (pagination/search/sort) remain standard encoding
  for (const [k, v] of Object.entries(extras)) {
    if (v == null) continue
    if (k === 'order_by' && typeof v !== 'string') {
      pieces.push(`${encodeURIComponent(k)}=${encodeURIComponent(JSON.stringify(v))}`)
    } else {
      pieces.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    }
  }

  // Final dedup (idempotent URL): remove any accidental duplicates while preserving order
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const p of pieces) {
    if (seen.has(p)) continue
    seen.add(p)
    deduped.push(p)
  }
  return deduped.join('&')
}

async function fetchJson<T>(path: string, query: AnalyticsQuery, extras: Record<string, unknown> = {}, signal?: AbortSignal) {
  const qs = buildQueryParams(query, extras)
  const response = await fetch(`${path}?${qs}`, {
    headers: { Accept: 'application/json' },
    signal
  })
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export function fetchTopStats(query: AnalyticsQuery, signal?: AbortSignal) {
  return fetchJson<TopStatsPayload>(analyticsPath('top_stats'), query, {}, signal)
}

export function fetchMainGraph(
  query: AnalyticsQuery,
  extras: { metric?: string; interval?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<MainGraphPayload>(analyticsPath('main_graph'), query, extras, signal)
}

export function fetchSources(
  query: AnalyticsQuery,
  extras: { mode?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<ListPayload>(analyticsPath('sources'), query, extras, signal)
}

export function fetchReferrers(
  query: AnalyticsQuery,
  extras: { source: string },
  signal?: AbortSignal
) {
  return fetchJson<ListPayload>(analyticsPath('referrers'), query, extras, signal)
}

export function fetchSearchTerms(
  query: AnalyticsQuery,
  extras: Record<string, unknown> = {},
  signal?: AbortSignal
) {
  return fetchJson<ListPayload>(analyticsPath('search_terms'), query, extras, signal)
}

export function fetchPages(
  query: AnalyticsQuery,
  extras: { mode?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<ListPayload>(analyticsPath('pages'), query, extras, signal)
}

export function fetchLocations(
  query: AnalyticsQuery,
  extras: { mode?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<MapPayload | ListPayload>(analyticsPath('locations'), query, extras, signal)
}

export function fetchDevices(
  query: AnalyticsQuery,
  extras: { mode?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<DevicesPayload>(analyticsPath('devices'), query, extras, signal)
}

export function fetchBehaviors(
  query: AnalyticsQuery,
  extras: { mode?: string; funnel?: string } = {},
  signal?: AbortSignal
) {
  return fetchJson<BehaviorsPayload>(analyticsPath('behaviors'), query, extras, signal)
}

// Generic paginated list fetcher for Details modals
export async function fetchListPage(
  path: string,
  query: AnalyticsQuery,
  extras: Record<string, unknown> = {},
  opts: { limit?: number; page?: number; search?: string; orderBy?: unknown[][] } = {},
  signal?: AbortSignal
) {
  const params: Record<string, unknown> = { ...extras }
  if (typeof opts.limit === 'number') params.limit = String(opts.limit)
  if (typeof opts.page === 'number') params.page = String(opts.page)
  if (typeof opts.search === 'string') params.search = opts.search
  // Send order_by as JSON string following Plausible's pattern: [["metric", "direction"]]
  if (opts.orderBy && Array.isArray(opts.orderBy)) {
    params.order_by = JSON.stringify(opts.orderBy)
  }
  return fetchJson<ListPayload>(path, query, params, signal)
}

export async function exportCsv(query: AnalyticsQuery) {
  const qs = buildQueryParams(query)
  const response = await fetch(`${analyticsPath('export')}?${qs}`, {
    headers: { Accept: 'text/csv' }
  })
  if (!response.ok) {
    throw new Error('Failed to export data')
  }
  return response.blob()
}
