import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AnalyticsLayoutProps = {
  children: ReactNode
  fullBleed?: boolean
  className?: string
}

export default function AnalyticsLayout({
  children,
  fullBleed = false,
  className
}: AnalyticsLayoutProps) {
  return (
    <div className={cn("min-h-dvh bg-background text-foreground", fullBleed && "flex flex-col")}>
      <main
        className={cn(
          fullBleed ? 'flex flex-1 flex-col min-h-dvh' : 'mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8',
          className
        )}
      >
        {children}
      </main>
    </div>
  )
}
