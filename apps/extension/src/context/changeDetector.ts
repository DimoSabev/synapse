
export type TextChange = {
  type: 'added' | 'removed' | 'modified'
  previousText: string
  currentText: string
  addedText: string
  removedText: string
  detectedAt: string
}

export function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function detectTextChange(
  previous: string,
  current: string
): TextChange | null {
  const before = normalizeText(previous)
  const after = normalizeText(current)

  if (before === after) return null

  let prefix = 0

  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    prefix++
  }

  let suffix = 0

  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] ===
      after[after.length - 1 - suffix]
  ) {
    suffix++
  }

  const removedText = before.slice(
    prefix,
    before.length - suffix
  )

  const addedText = after.slice(
    prefix,
    after.length - suffix
  )

  const type: TextChange['type'] =
    !removedText
      ? 'added'
      : !addedText
        ? 'removed'
        : 'modified'

  return {
    type,
    previousText: before,
    currentText: after,
    addedText,
    removedText,
    detectedAt: new Date().toISOString(),
  }
}
