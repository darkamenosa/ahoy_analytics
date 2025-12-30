import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { Head } from "@inertiajs/react";
import AnalyticsLayout from "@/layouts/analytics-layout";
// Avoid importing the VisitorGlobe module at SSR time. It pulls in browser‑only
// three.js/three-globe dependencies. Use React.lazy so SSR renders a fallback
// and the heavy code loads only on the client.
const VisitorGlobe = lazy(() =>
  import("@/components/analytics/visitor-globe").then((m) => ({ default: m.VisitorGlobe }))
)

// Lightweight local types and constants to avoid touching the heavy module during SSR
type VisitorGlobeZoomState = {
  distance: number
  minDistance: number
  maxDistance: number
}
type VisitorGlobeHandle = {
  zoomIn: () => void
  zoomOut: () => void
  getDistance: () => number
  focusOn: (lat: number, lng: number, distance?: number) => void
  flyTo: (lat: number, lng: number, distance?: number, durationMs?: number) => void
  getView: () => { lat: number; lng: number; distance: number }
}
const VISITOR_GLOBE_MIN_DISTANCE = 1.8
const VISITOR_GLOBE_MAX_DISTANCE = 3.2
import { MetricCard } from "@/components/analytics/metric-card";
import { SessionsByLocation } from "@/components/analytics/sessions-by-location";
import { Input } from "@/components/ui/input";
import { geocodeOsm } from "@/lib/geocode";
import { Button } from "@/components/ui/button";
import { Search, Maximize2, Minimize2, Minus, Plus, Eye, EyeOff, X, Loader2 } from "lucide-react";
import { getConsumer, type Subscription } from "@/lib/cable";

type VisitorDot = {
  lat: number;
  lng: number;
  type: "visitor";
  ts?: number; // epoch ms (optional; used for client-side fading)
  city?: string | null;
};

type LocationSession = {
  country: string;
  city: string;
  region?: string;
  countryCode: string;
  visitors: number;
};

type SparklinePair = { today: number[]; yesterday: number[] }

type LiveStats = {
  currentVisitors: number;
  todayVisitors: {
    count: number;
    change: number;
    sparkline?: SparklinePair;
  };
  todaySessions: {
    count: number;
    change: number;
    sparkline: SparklinePair;
  };
  todayPageviews: {
    count: number;
    change: number;
    sparkline: SparklinePair;
  };
  sessionsByLocation: LocationSession[];
  visitorDots: VisitorDot[];
};

const DESKTOP_CARD_WIDTH = 520;
const DESKTOP_GAP = 24;
const DESKTOP_PADDING = 24;
const DESKTOP_HEADER_SPACING = 40;
const DESKTOP_BOTTOM_PADDING = 16;

export default function LiveAnalytics({
  initialStats,
}: {
  initialStats: LiveStats;
}) {
  const [stats, setStats] = useState(initialStats);
  const globeRef = useRef<VisitorGlobeHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [globeZoomState, setGlobeZoomState] = useState<VisitorGlobeZoomState>({
    distance: VISITOR_GLOBE_MAX_DISTANCE,
    minDistance: VISITOR_GLOBE_MIN_DISTANCE,
    maxDistance: VISITOR_GLOBE_MAX_DISTANCE,
  });
  const [areCardsVisible, setAreCardsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const searchAbort = useRef<AbortController | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [desktopFocused, setDesktopFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  // Track current view for hemisphere bias when searching
  const [view, setView] = useState({ lat: 39, lng: -98, distance: VISITOR_GLOBE_MAX_DISTANCE })
  const [isSearching, setIsSearching] = useState(false)

  const zoomAtClosest =
    globeZoomState.distance <= globeZoomState.minDistance + 0.05;
  const zoomAtFarthest =
    globeZoomState.distance >= globeZoomState.maxDistance - 0.05;

  const handleZoomIn = () => {
    if (zoomAtClosest) return;
    globeRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    if (zoomAtFarthest) return;
    globeRef.current?.zoomOut();
  };
  const toggleCardsVisibility = () => {
    setAreCardsVisible((visible) => !visible);
  };
  const toggleSearchVisibility = () => {
    setIsSearchVisible((visible) => !visible);
    setSuggestions([]);
  };
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
      } catch (err) {
        console.error('Failed to enter fullscreen:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error('Failed to exit fullscreen:', err);
      }
    }
  };

  useEffect(() => {
    setStats(initialStats);
  }, [initialStats]);

  // Subscribe to realtime analytics updates via ActionCable
  useEffect(() => {
    let subscription: Subscription | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        setConnectionStatus('connecting');
        const consumer = getConsumer();
        subscription = consumer.subscriptions.create({ channel: "AhoyAnalytics::AnalyticsChannel" }, {
          connected: () => {
            setConnectionStatus('connected');
          },
          disconnected: () => {
            setConnectionStatus('disconnected');
            // Attempt reconnect after 5 seconds
            reconnectTimeout = setTimeout(() => {
              if (subscription) {
                (subscription as any).unsubscribe?.();
              }
              connect();
            }, 5000);
          },
          received: (data: LiveStats) => {
            setStats((prev) => ({ ...prev, ...data }));
          },
          rejected: () => {
            setConnectionStatus('disconnected');
            console.error("WebSocket connection rejected");
          }
        }) as unknown as Subscription;
      } catch (e) {
        console.error("Cable subscribe failed", e);
        setConnectionStatus('disconnected');
        // Retry connection after 5 seconds
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      try { subscription && (subscription as any).unsubscribe?.(); } catch {}
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);
  const cardsTranslateX = areCardsVisible
    ? 0
    : -(DESKTOP_CARD_WIDTH + DESKTOP_GAP);
  const globeTranslateX = areCardsVisible
    ? (DESKTOP_CARD_WIDTH + DESKTOP_GAP) / 2
    : 0;
  const formattedTimestamp = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  // Geocode search (OSS: Nominatim) – shared for mobile + desktop
  useEffect(() => {
    const open = isSearchVisible || desktopFocused
    if (!open) return
    if (!query || query.trim().length < 2) {
      setSuggestions([])
      setIsSearching(false)
      return
    }
    const ac = new AbortController()
    searchAbort.current?.abort()
    searchAbort.current = ac
    // show spinner immediately while we debounce the network call
    setIsSearching(true)
    const id = setTimeout(async () => {
      try {
        const results = await geocodeOsm(query.trim(), { biasLng: view.lng }, ac.signal)
        setSuggestions(results)
        setActiveIndex(results.length ? 0 : -1)
        setIsSearching(false)
      } catch {}
    }, 300)
    return () => { clearTimeout(id); ac.abort(); setIsSearching(false) }
  }, [query, isSearchVisible, desktopFocused, view.lng])

  return (
    <AnalyticsLayout fullBleed className="p-4 lg:p-6">
      <Head title="Live View - Analytics" />

      <div className="flex flex-1 flex-col overflow-hidden h-full rounded-xl">
        <div className="flex flex-1 flex-col overflow-hidden lg:overflow-visible">
          {/* Mobile Layout */}
          <div className="lg:hidden flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-6">
              {/* Legend and Search */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="size-3 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.55)]" />
                      <span className="text-foreground">Visitors right now</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10"
                      onClick={toggleSearchVisibility}
                      aria-pressed={isSearchVisible}
                    >
                      <Search className="size-4" />
                      <span className="sr-only">
                        {isSearchVisible ? "Hide search" : "Show search"}
                      </span>
                    </Button>
                  </div>
                </div>
                {isSearchVisible && (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Search location"
                      className="pl-9"
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {(query.trim().length === 1 || isSearching || suggestions.length > 0) && (
                      <div className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-white/12 bg-[#11131b] text-sm shadow-lg">
                        {query.trim().length === 1 ? (
                          <div className="px-3 py-2 text-muted-foreground">Type one more character…</div>
                        ) : isSearching && suggestions.length === 0 ? (
                          <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching…</div>
                        ) : (
                          suggestions.map((s, i) => (
                            <button
                              key={`${s.name}-${i}`}
                              className="w-full truncate px-3 py-2 text-left hover:bg-white/5"
                              onClick={() => {
                                setSuggestions([])
                                setIsSearchVisible(false)
                                try { globeRef.current?.flyTo(s.lat, s.lng) } catch {}
                              }}
                            >
                              {s.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Globe */}
              <div className="aspect-square w-full">
                <Suspense fallback={<div className="h-full w-full rounded-xl bg-muted/10" />}> 
                  <VisitorGlobe
                    ref={globeRef}
                    visitors={stats.visitorDots}
                    onViewChange={setView}
                  />
                </Suspense>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  title="Visitors right now"
                  value={stats.currentVisitors}
                  variant="large"
                  showChange={false}
                />
                <MetricCard
                  title="Visitors today"
                  value={stats.todayVisitors.count}
                  change={stats.todayVisitors.change}
                  sparklineData={stats.todayVisitors.sparkline}
                />
                <MetricCard
                  title="Sessions"
                  value={stats.todaySessions.count}
                  change={stats.todaySessions.change}
                  sparklineData={stats.todaySessions.sparkline}
                />
                <MetricCard
                  title="Pageviews"
                  value={stats.todayPageviews.count}
                  change={stats.todayPageviews.change}
                  sparklineData={stats.todayPageviews.sparkline}
                />
              </div>

              {/* Sessions by Location */}
              <div>
                <SessionsByLocation sessions={stats.sessionsByLocation} />
              </div>
            </div>
          </div>

          {/* Desktop Layout */}
          <div ref={containerRef} className="relative hidden flex-1 min-h-0 overflow-hidden bg-[#0f1118] lg:block">
            <div className="absolute inset-0 overflow-hidden">
              <div
                className="h-full w-full transition-transform duration-500 ease-out"
                style={{ transform: `translateX(${globeTranslateX}px)` }}
              >
                <Suspense fallback={<div className="h-full w-full rounded-xl bg-muted/10" />}> 
                  <VisitorGlobe
                    ref={globeRef}
                    visitors={stats.visitorDots}
                    onZoomChange={setGlobeZoomState}
                  />
                </Suspense>
              </div>
            </div>

            <div
              className="absolute z-30 flex items-center gap-3"
              style={{ top: DESKTOP_PADDING, left: DESKTOP_PADDING }}
            >
              <div
                className={`size-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-cyan-400 animate-pulse'
                    : connectionStatus === 'connecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-400'
                }`}
                title={connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}
              />
              <h1 className="text-2xl font-bold">Live View</h1>
              <span className="text-xs text-muted-foreground">
                {formattedTimestamp}
              </span>
              {connectionStatus === 'disconnected' && (
                <span className="text-xs text-red-400">
                  Reconnecting...
                </span>
              )}
              {!areCardsVisible && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 bg-[#11131b]/80 text-foreground border border-white/12 backdrop-blur-sm"
                  onClick={toggleCardsVisibility}
                >
                  <EyeOff className="size-4" />
                  <span className="sr-only">Show analytics cards</span>
                </Button>
              )}
            </div>

            <div
              className="absolute z-30 flex items-center gap-2"
              style={{ top: DESKTOP_PADDING, right: DESKTOP_PADDING }}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  ref={desktopInputRef}
                  placeholder="Search location"
                  className="w-[22rem] pl-9 pr-8 bg-[#11131b]/80 border-white/12 text-foreground"
                  value={query}
                  onFocus={() => setDesktopFocused(true)}
                  onBlur={() => {
                    // Close suggestions shortly after blur unless moving to dropdown
                    setTimeout(() => setDesktopFocused(false), 120)
                  }}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (!suggestions.length) return
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setActiveIndex((i) => Math.max(i - 1, 0))
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      const s = suggestions[activeIndex >= 0 ? activeIndex : 0]
                      if (s) {
                        setSuggestions([])
                        try { globeRef.current?.flyTo(s.lat, s.lng) } catch {}
                      }
                    } else if (e.key === 'Escape') {
                      setSuggestions([])
                      setQuery('')
                    }
                  }}
                />
                {query && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setQuery(''); setSuggestions([]) }}
                    aria-label="Clear search"
                  >
                    <X className="size-4" />
                  </button>
                )}
                {(desktopFocused && (isSearching || suggestions.length > 0 || (query && query.trim().length === 1))) && (
                  <div className="absolute z-20 mt-2 w-[22rem] overflow-hidden rounded border border-white/12 bg-[#11131b] text-sm shadow-lg">
                    {query.trim().length === 1 ? (
                      <div className="px-3 py-2 text-muted-foreground">Type one more character…</div>
                    ) : isSearching && suggestions.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Searching…</div>
                    ) : (
                      suggestions.map((s, i) => (
                        <button
                          key={`${s.name}-${i}`}
                          className={`w-full truncate px-3 py-2 text-left hover:bg-white/5 ${i === activeIndex ? 'bg-white/10' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSuggestions([])
                            try { globeRef.current?.flyTo(s.lat, s.lng) } catch {}
                          }}
                        >
                          {s.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="bg-[#11131b]/80 text-foreground border border-white/12 backdrop-blur-sm"
                onClick={toggleCardsVisibility}
                aria-pressed={areCardsVisible}
              >
                {areCardsVisible ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
                <span className="sr-only">
                  {areCardsVisible
                    ? "Hide analytics cards"
                    : "Show analytics cards"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-[#11131b]/80 text-foreground border border-white/12 backdrop-blur-sm"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize2 className="size-4" />
                ) : (
                  <Maximize2 className="size-4" />
                )}
                <span className="sr-only">
                  {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                </span>
              </Button>
            </div>

            <aside
              className="absolute z-30 flex w-[520px] flex-col"
              style={{
                top: DESKTOP_PADDING + DESKTOP_HEADER_SPACING,
                left: DESKTOP_PADDING,
                bottom: DESKTOP_BOTTOM_PADDING,
                transform: `translateX(${cardsTranslateX}px)`,
                transition: "transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)",
                willChange: "transform",
                pointerEvents: areCardsVisible ? "auto" : "none",
                opacity: areCardsVisible ? 1 : 0,
              }}
            >
              <div className="flex h-full flex-col gap-5 pr-5">
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    title="Visitors right now"
                    value={stats.currentVisitors}
                    showChange={false}
                  />
                  <MetricCard
                    title="Visitors today"
                    value={stats.todayVisitors.count}
                    change={stats.todayVisitors.change}
                    sparklineData={stats.todayVisitors.sparkline}
                  />
                  <MetricCard
                    title="Sessions"
                    value={stats.todaySessions.count}
                    change={stats.todaySessions.change}
                    sparklineData={stats.todaySessions.sparkline}
                  />
                  <MetricCard
                    title="Pageviews"
                    value={stats.todayPageviews.count}
                    change={stats.todayPageviews.change}
                    sparklineData={stats.todayPageviews.sparkline}
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <SessionsByLocation sessions={stats.sessionsByLocation} />
                </div>
              </div>
            </aside>

            <div
              className="pointer-events-none absolute z-30 flex items-end gap-3"
              style={{ bottom: DESKTOP_BOTTOM_PADDING, right: DESKTOP_PADDING }}
            >
              <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/12 bg-[#11131b]/80 px-3 py-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <div className="size-2.5 rounded-full bg-blue-600 ring-1 ring-blue-400/60 shadow-[0_0_6px_rgba(37,99,235,0.6)]" />
                  <span className="text-foreground/80">Visitors right now</span>
                </div>
              </div>
              <div className="pointer-events-auto flex flex-col items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-white/12 bg-[#11131b]/80 text-foreground"
                  onClick={handleZoomIn}
                  disabled={zoomAtClosest}
                >
                  <Plus className="size-4" />
                  <span className="sr-only">Zoom in</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="border border-white/12 bg-[#11131b]/80 text-foreground"
                  onClick={handleZoomOut}
                  disabled={zoomAtFarthest}
                >
                  <Minus className="size-4" />
                  <span className="sr-only">Zoom out</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AnalyticsLayout>
  );
}
