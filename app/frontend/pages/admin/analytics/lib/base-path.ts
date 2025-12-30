type AnalyticsWindowConfig = {
  basePath?: string
  cablePath?: string
}

declare global {
  interface Window {
    AhoyAnalytics?: AnalyticsWindowConfig
  }
}

export function analyticsBasePath() {
  if (typeof window === 'undefined') return '/admin/analytics'
  const base = window.AhoyAnalytics?.basePath || '/admin/analytics'
  return base.replace(/\/+$/, '')
}

export function analyticsPath(path: string = '') {
  const base = analyticsBasePath()
  if (!path) return base
  const trimmed = path.replace(/^\/+/, '')
  return `${base}/${trimmed}`
}

export function analyticsCablePath() {
  if (typeof window === 'undefined') return '/cable'
  return window.AhoyAnalytics?.cablePath || '/cable'
}
