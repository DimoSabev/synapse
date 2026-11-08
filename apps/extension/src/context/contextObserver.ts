
import { captureEditors } from './contextCapture'

import {
  detectTextChange,
  type TextChange,
} from './changeDetector'

export type ContextChangeEvent = {
  source: 'browser-editor'
  url: string
  pageTitle: string
  editorId: string
  change: TextChange
}

export function startContextObserver(
  onChange: (event: ContextChangeEvent) => void,
  isAuthorized: () => boolean = () => true
): () => void {
  let previous = new Map<string, string>()

  let timer: ReturnType<typeof setTimeout> | null = null

  let stopped = false

  function scan() {
    if (stopped || !isAuthorized()) {
      return
    }

    const current = captureEditors()

    const next = new Map<string, string>()

    for (const editor of current) {
      if (stopped || !isAuthorized()) {
        return
      }

      next.set(
        editor.editorId,
        editor.text
      )

      const before = previous.get(
        editor.editorId
      )

      if (before === undefined) {
        continue
      }

      const change = detectTextChange(
        before,
        editor.text
      )

      if (!change) {
        continue
      }

      // Final authorization check before emission.
      if (stopped || !isAuthorized()) {
        return
      }

      onChange({
        source: 'browser-editor',
        url:
          location.origin +
          location.pathname,
        pageTitle: document.title,
        editorId: editor.editorId,
        change,
      })
    }

    previous = next
  }

  function scheduleScan() {
    if (stopped || !isAuthorized()) {
      return
    }

    if (timer !== null) {
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      timer = null
      scan()
    }, 1200)
  }

  // Establish a baseline before observing.
  previous = new Map(
    captureEditors().map(editor => [
      editor.editorId,
      editor.text,
    ])
  )

  const observer = new MutationObserver(
    scheduleScan
  )

  observer.observe(
    document.documentElement,
    {
      childList: true,
      characterData: true,
      subtree: true,
    }
  )

  document.addEventListener(
    'input',
    scheduleScan,
    true
  )

  document.addEventListener(
    'change',
    scheduleScan,
    true
  )

  const interval = setInterval(
    scan,
    5000
  )

  console.log(
    '[Synapse] Context observer started'
  )

  return () => {
    stopped = true

    observer.disconnect()

    document.removeEventListener(
      'input',
      scheduleScan,
      true
    )

    document.removeEventListener(
      'change',
      scheduleScan,
      true
    )

    clearInterval(interval)

    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    console.log(
      '[Synapse] Context observer stopped'
    )
  }
}
