import { supabase } from '@/lib/supabase'
import { getMemoryConsent } from './personalMemory'
import type { BoundContextChangeEvent } from '@/context/contextAutoSync'

const lastSent = new Map<string, number>()
const MIN_GAP_MS = 7000

function summarizeDiff(change: unknown): string | null {
  if (!change || typeof change !== 'object') return null
  const c = change as Record<string, unknown>
  const parts: string[] = []
  for (const key of ['type', 'addedText', 'removedText']) {
    const value = c[key]
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${key}: ${value.slice(0, 900)}`)
    }
  }
  // Never fabricate a textual diff when the detector reports only metadata.
  return parts.some(p => p.startsWith('addedText:') || p.startsWith('removedText:'))
    ? parts.join('\n').slice(0, 2800)
    : null
}

export async function ingestAutomaticDocumentChange(
  event: BoundContextChangeEvent,
  authorized: () => boolean
): Promise<void> {
  if (!authorized()) return
  const summary = summarizeDiff(event.change)
  if (!summary) return
  const key = `${event.projectId}:${event.userId}:${event.url}:${event.editorId}`
  const now = Date.now()
  if (now - (lastSent.get(key) ?? 0) < MIN_GAP_MS) return
  lastSent.set(key, now)
  try {
    if (!(await getMemoryConsent(event.projectId, event.userId)) || !authorized()) return
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || auth.user?.id !== event.userId || !authorized()) return
    const { data: member, error: memberError } = await supabase
      .from('project_members').select('user_id')
      .eq('project_id', event.projectId).eq('user_id', event.userId).maybeSingle()
    if (memberError || !member || !authorized()) return
    // Recheck consent immediately before insert.
    if (!(await getMemoryConsent(event.projectId, event.userId)) || !authorized()) return
    const { error } = await supabase.from('document_changes').insert({
      project_id: event.projectId,
      owner_user_id: event.userId,
      document_title: (event.pageTitle || 'Browser editor').slice(0, 200),
      document_url: event.url,
      change_summary: `Automatically detected browser editor change\n${summary}`,
      shared_with_project: false,
    })
    if (error) throw error
    console.log('[Synapse] Automatic private document change saved')
  } catch (error) {
    console.error('[Synapse] Automatic document capture failed:', error)
  }
}
