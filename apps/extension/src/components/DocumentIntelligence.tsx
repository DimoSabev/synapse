
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Member = {
  user_id: string
  display_name: string
}

type Props = {
  projectId: string
  userId: string
  members: Member[]
}

type Change = {
  id: string
  project_id: string
  owner_user_id: string
  document_title: string
  document_url: string | null
  change_summary: string
  shared_with_project: boolean
  created_at: string
}

type QueryResult = {
  answer: string
  sources: {
    id: string
    title: string
    created_at: string
  }[]
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export default function DocumentIntelligence({
  projectId,
  userId,
  members,
}: Props) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [summary, setSummary] = useState('')
  const [share, setShare] = useState(false)

  const [changes, setChanges] = useState<Change[]>([])
  const [teammateId, setTeammateId] = useState('')
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)

  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const teammates = members.filter(
    member => member.user_id !== userId
  )

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('document_changes')
      .select('*')
      .eq('project_id', projectId)
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) throw error
    setChanges((data ?? []) as Change[])
  }, [projectId, userId])

  useEffect(() => {
    setTeammateId(teammates[0]?.user_id ?? '')
  }, [projectId, userId, members])

  useEffect(() => {
    let active = true

    setChanges([])
    setResult(null)

    void refresh().catch(err => {
      if (active) setError(errorText(err))
    })

    const channel = supabase
      .channel(`document-intelligence-${projectId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_changes',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          if (active) {
            void refresh().catch(() => {})
          }
        }
      )
      .subscribe()

    const interval = window.setInterval(() => {
      if (active) {
        void refresh().catch(() => {})
      }
    }, 15000)

    return () => {
      active = false
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [projectId, userId, refresh])

  async function saveChange() {
    if (!title.trim() || !summary.trim() || saving) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const { error: insertError } = await supabase
        .from('document_changes')
        .insert({
          project_id: projectId,
          owner_user_id: userId,
          document_title: title.trim(),
          document_url: url.trim() || null,
          change_summary: summary.trim(),
          shared_with_project: share,
        })

      if (insertError) throw insertError

      setTitle('')
      setUrl('')
      setSummary('')
      setShare(false)

      setNotice(
        share
          ? 'Change saved and shared with project members.'
          : 'Change saved privately.'
      )

      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleSharing(change: Change) {
    setError('')
    setNotice('')
    setResult(null)

    try {
      const { data, error: updateError } = await supabase
        .from('document_changes')
        .update({
          shared_with_project: !change.shared_with_project,
        })
        .eq('id', change.id)
        .eq('owner_user_id', userId)
        .select('id')
        .single()

      if (updateError) throw updateError
      if (!data) throw new Error('Update was not saved')

      await refresh()
      setNotice(
        change.shared_with_project
          ? 'Sharing revoked.'
          : 'Change shared with project members.'
      )
    } catch (err) {
      setError(errorText(err))
    }
  }

  async function askTeammate() {
    if (!teammateId || !question.trim() || asking) return

    setAsking(true)
    setError('')
    setResult(null)

    try {
      const { data, error: invokeError } =
        await supabase.functions.invoke(
          'query-teammate-changes',
          {
            body: {
              project_id: projectId,
              teammate_user_id: teammateId,
              question: question.trim(),
            },
          }
        )

      if (invokeError) throw invokeError
      if (data?.error) throw new Error(data.error)

      setResult(data as QueryResult)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setAsking(false)
    }
  }

  return (
    <section className="synapse-auto-sync">
      <div className="synapse-room-divider">
        ✦ DOCUMENT INTELLIGENCE
      </div>

      <p>
        Record specific document changes and control
        which updates your teammates' AI can access.
      </p>

      <label className="synapse-field-label">
        Document title
        <input
          className="synapse-input"
          maxLength={200}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Financial Forecast 2027"
        />
      </label>

      <label className="synapse-field-label">
        Document URL (optional)
        <input
          className="synapse-input"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="synapse-field-label">
        What exactly changed?
        <textarea
          className="synapse-input synapse-textarea"
          maxLength={3000}
          value={summary}
          onChange={event => setSummary(event.target.value)}
          placeholder="I updated revenue from $2M to $3M..."
        />
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '12px 0',
        }}
      >
        <input
          type="checkbox"
          checked={share}
          onChange={event => setShare(event.target.checked)}
        />
        Share this change with all project members
      </label>

      <button
        type="button"
        className="synapse-primary-button"
        disabled={saving || !title.trim() || !summary.trim()}
        onClick={() => void saveChange()}
      >
        {saving ? 'Saving...' : 'Save Document Change'}
      </button>

      <div className="synapse-room-divider">
        MY DOCUMENT CHANGES
      </div>

      {changes.length === 0 ? (
        <p>No document changes recorded yet.</p>
      ) : (
        changes.map(change => (
          <article key={change.id} className="synapse-event">
            <strong>{change.document_title}</strong>
            <small>
              {' · '}
              {new Date(change.created_at).toLocaleString()}
            </small>

            <p style={{ whiteSpace: 'pre-wrap' }}>
              {change.change_summary}
            </p>

            <small>
              {change.shared_with_project
                ? 'Shared with project'
                : 'Private'}
            </small>

            <button
              type="button"
              className="synapse-secondary-button"
              onClick={() => void toggleSharing(change)}
            >
              {change.shared_with_project
                ? 'Revoke Sharing'
                : 'Share with Project'}
            </button>
          </article>
        ))
      )}

      <div className="synapse-room-divider">
        ✦ ASK A TEAMMATE'S AI
      </div>

      <p>
        Ask about document changes a teammate has
        explicitly shared with this project.
      </p>

      {teammates.length > 0 ? (
        <>
          <label className="synapse-field-label">
            Teammate
            <select
              className="synapse-input"
              value={teammateId}
              onChange={event => {
                setTeammateId(event.target.value)
                setResult(null)
              }}
            >
              {teammates.map(member => (
                <option
                  key={member.user_id}
                  value={member.user_id}
                >
                  {member.display_name || 'Teammate'}
                </option>
              ))}
            </select>
          </label>

          <label className="synapse-field-label">
            Your question
            <textarea
              className="synapse-input synapse-textarea"
              maxLength={500}
              value={question}
              onChange={event => setQuestion(event.target.value)}
              placeholder="What did my teammate change today?"
            />
          </label>

          <button
            type="button"
            className="synapse-primary-button"
            disabled={asking || !question.trim() || !teammateId}
            onClick={() => void askTeammate()}
          >
            {asking
              ? 'Consulting shared context...'
              : '✦ Ask Teammate AI'}
          </button>
        </>
      ) : (
        <p>Invite a teammate to ask about shared changes.</p>
      )}

      {result && (
        <div className="synapse-suggested-action">
          <strong>Synapse AI Response</strong>
          <p style={{ whiteSpace: 'pre-wrap' }}>
            {result.answer}
          </p>
          <small>
            Based on {result.sources.length}
            {' authorized change records'}
          </small>

          {result.sources.map(source => (
            <p key={source.id}>
              <small>
                Source: {source.title}
                {' · '}
                {new Date(source.created_at).toLocaleString()}
              </small>
            </p>
          ))}
        </div>
      )}

      {notice && <p>{notice}</p>}

      {error && (
        <p className="synapse-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
