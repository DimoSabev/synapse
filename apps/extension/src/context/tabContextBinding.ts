
import {
  normalizeOrigin,
  type ContextBinding,
} from './contextBinding'

import { getDocumentScopeId } from './documentScope'

const PREFIX = 'synapse-document-binding-v1:'

export const DOCUMENT_BINDING_KEY =
  PREFIX + getDocumentScopeId()

export function validDocumentBinding(
  value: unknown
): value is ContextBinding {
  if (!value || typeof value !== 'object') {
    return false
  }

  const binding = value as Partial<ContextBinding>

  return (
    typeof binding.projectId === 'string' &&
    binding.projectId.length > 0 &&
    typeof binding.userId === 'string' &&
    binding.userId.length > 0 &&
    typeof binding.enabled === 'boolean' &&
    (binding.captureContent === undefined || typeof binding.captureContent === 'boolean') &&
    Array.isArray(binding.allowedOrigins) &&
    binding.allowedOrigins.length <= 10 &&
    binding.allowedOrigins.every(
      origin =>
        typeof origin === 'string' &&
        normalizeOrigin(origin) === origin
    )
  )
}

export async function readDocumentBinding():
  Promise<ContextBinding | null> {
  const result = await chrome.storage.local.get(
    DOCUMENT_BINDING_KEY
  )

  const value = result[DOCUMENT_BINDING_KEY]

  return validDocumentBinding(value)
    ? value
    : null
}

export async function writeDocumentBinding(
  binding: ContextBinding
): Promise<void> {
  if (!validDocumentBinding(binding)) {
    throw new Error('Invalid document binding')
  }

  await chrome.storage.local.set({
    [DOCUMENT_BINDING_KEY]: binding,
  })
}

export async function disableDocumentBinding():
  Promise<void> {
  const binding = await readDocumentBinding()

  if (!binding) return

  await writeDocumentBinding({
    ...binding,
    enabled: false,
  })
}

export async function clearDocumentBinding():
  Promise<void> {
  await chrome.storage.local.remove(
    DOCUMENT_BINDING_KEY
  )
}
