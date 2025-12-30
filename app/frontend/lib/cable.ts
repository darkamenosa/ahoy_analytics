import * as ActionCable from '@rails/actioncable'

let consumer: ActionCable.Cable | null = null

export function getConsumer() {
  if (!consumer) {
    const cablePath = (window as any)?.AhoyAnalytics?.cablePath || '/cable'
    consumer = ActionCable.createConsumer(cablePath)
  }
  return consumer
}

export type Subscription = ActionCable.Channel
