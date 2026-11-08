
export type CapturedEditor = {
  editorId: string
  text: string
}

const editorIds = new WeakMap<HTMLElement, string>()
let nextEditorId = 0

const EDITOR_SELECTOR = [
  'textarea',
  'input[type="text"]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
].join(',')

function getEditorId(element: HTMLElement): string {
  let id = editorIds.get(element)

  if (!id) {
    id = `editor-${++nextEditorId}`
    editorIds.set(element, id)
  }

  return id
}

function isAllowedEditor(
  element: Element
): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  if (
    element.closest(
      '[data-synapse-agent], [data-synapse-private]'
    )
  ) {
    return false
  }

  if (
    element.closest(
      '[hidden], [aria-hidden="true"]'
    )
  ) {
    return false
  }

  if (
    element.matches(
      '[disabled], [readonly]'
    )
  ) {
    return false
  }

  const input = element as HTMLInputElement

  const metadata = [
    input.name,
    input.id,
    input.getAttribute('placeholder'),
    input.getAttribute('autocomplete'),
    input.getAttribute('aria-label'),
  ].filter(Boolean).join(' ')

  if (
    /password|secret|token|api.?key|credit.?card|card.?number|ssn|otp|one.time.code|private/i
      .test(metadata)
  ) {
    return false
  }

  return true
}

function readEditor(element: HTMLElement): string {
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement
  ) {
    return element.value
  }

  return element.innerText ?? ''
}

export function captureEditors(): CapturedEditor[] {
  return Array.from(
    document.querySelectorAll(EDITOR_SELECTOR)
  )
    .filter(isAllowedEditor)
    .map(element => ({
      editorId: getEditorId(element),
      text: readEditor(element).slice(0, 20000),
    }))
}
