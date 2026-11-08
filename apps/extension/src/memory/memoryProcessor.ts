
import type {
  NewPersonalMemory,
  PersonalMemory,
} from './personalMemory'

export type ManualProjectUpdate = {
  id: string
  content: string
  created_at: string
}

function cleanText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
}

export function memoryFromManualUpdate(
  update: ManualProjectUpdate
): NewPersonalMemory | null {
  const content = cleanText(update.content)

  if (!content) return null

  return {
    memory_type: 'activity',
    source: 'manual-update',
    source_url: null,
    title: content.slice(0, 100),
    summary: content.slice(0, 2000),
    evidence: {
      source_event_id: update.id,
    },
    event_fingerprint: `manual-update:${update.id}`,
    occurred_at: update.created_at,
  }
}

export function summarizeMemoryTimeline(
  memories: PersonalMemory[]
): string {
  if (memories.length === 0) {
    return 'No recorded activity is available for this project.'
  }

  const ordered = [...memories].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() -
      new Date(b.occurred_at).getTime()
  )

  return ordered
    .map((memory) => {
      const time = new Date(
        memory.occurred_at
      ).toLocaleString()

      return `${time}: ${memory.summary}`
    })
    .join('\n')
}
