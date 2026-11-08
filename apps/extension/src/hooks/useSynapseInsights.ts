
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type AIInsight = {
  id: string
  project_id: string
  recipient_user_id: string
  source_event_id: string
  insight_type: 'conflict' | 'dependency' | 'recommendation'
  title: string
  explanation: string
  suggested_action: string
  severity: 'low' | 'medium' | 'high'
  created_at: string
}

export type SynapseInsightsState = {
  insights: AIInsight[]
  unreadIds: string[]
  unreadCount: number
  loading: boolean
  error: string
  refresh: () => Promise<void>
  markAsRead: (insightId: string) => Promise<void>
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useSynapseInsights(
  projectId: string | null,
  userId: string | null
): SynapseInsightsState {
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [unreadIds, setUnreadIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!projectId || !userId) return

    const { data: insightData, error: insightError } =
      await supabase
        .from('ai_insights')
        .select(`
          id,
          project_id,
          recipient_user_id,
          source_event_id,
          insight_type,
          title,
          explanation,
          suggested_action,
          severity,
          created_at
        `)
        .eq('project_id', projectId)
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)

    if (insightError) throw insightError

    const items = (insightData ?? []) as AIInsight[]
    const ids = items.map((item) => item.id)

    if (ids.length === 0) {
      setInsights([])
      setUnreadIds([])
      setError('')
      return
    }

    const { data: readData, error: readError } =
      await supabase
        .from('ai_insight_reads')
        .select('insight_id')
        .eq('user_id', userId)
        .in('insight_id', ids)

    if (readError) throw readError

    const readSet = new Set(
      (readData ?? []).map((item) => item.insight_id)
    )

    setInsights(items)
    setUnreadIds(
      ids.filter((id) => !readSet.has(id))
    )
    setError('')
  }, [projectId, userId])

  const markAsRead = useCallback(
    async (insightId: string) => {
      if (!projectId || !userId) {
        throw new Error('No active Synapse project.')
      }

      const { error: insertError } = await supabase
        .from('ai_insight_reads')
        .upsert(
          {
            insight_id: insightId,
            user_id: userId,
          },
          {
            onConflict: 'insight_id,user_id',
            ignoreDuplicates: true,
          }
        )

      if (insertError) {
        setError(getErrorMessage(insertError))
        throw insertError
      }

      setUnreadIds((previous) =>
        previous.filter((id) => id !== insightId)
      )

      try {
        await refresh()
      } catch (refreshError) {
        setError(getErrorMessage(refreshError))
      }
    },
    [projectId, userId, refresh]
  )

  useEffect(() => {
    if (!projectId || !userId) {
      setInsights([])
      setUnreadIds([])
      setLoading(false)
      setError('')
      return
    }

    let active = true
    let refreshSequence = 0

    setInsights([])
    setUnreadIds([])
    setLoading(true)
    setError('')

    async function refreshSafely() {
      const sequence = ++refreshSequence

      try {
        const { data: insightData, error: insightError } =
          await supabase
            .from('ai_insights')
            .select(`
              id,
              project_id,
              recipient_user_id,
              source_event_id,
              insight_type,
              title,
              explanation,
              suggested_action,
              severity,
              created_at
            `)
            .eq('project_id', projectId)
            .eq('recipient_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (insightError) throw insightError

        const items = (insightData ?? []) as AIInsight[]
        const ids = items.map((item) => item.id)

        let readSet = new Set<string>()

        if (ids.length > 0) {
          const { data: readData, error: readError } =
            await supabase
              .from('ai_insight_reads')
              .select('insight_id')
              .eq('user_id', userId)
              .in('insight_id', ids)

          if (readError) throw readError

          readSet = new Set(
            (readData ?? []).map((item) => item.insight_id)
          )
        }

        if (!active || sequence !== refreshSequence) {
          return
        }

        setInsights(items)
        setUnreadIds(
          ids.filter((id) => !readSet.has(id))
        )
        setError('')
      } catch (err) {
        if (active && sequence === refreshSequence) {
          setError(getErrorMessage(err))
        }
      } finally {
        if (active && sequence === refreshSequence) {
          setLoading(false)
        }
      }
    }

    const channel = supabase
      .channel(`synapse-notifications-${projectId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_insights',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const insight = payload.new as AIInsight

          if (
            active &&
            insight.project_id === projectId &&
            insight.recipient_user_id === userId
          ) {
            void refreshSafely()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_insight_reads',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (active) void refreshSafely()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && active) {
          void refreshSafely()
        }

        if (
          active &&
          (status === 'CHANNEL_ERROR' ||
            status === 'TIMED_OUT')
        ) {
          setError(
            'Realtime connection interrupted. Reopen Synapse to retry.'
          )
        }
      })

    void refreshSafely()

    return () => {
      active = false
      refreshSequence++
      void supabase.removeChannel(channel)
    }
  }, [projectId, userId])

  return {
    insights,
    unreadIds,
    unreadCount: unreadIds.length,
    loading,
    error,
    refresh,
    markAsRead,
  }
}
