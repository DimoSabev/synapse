
import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'

import {
  sendAgentMessage,
  getAgentMessages,
  analyzeAgentMessage,
  type AgentMessage,
  type AgentAnalysis,
} from '@/lib/agentCommunication'

type Member = {
  user_id: string
  display_name: string
}

type Props = {
  projectId: string
  userId: string
  members: Member[]
}

function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : String(error)
}

export default function AgentCommunication({
  projectId,
  userId,
  members,
}: Props) {
  const [messages, setMessages] =
    useState<AgentMessage[]>([])

  const [recipientId, setRecipientId] = useState('')
  const [content, setContent] = useState('')

  const [messageType, setMessageType] =
    useState<AgentMessage['message_type']>('context')

  const [busy, setBusy] = useState(false)
  const [analyzingId, setAnalyzingId] =
    useState<string | null>(null)

  const [analyses, setAnalyses] =
    useState<Record<string, AgentAnalysis>>({})

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const teammates = members.filter(
    member => member.user_id !== userId
  )

  const autonomousMessages = messages.filter(
    message => message.coordination_insight_id !== null
      && message.coordination_insight_id !== undefined
  )

  const manualMessages = messages.filter(
    message => !message.coordination_insight_id
  )

  const refresh = useCallback(async () => {
    const records = await getAgentMessages(projectId)
    setMessages(records)
  }, [projectId])

  useEffect(() => {
    let active = true

    setMessages([])
    setAnalyses({})
    setError('')
    setNotice('')

    async function load() {
      try {
        const records = await getAgentMessages(projectId)
        if (active) setMessages(records)
      } catch (err) {
        if (active) setError(errorText(err))
      }
    }

    void load()

    const channel = supabase
      .channel(
        `agent-communication-${projectId}-${userId}`
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_messages',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          if (!active) return

          // Reload only authorized messages.
          void getAgentMessages(projectId)
            .then(records => {
              if (active) setMessages(records)
            })
            .catch(err => {
              if (active) setError(errorText(err))
            })
        }
      )
      .subscribe()

    // Fallback if a Realtime event is missed.
    const interval = window.setInterval(() => {
      if (!active) return

      void getAgentMessages(projectId)
        .then(records => {
          if (active) setMessages(records)
        })
        .catch(() => {
          // The manual Refresh button remains available.
        })
    }, 15000)

    return () => {
      active = false
      window.clearInterval(interval)
      void supabase.removeChannel(channel)
    }
  }, [projectId, userId])

  useEffect(() => {
    if (
      recipientId &&
      teammates.some(m => m.user_id === recipientId)
    ) {
      return
    }

    setRecipientId(teammates[0]?.user_id ?? '')
  }, [recipientId, members, userId])

  async function send() {
    if (!recipientId || !content.trim() || busy) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await sendAgentMessage(
        projectId,
        recipientId,
        content.trim(),
        messageType
      )

      setContent('')
      setNotice('Agent message delivered.')
      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function analyze(messageId: string) {
    setAnalyzingId(messageId)
    setError('')

    try {
      const result = await analyzeAgentMessage(messageId)

      setAnalyses(previous => ({
        ...previous,
        [messageId]: result,
      }))
    } catch (err) {
      setError(errorText(err))
    } finally {
      setAnalyzingId(null)
    }
  }

  function memberName(id: string) {
    if (id === userId) return 'You'

    return members.find(
      member => member.user_id === id
    )?.display_name || 'Teammate'
  }

  function renderMessage(message: AgentMessage) {
    const incoming =
      message.recipient_user_id === userId

    const autonomous =
      Boolean(message.coordination_insight_id)

    const analysis = analyses[message.id]

    return (
      <article
        key={message.id}
        className="synapse-event"
        style={{
          borderLeft: autonomous
            ? '3px solid #8b5cf6'
            : undefined,
          paddingLeft: autonomous ? 12 : undefined,
        }}
      >
        <strong>
          {autonomous
            ? '✦ Autonomous Agent Coordination'
            : incoming
              ? '↓ Incoming Agent Message'
              : '↑ Outgoing Agent Message'}
        </strong>

        <p>
          {memberName(message.sender_user_id)}
          {' → '}
          {memberName(message.recipient_user_id)}
        </p>

        <small>
          {message.message_type}
          {' · '}
          {new Date(
            message.created_at
          ).toLocaleString()}
        </small>

        <p style={{ whiteSpace: 'pre-wrap' }}>
          {message.content}
        </p>

        {autonomous && (
          <small>
            Generated automatically from shared
            project intelligence.
          </small>
        )}

        {incoming && (
          <button
            type="button"
            className="synapse-secondary-button"
            disabled={analyzingId !== null}
            onClick={() => void analyze(message.id)}
          >
            {analyzingId === message.id
              ? 'Analyzing...'
              : '✦ Analyze with My Agent'}
          </button>
        )}

        {analysis && (
          <div className="synapse-suggested-action">
            <strong>Personal Agent Analysis</strong>

            <p style={{ whiteSpace: 'pre-wrap' }}>
              {analysis.analysis}
            </p>

            <small>
              Evidence: {analysis.evidence_status}
              {' · '}
              {analysis.evidence_ids.length}
              {' personal memories'}
            </small>
          </div>
        )}
      </article>
    )
  }

  return (
    <section className="synapse-auto-sync">
      <div className="synapse-room-divider">
        ✦ AGENT-TO-AGENT COMMUNICATION
      </div>

      <p>
        Your agents can coordinate using shared
        project intelligence. Personal memories
        remain private.
      </p>

      <div className="synapse-room-divider">
        ✦ AUTONOMOUS COORDINATION
      </div>

      <p>
        Synapse automatically generates coordination
        messages when its AI identifies relevant
        project dependencies or conflicts.
      </p>

      {autonomousMessages.length === 0 ? (
        <p>
          No autonomous coordination messages yet.
          Publish project updates to give Synapse
          shared context to analyze.
        </p>
      ) : (
        autonomousMessages.map(renderMessage)
      )}

      <div className="synapse-room-divider">
        MANUAL AGENT COMMUNICATION
      </div>

      {teammates.length === 0 ? (
        <p>
          Invite a teammate to enable agent communication.
        </p>
      ) : (
        <>
          <label className="synapse-field-label">
            Recipient agent
            <select
              className="synapse-input"
              value={recipientId}
              onChange={event =>
                setRecipientId(event.target.value)
              }
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
            Message type
            <select
              className="synapse-input"
              value={messageType}
              onChange={event =>
                setMessageType(
                  event.target.value as
                    AgentMessage['message_type']
                )
              }
            >
              <option value="context">
                Project context
              </option>
              <option value="dependency">
                Dependency
              </option>
              <option value="question">
                Question
              </option>
            </select>
          </label>

          <textarea
            className="synapse-input synapse-textarea"
            value={content}
            maxLength={1200}
            onChange={event =>
              setContent(event.target.value)
            }
            placeholder="Share a project update, dependency or question..."
          />

          <button
            type="button"
            className="synapse-primary-button"
            disabled={
              busy || !recipientId || !content.trim()
            }
            onClick={() => void send()}
          >
            {busy
              ? 'Sending...'
              : 'Send to Agent →'}
          </button>
        </>
      )}

      <button
        type="button"
        className="synapse-secondary-button"
        onClick={() =>
          void refresh().catch(err =>
            setError(errorText(err))
          )
        }
      >
        Refresh Agent Communication
      </button>

      {notice && <p>{notice}</p>}

      {error && (
        <p className="synapse-error" role="alert">
          {error}
        </p>
      )}

      <div className="synapse-room-divider">
        AGENT COMMUNICATION FEED
      </div>

      {manualMessages.length === 0 ? (
        <p>No manual agent messages yet.</p>
      ) : (
        manualMessages.map(renderMessage)
      )}
    </section>
  )
}
