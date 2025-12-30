import '@vitejs/plugin-react/preamble'
import '@/entrypoints/analytics.css'
import { createInertiaApp } from '@inertiajs/react'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'

type ResolvedComponent = {
  default: ComponentType
}

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob<ResolvedComponent>('../pages/**/*.tsx')
    const loader = pages[`../pages/${name}.tsx`]
    if (!loader) {
      console.error(`Missing Inertia page component: '${name}.tsx'`)
      return Promise.reject(new Error(`Missing Inertia page component: '${name}.tsx'`))
    }
    return loader()
  },
  setup({ el, App, props }) {
    if (!el) return
    createRoot(el).render(createElement(App, props))
  }
})
