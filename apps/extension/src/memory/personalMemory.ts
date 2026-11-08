
import { supabase } from '@/lib/supabase'

export type MemoryType = 'activity' | 'summary' | 'progress'

export type MemorySource =
  | 'browser-editor'
  | 'manual-update'
  | 'agent-summary'

export type PersonalMemory = {
  id: string
  project_id: string
  user_id: string
  memory_type: MemoryType
  source: MemorySource
  source_url: string | null
  title: string
  summary: string
  evidence: Record<string, unknown>
  event_fingerprint: string
  occurred_at: string
  created_at: string
}

export type NewPersonalMemory = {
  memory_type: MemoryType
  source: MemorySource
  source_url?: string | null
  title: string
  summary: string
  evidence?: Record<string, unknown>
  event_fingerprint: string
  occurred_at: string
}

async function verifyOwner(userId: string): Promise<void> {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user || data.user.id !== userId) {
    throw new Error('Personal Memory: authentication mismatch')
  }
}

export async function getMemoryConsent(
  projectId: string,
  userId: string
): Promise<boolean> {
  await verifyOwner(userId)

  const { data, error } = await supabase
    .from('personal_agent_settings')
    .select('enabled')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  return data?.enabled === true
}

export async function setMemoryConsent(
  projectId: string,
  userId: string,
  enabled: boolean
): Promise<void> {
  await verifyOwner(userId)

  const { error } = await supabase
    .from('personal_agent_settings')
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,user_id' }
    )

  if (error) throw error
}

export async function savePersonalMemory(
  projectId: string,
  userId: string,
  memory: NewPersonalMemory
): Promise<void> {
  await verifyOwner(userId)

  if (!(await getMemoryConsent(projectId, userId))) {
    throw new Error('Personal Memory is not enabled')
  }

  const { error } = await supabase
    .from('personal_agent_memories')
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        memory_type: memory.memory_type,
        source: memory.source,
        source_url: memory.source_url ?? null,
        title: memory.title,
        summary: memory.summary,
        evidence: memory.evidence ?? {},
        event_fingerprint: memory.event_fingerprint,
        occurred_at: memory.occurred_at,
      },
      {
        onConflict: 'project_id,user_id,event_fingerprint',
        ignoreDuplicates: true,
      }
    )

  if (error) throw error
}

export async function listPersonalMemories(
  projectId: string,
  userId: string,
  limit = 50
): Promise<PersonalMemory[]> {
  await verifyOwner(userId)

  const safeLimit = Math.max(1, Math.min(limit, 100))

  const { data, error } = await supabase
    .from('personal_agent_memories')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(safeLimit)

  if (error) throw error

  return (data ?? []) as PersonalMemory[]
}

export async function deletePersonalMemories(
  projectId: string,
  userId: string
): Promise<void> {
  await verifyOwner(userId)

  const { error } = await supabase
    .from('personal_agent_memories')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (error) throw error
}


export async function disableAndClearMemory(
  projectId: string,
  userId: string
): Promise<void> {
  const { data: auth, error: authError } =
    await supabase.auth.getUser()

  if (
    authError ||
    !auth.user ||
    auth.user.id !== userId
  ) {
    throw new Error('Unauthorized memory deletion')
  }

  const { error } = await supabase.rpc(
    'synapse_disable_clear_memory',
    { p_project_id: projectId }
  )

  if (error) throw error
}

