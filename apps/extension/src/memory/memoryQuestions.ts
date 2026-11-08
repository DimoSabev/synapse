
import type {
  PersonalMemory,
} from './personalMemory'

export type MemoryAnswer = {
  answer: string
  evidenceIds: string[]
}

export function answerFromMemory(
  question: string,
  memories: PersonalMemory[]
): MemoryAnswer {
  const q = question.toLowerCase().trim()

  if (memories.length === 0) {
    return {
      answer:
        'I do not have any recorded personal activity for this project yet.',
      evidenceIds: [],
    }
  }

  const ordered = [...memories].sort(
    (a, b) =>
      new Date(b.occurred_at).getTime() -
      new Date(a.occurred_at).getTime()
  )

  let selected = ordered.slice(0, 10)

  if (/\btoday\b/.test(q)) {
    const now = new Date()
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )

    selected = ordered.filter(
      (item) =>
        new Date(item.occurred_at).getTime() >=
        start.getTime()
    ).slice(0, 10)
  }

  if (selected.length === 0) {
    return {
      answer:
        'I do not have recorded activity for the requested period.',
      evidenceIds: [],
    }
  }

  const introduction =
    /\b(next|focus|should)\b/.test(q)
      ? 'Here is your recent recorded activity. I cannot determine the best next step from these records alone:'
      : 'Based on your recorded activity:'

  return {
    answer: [
      introduction,
      ...selected.map(
        (item, index) =>
          `${index + 1}. ${item.summary}`
      ),
    ].join('\n'),
    evidenceIds: selected.map((item) => item.id),
  }
}
