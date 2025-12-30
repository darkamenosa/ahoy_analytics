import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fetchSources, fetchReferrers, fetchSearchTerms } from '../api'
import { useQueryContext } from '../query-context'
import { MetricTable } from './list-table'
import type { ListItem, ListPayload, ListMetricKey } from '../types'
import { useSiteContext } from '../site-context'
import RemoteDetailsDialog from './remote-details-dialog'
import DetailsButton from './details-button'
import { PanelTab, PanelTabDropdown, PanelTabs } from './panel-tabs'
import {
  parseDialogFromPath,
  buildDialogPath,
  baseAnalyticsPath,
  buildReferrersPath,
  dialogSegmentForMode,
  modeForSegment
} from '../lib/dialog-path'
import { analyticsPath } from '../lib/base-path'

const CAMPAIGN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'utm-medium', label: 'UTM Mediums' },
  { value: 'utm-source', label: 'UTM Sources' },
  { value: 'utm-campaign', label: 'UTM Campaigns' },
  { value: 'utm-content', label: 'UTM Contents' },
  { value: 'utm-term', label: 'UTM Terms' }
]

const ALLOWED_MODES = ['channels', 'all', ...CAMPAIGN_OPTIONS.map((option) => option.value)]

const TITLE_FOR_MODE: Record<string, string> = {
  channels: 'Top Channels',
  all: 'Top Sources',
  'utm-medium': 'UTM Mediums',
  'utm-source': 'UTM Sources',
  'utm-campaign': 'UTM Campaigns',
  'utm-content': 'UTM Contents',
  'utm-term': 'UTM Terms'
}

const STORAGE_PREFIX = 'admin.analytics.sources'

// Favicon domain mapping - matches Plausible's referer_favicon_domains.json
// Maps categorized source names to their primary domains for favicon fetching
const FAVICON_DOMAIN_MAP: Record<string, string> = {
  'Google': 'google.com',
  'Bing': 'bing.com',
  'DuckDuckGo': 'duckduckgo.com',
  'Yahoo!': 'yahoo.com',
  'Yahoo! Mail': 'mail.yahoo.com',
  'Baidu': 'baidu.com',
  'Yandex': 'yandex.ru',
  'AOL': 'aol.com',
  'Ask': 'ask.com',
  'Ecosia': 'ecosia.org',
  'Qwant': 'qwant.com',
  'Naver': 'naver.com',
  'Seznam': 'seznam.cz',
  'Sogou': 'sogou.com',
  'Startpage': 'startpage.com',
  'Perplexity': 'perplexity.ai',
  'ChatGPT': 'chatgpt.com',
  'Facebook': 'facebook.com',
  'Instagram': 'instagram.com',
  'Twitter': 'twitter.com',
  'LinkedIn': 'linkedin.com',
  'Pinterest': 'pinterest.com',
  'Reddit': 'reddit.com',
  'YouTube': 'youtube.com',
  'TikTok': 'tiktok.com',
  'WhatsApp': 'web.whatsapp.com',
  'Telegram': 'web.telegram.org',
  'Snapchat': 'snapchat.com',
  'Threads': 'threads.net',
  'Discord': 'discord.com',
  'Quora': 'quora.com',
  'VK': 'vk.com',
  'Weibo': 'weibo.com',
  'GitHub': 'github.com',
  'StackOverflow': 'stackoverflow.com',
  'Hacker News': 'news.ycombinator.com',
  'Gmail': 'mail.google.com',
  'Outlook.com': 'mail.live.com'
}

type SourcesPanelProps = {
  initialData: ListPayload
}

export default function SourcesPanel({ initialData }: SourcesPanelProps) {
  const { query, updateQuery } = useQueryContext()
  const site = useSiteContext()

  const [data, setData] = useState<ListPayload>(initialData)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [refDetailsOpen, setRefDetailsOpen] = useState(false)
  const [mode, setMode] = useState(() => {
    // Prefer explicit URL mode first (so copied links restore the tab),
    // then infer from filters (utm > channel), else stored choice.
    const urlMode = (query.mode as string | undefined)
    if (urlMode && ALLOWED_MODES.includes(urlMode)) return urlMode
    const filters = query.filters || {}
    const pickUtmMode = () => {
      if ((filters as any).utm_medium) return 'utm-medium'
      if ((filters as any).utm_source) return 'utm-source'
      if ((filters as any).utm_campaign) return 'utm-campaign'
      if ((filters as any).utm_content) return 'utm-content'
      if ((filters as any).utm_term) return 'utm-term'
      return null
    }
    const utmMode = pickUtmMode()
    if (utmMode) return utmMode
    if (filters.channel) return 'channels'
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}`)
      if (stored && ALLOWED_MODES.includes(stored)) return stored
    }
    return 'channels'
  })

  const applyFilter = useCallback(
    (key: string, value: string) => {
      updateQuery((current) => ({
        ...current,
        filters: { ...current.filters, [key]: value }
      }))
    },
    [updateQuery]
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetchSources(query, { mode }, controller.signal)
      .then(setData)
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error)
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [mode, query])

  // Deep-link: open dialogs based on URL on first mount
  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true

    try {
      const parsed = parseDialogFromPath(window.location.pathname)
      if (parsed.type === 'referrers') {
        const source = parsed.source
        updateQuery((current) => ({
          ...current,
          filters: { ...current.filters, source }
        }))
        setMode('all')
        if (/^google$/i.test(source)) {
          // Mirror Plausible: /referrers/Google opens Google Keywords (Search Terms)
          setDetailsOpen(true)
        } else {
          setRefDetailsOpen(true)
        }
        return
      }
      if (parsed.type === 'segment') {
        const nextMode = modeForSegment(parsed.segment)
        if (nextMode) {
          setAndStoreMode(nextMode)
          setDetailsOpen(true)
        }
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // Auto-switch mode when URL adds/removes specific UTM filters, to mirror Plausible UX.
  useEffect(() => {
    const filters = query.filters || {}
    const utmToMode: Array<[string, string]> = [
      ['utm_medium', 'utm-medium'],
      ['utm_source', 'utm-source'],
      ['utm_campaign', 'utm-campaign'],
      ['utm_content', 'utm-content'],
      ['utm_term', 'utm-term']
    ]
    const next = utmToMode.find(([k]) => Boolean((filters as any)[k]))?.[1]
    if (next && mode !== next) {
      setAndStoreMode(next)
    } else if (!next && filters.channel && mode !== 'channels') {
      // Do not force-switch to 'channels' if the user drilled into Sources from Channels.
      // Respect explicit 'all' (Sources) when present in the query or current UI state.
      if ((query as any).mode !== 'all') {
        setAndStoreMode('channels')
      }
    }
  }, [query.filters])

  // Drilldown for a selected source (when mode === 'all')
  const activeSource = query.filters?.source
  const isGoogleActive = useMemo(() => !!(activeSource && /google/i.test(String(activeSource))), [activeSource])
  const isDirectNoneActive = useMemo(() => {
    if (!activeSource) return false
    const s = String(activeSource).trim().toLowerCase()
    return s === 'direct / none' || s === '(none)' || s === 'direct' || s === 'none'
  }, [activeSource])
  // Allow takeover even for Direct / None (matches Plausible behavior for referrers card)
  const takeOverWithReferrers = useMemo(() => mode === 'all' && !!activeSource && !isGoogleActive, [mode, activeSource, isGoogleActive])
  const [refData, setRefData] = useState<ListPayload | null>(null)
  const [refLoading, setRefLoading] = useState(false)
  const [termsData, setTermsData] = useState<ListPayload | null>(null)
  const [termsLoading, setTermsLoading] = useState(false)

  useEffect(() => {
    if (mode !== 'all' || !activeSource) {
      setRefData(null)
      return
    }
    const controller = new AbortController()
    setRefLoading(true)
    fetchReferrers(query, { source: activeSource }, controller.signal)
      .then(setRefData)
      .catch((error) => { if (error.name !== 'AbortError') console.error(error) })
      .finally(() => setRefLoading(false))
    return () => controller.abort()
  }, [mode, activeSource, query])

  // Fetch search terms when Google is active
  useEffect(() => {
    if (mode !== 'all' || !isGoogleActive) {
      setTermsData(null)
      return
    }
    const controller = new AbortController()
    setTermsLoading(true)
    fetchSearchTerms(query, {}, controller.signal)
      .then(setTermsData)
      .catch((error) => { if (error.name !== 'AbortError') console.error(error) })
      .finally(() => setTermsLoading(false))
    return () => controller.abort()
  }, [mode, isGoogleActive, query])

  // Auto-switch behavior: if we are on 'all' and the 'channel' filter is removed, switch back to 'channels'
  const prevQueryRef = useRef(query)
  useEffect(() => {
    const prev = prevQueryRef.current
    const removedChannel = prev.filters && prev.filters.channel && !query.filters.channel
    if (mode === 'all' && removedChannel) {
      setMode('channels')
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, 'channels')
      }
    }
    prevQueryRef.current = query
  }, [mode, query, site.domain])

  const highlightMetric = useMemo(
    () => (data.metrics.includes('visitors') ? 'visitors' : data.metrics[0]),
    [data.metrics]
  )

  // Card title follows Plausible: "Top Channels" on card, but modal uses
  // "Top Acquisition Channels". For other tabs, both are identical.
  const cardTitle = useMemo(() => {
    if (mode === 'channels') return 'Top Channels'
    if (mode === 'all' && isGoogleActive) return 'Search Terms'
    if (takeOverWithReferrers) return 'Top Referrers'
    return TITLE_FOR_MODE[mode] ?? 'Top Sources'
  }, [mode, isGoogleActive, takeOverWithReferrers])

  const dialogTitle = useMemo(() => {
    if (mode === 'channels') return 'Top Acquisition Channels'
    return TITLE_FOR_MODE[mode] ?? 'Top Sources'
  }, [mode])
  const campaignActive = useMemo(() => CAMPAIGN_OPTIONS.some((option) => option.value === mode), [mode])
  const campaignLabel = useMemo(() => {
    if (!campaignActive) return 'Campaigns'
    const activeOption = CAMPAIGN_OPTIONS.find((option) => option.value === mode)
    return activeOption?.label ?? 'Campaigns'
  }, [campaignActive, mode])

  const firstColumnLabel = useMemo(() => {
    if (mode === 'channels') return 'Channel'
    if (mode.startsWith('utm-')) {
      const label = CAMPAIGN_OPTIONS.find((opt) => opt.value === mode)?.label || 'Campaign'
      return label.replace(/s$/, '') // Remove trailing 's' for singular
    }
    return 'Source'
  }, [mode])

  const setAndStoreMode = useCallback(
    (value: string) => {
      setMode(value)
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${STORAGE_PREFIX}.${site.domain}`, value)
      }
    },
    [site.domain]
  )

  // Limit card view to top 9 by the first metric; Details keeps full list
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

  // Treat UTM tabs with mostly "(none)" as no usable data, so we don't display a meaningless list
  const isUtmMode = useMemo(() => mode.startsWith('utm-'), [mode])
  const utmHasUsableData = useMemo(() => {
    if (!isUtmMode) return true
    if (!data || !data.results) return false
    const rows = data.results as Array<Record<string, any>>
    const total = rows.reduce((sum, r) => sum + Number(r.visitors ?? 0), 0)
    const nonNone = rows.filter((r) => {
      const name = String(r.name ?? '').trim()
      return name !== '' && name !== '(none)' && name.toLowerCase() !== '(not set)'
    })
    const nonNoneTotal = nonNone.reduce((sum, r) => sum + Number(r.visitors ?? 0), 0)
    if (nonNone.length === 0) return false
    // Hide when non-tagged dominates (>= 90% is (none))
    return (nonNoneTotal / Math.max(total, 1)) >= 0.10
  }, [isUtmMode, data])

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 shadow-[0_12px_26px_rgba(7,9,16,0.32)]" data-testid="sources-panel">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg/6 font-semibold text-foreground/80">{cardTitle}</h2>
        {/* Hide tabs when referrer or search-terms take over, to match Plausible */}
        {takeOverWithReferrers || (mode === 'all' && isGoogleActive) ? null : (
          <PanelTabs>
            <PanelTab active={mode === 'channels'} onClick={() => setAndStoreMode('channels')}>
              Channels
            </PanelTab>
            <PanelTab active={mode === 'all'} onClick={() => setAndStoreMode('all')}>
              Sources
            </PanelTab>
            <PanelTabDropdown
              active={campaignActive}
              label={campaignLabel}
              options={CAMPAIGN_OPTIONS}
              onSelect={setAndStoreMode}
            />
          </PanelTabs>
        )}
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : takeOverWithReferrers ? (
        refLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : !refData || refData.results.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data yet</div>
        ) : (
          <>
            <MetricTable
              data={{ ...refData, metrics: ['visitors'] as ListMetricKey[] }}
              firstColumnLabel="Referrer"
              renderLeading={renderSourceIcon}
              displayBars={false}
              barColorTheme="cyan"
              testId="referrers"
              onRowClick={(item) => {
                if (String(item.name) === 'Direct / None') return
                applyFilter('referrer', String(item.name))
              }}
            />
            <div className="mt-auto flex justify-center pt-3">
              <DetailsButton data-testid="sources-details-btn" onClick={() => {
                setRefDetailsOpen(true)
                try {
                  const sp = new URLSearchParams(window.location.search)
                  sp.delete('dialog')
                  sp.set('mode', mode)
                  const qs = sp.toString()
                  if (activeSource) {
                    const path = buildReferrersPath(activeSource)
                    const url = qs ? `${path}?${qs}` : path
                    window.history.pushState({}, '', url)
                  }
                } catch {}
              }}>Details</DetailsButton>
            </div>
          </>
        )
      ) : (mode === 'all' && isGoogleActive) ? (
        termsLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : (termsData && termsData.results.length > 0) ? (
          <>
            <MetricTable
              data={{ ...termsData, metrics: ['visitors'] as ListMetricKey[] }}
              firstColumnLabel="Search term"
              displayBars={false}
              barColorTheme="cyan"
              testId="search-terms"
            />
            <div className="mt-auto flex justify-center pt-3">
              <DetailsButton onClick={() => {
                setDetailsOpen(true)
                try {
                  const sp = new URLSearchParams(window.location.search)
                  sp.delete('dialog')
                  const qs = sp.toString()
                  // For Google Search Terms, mirror Plausible route
                  window.history.pushState({}, '', buildReferrersPath('Google', qs))
                } catch {}
              }}>Details</DetailsButton>
            </div>
          </>
        ) : (
        <div className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-lg border border-border bg-card p-8 text-center">
          <div className="text-foreground/80 text-lg font-semibold">Search Terms</div>
          <div className="max-w-prose text-sm text-muted-foreground">
            No search terms found for this period. This feature is in development.
          </div>
        </div>
        )
      ) : data.results.length === 0 || (isUtmMode && !utmHasUsableData) ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data yet</div>
      ) : (
        <>
          <MetricTable
            data={limitedData}
            highlightedMetric={highlightMetric ?? 'visitors'}
            onRowClick={(item) => {
              const name = String(item.name)
              if (mode === 'channels') {
                // Follow Plausible: clicking a channel switches to Sources tab with channel filter; no dialog.
                setAndStoreMode('all')
                updateQuery((current) => ({
                  ...current,
                  mode: 'all',
                  filters: { ...current.filters, channel: name }
                }))
                return
              }
              const filterKey = filterKeyForMode(mode)
              applyFilter(filterKey, name)
            }}
            renderLeading={shouldShowIcon(mode) ? renderSourceIcon : undefined}
            displayBars={false}
            firstColumnLabel={firstColumnLabel}
            barColorTheme="cyan"
            testId="sources"
          />
          {!isUtmMode || utmHasUsableData ? (
            <div className="mt-auto flex justify-center pt-3">
              <DetailsButton
                data-testid="sources-details-btn"
                onClick={() => {
                  // If a specific source is active, open Referrer Details instead of Sources
                  if (mode === 'all' && activeSource && !isGoogleActive) {
                    setRefDetailsOpen(true)
                    try {
                      const sp = new URLSearchParams(window.location.search)
                      sp.delete('dialog')
                      const qs = sp.toString()
                      if (activeSource) {
                        window.history.pushState({}, '', buildReferrersPath(String(activeSource), qs))
                      }
                    } catch {}
              } else {
                setDetailsOpen(true)
                try {
                  const sp = new URLSearchParams(window.location.search)
                  sp.delete('dialog')
                  sp.delete('mode')
                  const qs = sp.toString()
                  const stored = (typeof window !== 'undefined') ? localStorage.getItem(`${STORAGE_PREFIX}.${site.domain}`) : null
                  const effectiveMode = (stored && ALLOWED_MODES.includes(stored)) ? (stored as any) : (mode as any)
                  const seg = dialogSegmentForMode(effectiveMode)
                  window.history.pushState({}, '', buildDialogPath(seg, qs))
                } catch {}
              }
                }}
              >
                Details
              </DetailsButton>
            </div>
          ) : null}
        </>
      )}

      {/* Search Terms takes over the card when Google is the active source; no inline drilldown below */}

      {/* Referrer drilldown card - disabled because main card takes over. */}
      {false && mode === 'all' && activeSource && !isGoogleActive && !isDirectNoneActive ? (
        <section className="flex flex-col gap-3 rounded-xl border border-white/12 bg-[#0f121a] p-4">
          <header className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground/80">Top Referrers</h3>
          </header>
          {refLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">Loading…</div>
          ) : !refData || (refData?.results?.length ?? 0) === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No data yet</div>
          ) : (
            <>
              <MetricTable
                data={{ ...(refData as ListPayload), metrics: ['visitors'] as ListMetricKey[] }}
                firstColumnLabel="Referrer"
                renderLeading={renderSourceIcon}
                displayBars={false}
                barColorTheme="indigo"
                onRowClick={(item) => {
                  if (String(item.name) === 'Direct / None') return
                  applyFilter('referrer', String(item.name))
                }}
              />
              <div className="mt-auto flex justify-center pt-1">
                <DetailsButton onClick={() => setRefDetailsOpen(true)}>Details</DetailsButton>
              </div>
            </>
          )}
        </section>
      ) : null}

      <RemoteDetailsDialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open)
          try {
            const sp = new URLSearchParams(window.location.search)
            sp.delete('dialog')
            const qs = sp.toString()
            if (open) {
              if (isGoogleActive) {
                // Keep Google keywords route when Search Terms modal is open
                window.history.pushState({}, '', buildReferrersPath('Google', qs))
              } else {
                const seg = dialogSegmentForMode(mode as any)
                window.history.pushState({}, '', buildDialogPath(seg, qs))
              }
            } else {
              window.history.pushState({}, '', baseAnalyticsPath(qs))
            }
          } catch {}
        }}
          title={isGoogleActive ? 'Google Search Terms' : dialogTitle}
        endpoint={isGoogleActive ? analyticsPath('search_terms') : analyticsPath('sources')}
        extras={isGoogleActive ? {} : { mode }}
        firstColumnLabel={isGoogleActive ? 'Search term' : firstColumnLabel}
        defaultSortKey={isGoogleActive ? undefined : 'visitors'}
        onRowClick={(item) => {
          const filterKey = filterKeyForMode(mode)
          applyFilter(filterKey, String(item.name))
          setDetailsOpen(false)
        }}
        renderLeading={isGoogleActive ? undefined : (shouldShowIcon(mode) ? renderSourceIcon : undefined)}
        sortable={!isGoogleActive}
      />

      {/* Referrer Details modal */}
      {mode === 'all' && activeSource ? (
        <RemoteDetailsDialog
          open={refDetailsOpen}
          onOpenChange={(open) => {
            setRefDetailsOpen(open)
            try {
              const sp = new URLSearchParams(window.location.search)
              sp.delete('dialog')
              const qs = sp.toString()
              if (open && activeSource) {
                window.history.pushState({}, '', buildReferrersPath(String(activeSource), qs))
              } else if (!open) {
                window.history.pushState({}, '', baseAnalyticsPath(qs))
              }
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('Failed to push dialog path', e)
            }
          }}
          title={'Referrer Drilldown'}
          endpoint={analyticsPath('referrers')}
          extras={{ source: activeSource }}
          firstColumnLabel={'Referrer'}
          defaultSortKey={'visitors'}
          onRowClick={(item) => {
            if (String(item.name) === 'Direct / None') return
            applyFilter('referrer', String(item.name))
            setRefDetailsOpen(false)
          }}
          renderLeading={renderSourceIcon}
          getExternalLinkUrl={(item) => {
            const name = String(item.name)
            if (!name || name === 'Direct / None' || name.startsWith('(')) return null
            // If it already looks like a URL with scheme, use as is. Else prefix https://
            return /^(https?:)?\/\//i.test(name) ? (name.startsWith('http') ? name : `https:${name}`) : `https://${name}`
          }}
        />
      ) : null}

    </section>
  )
}

function shouldShowIcon(mode: string) {
  return mode === 'all' || mode === 'utm-source'
}

function filterKeyForMode(mode: string) {
  switch (mode) {
    case 'channels':
      return 'channel'
    case 'utm-medium':
      return 'utm_medium'
    case 'utm-source':
      return 'utm_source'
    case 'utm-campaign':
      return 'utm_campaign'
    case 'utm-content':
      return 'utm_content'
    case 'utm-term':
      return 'utm_term'
    case 'all':
    default:
      return 'source'
  }
}

function renderSourceIcon(item: ListItem) {
  const name = String(item.name ?? '').trim()
  return <SourceIcon name={name} />
}

function SourceIcon({ name }: { name: string }) {
  const [error, setError] = useState(false)
  const slug = name.toLowerCase()

  // Traffic category sources (no real domain) - use emojis directly
  const CATEGORY_EMOJIS: Record<string, string> = {
    'Direct / None': '↩️',
    'Organic Search': '🔍',
    'Organic Social': '👥',
    'Paid Search': '💰',
    'Email': '✉️',
    'Referral': '🔗'
  }

  const fallbackEmoji = (): string | null => {
    if (slug.includes('google')) return '🔍'
    if (slug.includes('facebook')) return '📘'
    if (slug.includes('twitter') || slug.includes('x.com')) return '🐦'
    if (slug.includes('github')) return '🐙'
    if (slug.includes('bing')) return '🅱️'
    if (slug.includes('brave')) return '🦁'
    if (slug.includes('duck')) return '🦆'
    if (slug.includes('email')) return '✉️'
    if (slug.includes('direct') || slug.includes('none')) return '↩️'
    if (slug.includes('linkedin')) return '💼'
    if (slug.includes('youtube')) return '📺'
    if (slug.includes('reddit')) return '🤖'
    if (slug.includes('instagram')) return '📷'
    if (slug.includes('search')) return '🔍'
    if (slug.includes('social')) return '👥'
    if (slug.includes('referral') || slug.includes('link')) return '🔗'
    return null
  }

  if (!name) {
    return fallbackBadge('#')
  }

  // Check if this is a traffic category (not a real domain)
  if (CATEGORY_EMOJIS[name]) {
    return (
      <span className="flex size-6 items-center justify-center text-lg" aria-hidden>
        {CATEGORY_EMOJIS[name]}
      </span>
    )
  }

  // If image failed to load, show emoji or badge
  if (error) {
    const emoji = fallbackEmoji()
    if (emoji) {
      return (
        <span className="flex size-6 items-center justify-center text-lg" aria-hidden>
          {emoji}
        </span>
      )
    }
    return fallbackBadge(name)
  }

  // Plausible proxies favicons through their server for privacy.
  // We use DuckDuckGo directly (same service Plausible uses internally).
  // Derive a safe domain:
  // - Known mappings for categorized sources (e.g. "Google" -> google.com)
  // - If it's a URL, parse and use hostname
  // - If it's a bare domain with a slash, take the hostname part
  // - Otherwise, fall back to emoji/badge for non-domains like "(none)" or "Direct / None"
  let domain: string

  if (FAVICON_DOMAIN_MAP[name]) {
    // Use mapped domain for categorized sources
    domain = FAVICON_DOMAIN_MAP[name]
  } else {
    // Names that should not attempt favicon fetch
    if (/^\(none\)$/i.test(name) || /direct/.test(slug)) {
      const emoji = fallbackEmoji()
      return (
        <span className="flex size-6 items-center justify-center text-lg" aria-hidden>
          {emoji ?? '↩️'}
        </span>
      )
    }

    // Try to parse a full URL
    try {
      let urlStr = name
      if (/^\/\//.test(urlStr)) urlStr = `https:${urlStr}`
      if (!/^https?:/i.test(urlStr) && /\./.test(urlStr)) {
        urlStr = `https://${urlStr}`
      }
      const u = new URL(urlStr)
      domain = u.hostname
    } catch {
      // Fallback: take token before first slash when it looks domain-like
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name)) {
        domain = name.split('/')[0]
      } else {
        // Give up on favicon; show emoji/badge instead
        const emoji = fallbackEmoji()
        return emoji ? (
          <span className="flex size-6 items-center justify-center text-lg" aria-hidden>
            {emoji}
          </span>
        ) : (
          fallbackBadge(name)
        )
      }
    }
  }

  const faviconUrl = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`

  return (
    <span className="flex size-6 items-center justify-center" aria-hidden>
      <img
        src={faviconUrl}
        alt=""
        className="h-5 w-5 shrink-0 object-contain"
        onError={() => setError(true)}
        referrerPolicy="no-referrer"
      />
    </span>
  )
}

function fallbackBadge(value: string) {
  const badge = value.slice(0, 1).toUpperCase() || '#'
  const palette = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700']
  const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const classes = palette[hash % palette.length]
  return (
    <span className={`flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ${classes}`} aria-hidden>
      {badge}
    </span>
  )
}
