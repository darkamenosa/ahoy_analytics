import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AnalyticsQuery } from './types'
import { buildQueryParams } from './api'

export type QueryContextValue = {
  query: AnalyticsQuery
  updateQuery: (updater: (current: AnalyticsQuery) => AnalyticsQuery) => void
}

const QueryContext = createContext<QueryContextValue | null>(null)

export function QueryProvider({
  initialQuery,
  children
}: {
  initialQuery: AnalyticsQuery
  children: ReactNode
}) {
  const [query, setQuery] = useState<AnalyticsQuery>(initialQuery)
  const isFirstRender = useRef(true)

  const updateQuery = useCallback((updater: (current: AnalyticsQuery) => AnalyticsQuery) => {
    setQuery((current) => updater(current))
  }, [])

  // Keep URL query string in sync with local query state (push new history entries, like Plausible)
  useEffect(() => {
    // Skip initial mount: server already rendered with matching URL
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    try {
      const qs = buildQueryParams(query)
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
      window.history.pushState({}, '', url)
    } catch (e) {
      // Non-fatal: log for debugging
      // eslint-disable-next-line no-console
      console.warn('Failed to update URL params for analytics query', e)
    }
  }, [query])

  const value = useMemo<QueryContextValue>(
    () => ({
      query,
      updateQuery
    }),
    [query, updateQuery]
  )

  return <QueryContext.Provider value={value}>{children}</QueryContext.Provider>
}

export function useQueryContext() {
  const context = useContext(QueryContext)
  if (!context) {
    throw new Error('useQueryContext must be used within a QueryProvider')
  }
  return context
}
