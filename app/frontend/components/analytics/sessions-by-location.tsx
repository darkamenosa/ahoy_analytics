import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LocationSession = {
  country: string
  city: string
  region?: string
  countryCode: string
  visitors: number
}

export function SessionsByLocation({ sessions }: { sessions: LocationSession[] }) {
  if (!sessions || sessions.length === 0) {
    return (
      <Card className="gap-0 rounded-xl border border-white/12 bg-[#11131b] shadow-[0_12px_26px_rgba(7,9,16,0.32)] py-0">
        <CardHeader className="px-5 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold text-foreground/80">Sessions by location</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4 pt-2">
          <div className="py-4 text-center text-xs text-muted-foreground/80">
            No active sessions
          </div>
        </CardContent>
      </Card>
    )
  }

  const maxVisitors = Math.max(...sessions.map(s => s.visitors))

  return (
    <Card className="gap-0 rounded-xl border border-white/12 bg-[#11131b] shadow-[0_12px_26px_rgba(7,9,16,0.32)] py-0">
      <CardHeader className="px-5 pt-4 pb-2">
        <CardTitle className="text-sm font-semibold text-foreground/80">Sessions by location</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 px-5 pb-4 pt-2">
        {sessions.map((session, i) => {
          const locationParts = [
            session.country,
            session.region,
            session.city
          ].filter(Boolean)

          return (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between text-[12px] text-foreground/80">
                <span className="truncate font-medium text-foreground">
                  {locationParts.join(' - ')}
                </span>
                <span className="ml-2 flex-shrink-0 text-muted-foreground/80">{session.visitors}</span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all duration-300"
                  style={{ width: `${(session.visitors / maxVisitors) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
