
import { supabase } from '@/lib/supabase'
import { getMemoryConsent } from './personalMemory'

import type {
  BoundContextChangeEvent,
} from '@/context/contextAutoSync'

const MIN_INTERVAL_MS = 3000
const MAX_EVENTS_PER_MINUTE = 12

let recentEvents: number[] = []
let lastEventAt = 0
let inFlight = false

export async function ingestBrowserMemory(
  event: BoundContextChangeEvent,
  isStillAuthorized: () => boolean
): Promise<void> {
  if (!isStillAuthorized()) return

  const now = Date.now()

  recentEvents = recentEvents.filter(
    time => now - time < 60_000
  )

  if (
    inFlight ||
    now - lastEventAt < MIN_INTERVAL_MS ||
    recentEvents.length >= MAX_EVENTS_PER_MINUTE
  ) {
    return
  }

  // Reserve the rate-limit slot before any await.
  lastEventAt = now
  recentEvents.push(now)
  inFlight = true

  try {
    const consent = await getMemoryConsent(
      event.projectId,
      event.userId
    )

    if (!consent || !isStillAuthorized()) {
      return
    }

    const { data, error } =
      await supabase.auth.getUser()

    if (
      error ||
      !data.user ||
      data.user.id !== event.userId ||
      !isStillAuthorized()
    ) {
      return
    }

    const { data: membership, error: memberError } =
      await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', event.projectId)
        .eq('user_id', event.userId)
        .maybeSingle()

    if (
      memberError ||
      !membership ||
      !isStillAuthorized()
    ) {
      return
    }

    // Recheck consent immediately before writing.
    const currentConsent = await getMemoryConsent(
      event.projectId,
      event.userId
    )

    if (
      !currentConsent ||
      !isStillAuthorized()
    ) {
      return
    }

    // Do not send addedText, removedText,
    // page title, URL path, or editor contents.
    const { error: insertError } = await supabase
      .from('personal_browser_events')
      .insert({
        project_id: event.projectId,
        user_id: event.userId,
        event_key: crypto.randomUUID(),
        origin: new URL(event.url).origin,
        editor_id: event.editorId.slice(0, 150),
        change_type: event.change.type,
        captured_at: event.capturedAt,
      })

    if (insertError) throw insertError

    console.log(
      '[Synapse] Browser memory event stored:',
      {
        projectId: event.projectId,
        changeType: event.change.type,
      }
    )
  } catch (error) {
    console.error(
      '[Synapse] Browser memory ingestion failed:',
      error
    )
  } finally {
    inFlight = false
  }
}
