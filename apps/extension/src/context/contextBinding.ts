
export const CONTEXT_BINDING_KEY =
  'synapse-context-binding-v1'

export const LEGACY_ALLOWED_ORIGINS_KEY =
  'synapse-context-allowed-origins'

export type ContextBinding = {
  projectId: string
  userId: string
  allowedOrigins: string[]
  enabled: boolean
  captureContent?: boolean
}

export function normalizeOrigin(
  value: string
): string | null {
  try {
    const url = new URL(value)

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    ) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

export function isContextBinding(
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
    binding.allowedOrigins.every(
      (origin) =>
        typeof origin === 'string' &&
        normalizeOrigin(origin) === origin
    )
  )
}

export async function readContextBinding():
  Promise<ContextBinding | null> {
  const result = await chrome.storage.local.get(
    CONTEXT_BINDING_KEY
  )

  const value = result[CONTEXT_BINDING_KEY]

  return isContextBinding(value) ? value : null
}

export async function writeContextBinding(
  binding: ContextBinding
): Promise<void> {
  if (!isContextBinding(binding)) {
    throw new Error('Invalid context binding')
  }

  await chrome.storage.local.set({
    [CONTEXT_BINDING_KEY]: binding,
  })
}

export async function disableContextBinding():
  Promise<void> {
  const binding = await readContextBinding()

  if (!binding) return

  await writeContextBinding({
    ...binding,
    enabled: false,
  })
}
