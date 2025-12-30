import { Line } from 'react-chartjs-2'
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

type SparklineSeries = number[] | { today: number[]; yesterday?: number[] }

type MetricCardProps = {
  title: string
  value: string | number
  change?: number
  sparklineData?: SparklineSeries
  variant?: 'default' | 'large'
  showChange?: boolean
}

export function MetricCard({
  title,
  value,
  change,
  sparklineData,
  variant = 'default',
  showChange = true
}: MetricCardProps) {
  const hasChange = change !== undefined && change !== null && !isNaN(change)
  const isPositive = hasChange && change > 0
  const isNegative = hasChange && change < 0
  const normalized = Array.isArray(sparklineData)
    ? { today: sparklineData, yesterday: undefined as number[] | undefined }
    : (sparklineData || { today: [], yesterday: undefined })
  const showSparkline = normalized.today && normalized.today.length > 0
  const hasMeaningfulChange = isPositive || isNegative

  return (
    <Card className="overflow-hidden rounded-xl border border-white/12 bg-[#11131b] shadow-[0_12px_26px_rgba(7,9,16,0.32)] !py-0">
      <CardContent className="px-5 py-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-foreground/80">{title}</span>

          <div className="grid grid-cols-2 items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span className={variant === 'large' ? 'text-xl font-semibold text-foreground' : 'text-lg font-semibold text-foreground'}>
                {value}
              </span>

              {showChange && (
                hasMeaningfulChange ? (
                  <div className="flex items-center gap-1 text-xs">
                    {isPositive && <ArrowUpIcon className="size-3 text-emerald-400" />}
                    {isNegative && <ArrowDownIcon className="size-3 text-rose-400" />}
                    <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                      {Math.abs(change ?? 0)}%
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">—</span>
                )
              )}
            </div>

            {showSparkline && (
              <div className="ml-auto h-8 w-full max-w-[92px] overflow-hidden rounded-md bg-[#0d0f16]/80">
                <Line
                  data={{
                    labels: Array.from({ length: Math.max(normalized.today.length, normalized.yesterday?.length || 0) }, (_, i) => i),
                    datasets: [
                      ...(normalized.yesterday && normalized.yesterday.length > 0
                        ? [{
                            data: normalized.yesterday,
                            borderColor: 'rgba(56, 189, 248, 0.55)',
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderDash: [3, 3] as [number, number],
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            tension: 0.45,
                            fill: false
                          }]
                        : []),
                      {
                        data: normalized.today,
                        borderColor: 'rgba(56, 189, 248, 1)',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        borderWidth: 1.3,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0.45,
                        fill: true
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { enabled: false }
                    },
                    scales: {
                      x: { display: false },
                      y: { display: false }
                    },
                    interaction: {
                      mode: 'index',
                      intersect: false
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
