import { Head } from '@inertiajs/react'
import AnalyticsLayout from '@/layouts/analytics-layout'

import { LastLoadProvider } from './last-load-context'
import AnalyticsDashboard from './ui/analytics-dashboard'
import { QueryProvider } from './query-context'
import { SiteProvider } from './site-context'
import { UserProvider } from './user-context'
import type { AnalyticsPageProps } from './types'

export default function AnalyticsShow(props: AnalyticsPageProps) {
  const { site, user, query, topStats, mainGraph, sources, pages, locations, devices, behaviors } = props

  return (
    <AnalyticsLayout>
      <Head title="Analytics Overview" />

      <SiteProvider value={site}>
        <UserProvider value={user}>
          <QueryProvider initialQuery={query}>
            <LastLoadProvider>
              <AnalyticsDashboard
                initialTopStats={topStats}
                initialGraph={mainGraph}
                initialSources={sources}
                initialPages={pages}
                initialLocations={locations}
                initialDevices={devices}
                initialBehaviors={behaviors}
              />
              <div className="mt-10 border-t border-white/12 pt-4 text-xs text-muted-foreground/80">
                This product includes GeoLite2 data created by MaxMind, available from maxmind.com.
              </div>
            </LastLoadProvider>
          </QueryProvider>
        </UserProvider>
      </SiteProvider>
    </AnalyticsLayout>
  )
}
