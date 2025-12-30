import { useMemo } from 'react'
import { useQueryContext } from '../query-context'
import type {
  BehaviorsPayload,
  DevicesPayload,
  ListPayload,
  MainGraphPayload,
  MapPayload,
  TopStatsPayload
} from '../types'

import { TopStatsProvider } from '../top-stats-context'
import TopBar from './top-bar'
import VisitorGraph from './visitor-graph'
import SourcesPanel from './sources-panel'
import PagesPanel from './pages-panel'
import LocationsPanel from './locations-panel'
import DevicesPanel from './devices-panel'
import BehaviorsPanel from './behaviors-panel'
import { useSiteContext } from '../site-context'

export type AnalyticsDashboardProps = {
  initialTopStats: TopStatsPayload
  initialGraph: MainGraphPayload
  initialSources: ListPayload
  initialPages: ListPayload
  initialLocations: MapPayload | ListPayload
  initialDevices: DevicesPayload
  initialBehaviors: BehaviorsPayload
}

export default function AnalyticsDashboard(props: AnalyticsDashboardProps) {
  const { query } = useQueryContext()
  const site = useSiteContext()
  const isRealtime = useMemo(() => query.period === 'realtime', [query.period])

  return (
    <TopStatsProvider initial={props.initialTopStats}>
      <div className="flex flex-col gap-6 pb-16">
      <TopBar showCurrentVisitors={!isRealtime} />

      <VisitorGraph
        initialGraph={props.initialGraph}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <SourcesPanel initialData={props.initialSources} />
        <PagesPanel initialData={props.initialPages} />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <LocationsPanel initialData={props.initialLocations} />
        <DevicesPanel initialData={props.initialDevices} />
      </section>

      {site.hasGoals ? <BehaviorsPanel initialData={props.initialBehaviors} /> : null}
    </div>
    </TopStatsProvider>
  )
}
