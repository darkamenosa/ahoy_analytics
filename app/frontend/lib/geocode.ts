export type GeocodeResult = { name: string; lat: number; lng: number }
export type GeocodeOptions = {
  countryCodes?: string[]
  biasLng?: number // hemisphere bias around this longitude (degrees)
  biasWidthDeg?: number // width of bias viewbox in degrees (default ~160)
  limit?: number
  placeTypes?: string[] // whitelist of Nominatim addresstype/type when category==='place'
}

// Simple OSS geocoder (OpenStreetMap Nominatim). For production, respect usage policy.
export async function geocodeOsm(query: string, optsOrSignal?: GeocodeOptions | AbortSignal, maybeSignal?: AbortSignal): Promise<GeocodeResult[]> {
  const opts: GeocodeOptions | undefined = optsOrSignal instanceof AbortSignal ? undefined : optsOrSignal
  const signal: AbortSignal | undefined = (optsOrSignal instanceof AbortSignal ? optsOrSignal : maybeSignal) || undefined

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', String(opts?.limit ?? 5))
  // Identify requests per Nominatim usage policy. In browsers we cannot set
  // a custom User-Agent header, so provide a contact email in the query.
  // See: https://operations.osmfoundation.org/policies/nominatim/
  const email = (window as any)?.AhoyAnalytics?.geocodeEmail
  if (email) url.searchParams.set('email', email)
  if (opts?.countryCodes?.length) {
    url.searchParams.set('countrycodes', opts.countryCodes.join(','))
  }
  // Bias to current hemisphere via a wide viewbox centered on current longitude
  if (typeof opts?.biasLng === 'number') {
    const width = Math.max(30, Math.min(180, opts.biasWidthDeg ?? 160))
    const left = normalizeLng(opts.biasLng - width / 2)
    const right = normalizeLng(opts.biasLng + width / 2)
    // If the box would cross the antimeridian, skip viewbox to avoid invalid l>r
    if (left < right) {
      // Use almost-full latitude to cover the hemisphere; avoid +/-90 edge cases
      url.searchParams.set('viewbox', `${left},${85},${right},${-85}`)
      // Do not set bounded=1; viewbox here is a boost, not a hard filter
    }
  }
  const res = await fetch(url.toString(), {
    headers: { 'Accept-Language': navigator.language || 'en' },
    method: 'GET',
    signal
  })
  if (!res.ok) return []
  const data = await res.json()
  let rows: any[] = Array.isArray(data) ? data : []
  // Prefer place results with common city/region/country-like types
  const defaultPlaceTypes = opts?.placeTypes ?? [
    'city','town','village','hamlet','suburb','locality',
    'municipality','borough','county','state','region','province','country'
  ]
  const placeRows = rows.filter((d) => d && d.category === 'place' && defaultPlaceTypes.includes(d.type || d.addresstype))
  if (placeRows.length) rows = placeRows
  return rows.map((d: any) => ({
    name: d.display_name as string,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon)
  }))
}

function normalizeLng(lng: number) {
  let x = ((lng + 180) % 360 + 360) % 360 - 180
  if (x === -180) x = 180
  return x
}
