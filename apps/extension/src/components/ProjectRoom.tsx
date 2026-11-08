
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { SynapseInsightsState } from '@/hooks/useSynapseInsights'

import {
  getMemoryConsent,
  savePersonalMemory,
} from '@/memory/personalMemory'

import {
  memoryFromManualUpdate,
} from '@/memory/memoryProcessor'

import PersonalAgentMemory from './PersonalAgentMemory'
import AgentCommunication from './AgentCommunication'
import DocumentIntelligence from './DocumentIntelligence'

type Project = {
  id: string
  name: string
  join_code: string
}

type ProjectEvent = {
  id: string
  user_id: string
  content: string
  created_at: string
}

type ProjectMember = {
  user_id: string
  display_name: string
}

type ProjectRoomProps = {
  onContextChange: (
    projectId: string | null,
    userId: string | null
  ) => void
  intelligence: SynapseInsightsState
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function ProjectRoom({
  onContextChange,
  intelligence,
}: ProjectRoomProps) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [displayName, setDisplayName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const [project, setProject] = useState<Project | null>(null)
  const [events, setEvents] = useState<ProjectEvent[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [message, setMessage] = useState('')

  const {
    insights,
    unreadIds,
    unreadCount,
    loading: insightsLoading,
    error: insightsError,
    refresh: refreshInsights,
    markAsRead,
  } = intelligence

  const [markingId, setMarkingId] = useState<string | null>(
    null
  )

  // Authentication
  useEffect(() => {
    let active = true

    async function initialize() {
      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) throw sessionError

        if (sessionData.session?.user) {
          if (active) {
            setUser(sessionData.session.user)
          }
        } else {
          const { data, error } =
            await supabase.auth.signInAnonymously()

          if (error) throw error

          if (active) {
            setUser(data.user)
          }
        }
      } catch (err) {
        if (active) setError(errorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    }

    void initialize()

    return () => {
      active = false
    }
  }, [])

  // Inform App about the active project and user.
  useEffect(() => {
    onContextChange(
      project?.id ?? null,
      user?.id ?? null
    )
  }, [project?.id, user?.id, onContextChange])

  // Load project members
  async function loadMembers(projectId: string) {
    const { data, error } = await supabase
      .from('project_members')
      .select('user_id, display_name')
      .eq('project_id', projectId)

    if (error) throw error

    setMembers(data ?? [])
  }

  // Load a project
  async function loadProject(id: string) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, join_code')
      .eq('id', id)
      .single()

    if (error) throw error

    await loadMembers(id)

    setEvents([])
    setProject(data)
  }

  // Load team activity
  async function loadEvents(id: string) {
    const { data, error } = await supabase
      .from('project_events')
      .select('id, user_id, content, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    setEvents(data ?? [])
  }

  // Realtime team collaboration
  useEffect(() => {
    if (!project) return

    let active = true
    const projectId = project.id

    const channel = supabase
      .channel(`synapse-events-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_events',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (!active) return

          const event = payload.new as ProjectEvent

          setEvents((previous) => {
            if (
              previous.some(
                (item) => item.id === event.id
              )
            ) {
              return previous
            }

            return [event, ...previous].slice(0, 50)
          })

          void loadMembers(projectId).catch((err) => {
            console.error(
              '[Synapse] Member refresh failed:',
              err
            )
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && active) {
          void Promise.all([
            loadEvents(projectId),
            loadMembers(projectId),
          ]).catch((err) => {
            if (active) {
              setError(errorMessage(err))
            }
          })
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [project?.id])

  // Create project
  async function createProject() {
    if (
      !user ||
      !displayName.trim() ||
      !projectName.trim()
    ) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data, error } = await supabase.rpc(
        'create_synapse_project',
        {
          p_name: projectName.trim(),
          p_display_name: displayName.trim(),
        }
      )

      if (error) throw error

      await loadProject(data as string)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Join project
  async function joinProject() {
    if (
      !user ||
      !displayName.trim() ||
      !joinCode.trim()
    ) {
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data, error } = await supabase.rpc(
        'join_synapse_project',
        {
          p_code: joinCode.trim(),
          p_display_name: displayName.trim(),
        }
      )

      if (error) throw error

      await loadProject(data as string)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Publish activity and trigger Synapse Core
  async function publishUpdate() {
    if (!user || !project || !message.trim()) return

    setBusy(true)
    setError('')

    try {
      const {
        data: newEvent,
        error: insertError,
      } = await supabase
        .from('project_events')
        .insert({
          project_id: project.id,
          user_id: user.id,
          content: message.trim(),
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      setMessage('')
      await loadEvents(project.id)

      // Save personal memory only with separate consent.
      // Memory failure must not undo the published update.
      try {
        const memoryEnabled = await getMemoryConsent(
          project.id,
          user.id
        )

        if (memoryEnabled) {
          const memory = memoryFromManualUpdate({
            id: newEvent.id,
            content: message.trim(),
            created_at: new Date().toISOString(),
          })

          if (memory) {
            await savePersonalMemory(
              project.id,
              user.id,
              memory
            )
          }
        }
      } catch (memoryError) {
        console.error(
          '[Synapse] Personal Memory save failed:',
          memoryError
        )
      }

      try {
        const {
          data: analysis,
          error: analysisError,
        } = await supabase.functions.invoke(
          'analyze-project',
          {
            body: {
              event_id: newEvent.id,
            },
          }
        )

        if (analysisError) {
          console.error(
            'Synapse AI invocation failed:',
            analysisError
          )

          setError(
            'Update saved, but AI analysis failed.'
          )
        } else {
          console.log(
            'Synapse AI analysis result:',
            analysis
          )

          try {
            await refreshInsights()
          } catch (err) {
            console.error(
              'Insight refresh failed:',
              err
            )
          }
        }
      } catch (analysisError) {
        console.error(
          'Synapse AI error:',
          analysisError
        )

        setError(
          'Update saved, but AI analysis failed.'
        )
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // Mark a personalized insight as read
  async function handleMarkAsRead(insightId: string) {
    setMarkingId(insightId)

    try {
      await markAsRead(insightId)
    } catch (err) {
      console.error(
        '[Synapse] Mark as read failed:',
        err
      )

      setError(
        `Could not mark insight as read: ${errorMessage(err)}`
      )
    } finally {
      setMarkingId(null)
    }
  }

  // Resolve event author
  function getAuthorName(userId: string): string {
    if (userId === user?.id) {
      return 'You'
    }

    const member = members.find(
      (item) => item.user_id === userId
    )

    return member?.display_name?.trim() || 'Teammate'
  }

  function switchProject() {
    setProject(null)
    setEvents([])
    setMembers([])
    setMessage('')
    setError('')
  }

  if (loading) {
    return (
      <div className="synapse-room">
        Connecting to Synapse...
      </div>
    )
  }

  return (
    <div className="synapse-room">
      {error && (
        <div className="synapse-error" role="alert">
          {error}
        </div>
      )}

      {!user ? (
        <p>
          Unable to authenticate.
          Check Supabase settings.
        </p>
      ) : !project ? (
        <>
          <div className="synapse-room-heading">
            <h3>Connect your team</h3>
            <p>
              Create a shared workspace or join
              an existing one.
            </p>
          </div>

          <label className="synapse-field-label">
            Your name
            <input
              className="synapse-input"
              value={displayName}
              onChange={(e) =>
                setDisplayName(e.target.value)
              }
              placeholder="e.g. Alex"
              maxLength={60}
            />
          </label>

          <div className="synapse-room-divider">
            CREATE PROJECT
          </div>

          <input
            className="synapse-input"
            value={projectName}
            onChange={(e) =>
              setProjectName(e.target.value)
            }
            placeholder="Project name"
            maxLength={100}
          />

          <button
            className="synapse-primary-button"
            disabled={
              busy ||
              !displayName.trim() ||
              !projectName.trim()
            }
            onClick={createProject}
          >
            Create project →
          </button>

          <div className="synapse-room-divider">
            OR JOIN A TEAM
          </div>

          <input
            className="synapse-input"
            value={joinCode}
            onChange={(e) =>
              setJoinCode(e.target.value)
            }
            placeholder="Invitation code"
          />

          <button
            className="synapse-secondary-button"
            disabled={
              busy ||
              !displayName.trim() ||
              !joinCode.trim()
            }
            onClick={joinProject}
          >
            Join project
          </button>
        </>
      ) : (
        <>
          <div className="synapse-room-heading">
            <span className="synapse-connected">
              ● CONNECTED
            </span>

            <h3>{project.name}</h3>
            <p>Shared project workspace</p>
          </div>

          <div className="synapse-code-card">
            <span>TEAM INVITATION CODE</span>
            <strong>{project.join_code}</strong>

            <button
              className="synapse-secondary-button"
              onClick={() =>
                navigator.clipboard
                  .writeText(project.join_code)
                  .catch(() =>
                    setError('Copy failed')
                  )
              }
            >
              Copy code
            </button>
          </div>

          {/* PERSONALIZED INTELLIGENCE */}
          <div className="synapse-room-divider">
            ✦ SYNAPSE INTELLIGENCE
          </div>

          <div
            className="synapse-intelligence-feed"
            aria-live="polite"
          >
            <div className="synapse-intelligence-heading">
              <strong>Your AI Insights</strong>
              <span>
                {unreadCount} unread · {insights.length} total
              </span>
            </div>

            {insightsLoading ? (
              <p className="synapse-insights-empty">
                Loading your insights...
              </p>
            ) : (
              <>
                {insightsError && (
                  <p
                    className="synapse-error"
                    role="alert"
                  >
                    {insightsError}
                  </p>
                )}

                {insights.length === 0 ? (
                  <p className="synapse-insights-empty">
                    No insights yet. Synapse will analyze
                    your team's contributions and identify
                    meaningful connections, dependencies,
                    and conflicts.
                  </p>
                ) : (
                  insights.map((insight) => {
                    const isUnread =
                      unreadIds.includes(insight.id)

                    return (
                      <article
                        key={insight.id}
                        className={`synapse-insight-card severity-${insight.severity}`}
                      >
                        <div className="synapse-insight-meta">
                          <span className="synapse-insight-type">
                            {insight.insight_type === 'conflict'
                              ? '⚠ Conflict'
                              : insight.insight_type === 'dependency'
                              ? '◇ Dependency'
                              : '✦ Recommendation'}
                          </span>

                          <span
                            className={`synapse-severity severity-${insight.severity}`}
                          >
                            {insight.severity} priority
                          </span>
                        </div>

                        {isUnread && (
                          <span className="synapse-insight-new">
                            ● NEW
                          </span>
                        )}

                        <h4>{insight.title}</h4>

                        <p>{insight.explanation}</p>

                        <div className="synapse-suggested-action">
                          <strong>Suggested action</strong>
                          <p>{insight.suggested_action}</p>
                        </div>

                        <small>
                          Synapse Core ·{' '}
                          {new Date(
                            insight.created_at
                          ).toLocaleString()}
                        </small>

                        {isUnread ? (
                          <button
                            type="button"
                            className="synapse-mark-read-button"
                            disabled={
                              markingId === insight.id
                            }
                            onClick={() =>
                              void handleMarkAsRead(
                                insight.id
                              )
                            }
                          >
                            {markingId === insight.id
                              ? 'Saving...'
                              : '✓ Mark as read'}
                          </button>
                        ) : (
                          <div className="synapse-insight-read">
                            ✓ Read
                          </div>
                        )}
                      </article>
                    )
                  })
                )}
              </>
            )}
          </div>

          {/* PERSONAL AGENT MEMORY */}
          {user && project && (
            <PersonalAgentMemory
              key={`${project.id}:${user.id}`}
              projectId={project.id}
              userId={user.id}
            />
          )}

          {/* AGENT-TO-AGENT COMMUNICATION */}
          {user && project && (
            <AgentCommunication
              key={`agents:${project.id}:${user.id}`}
              projectId={project.id}
              userId={user.id}
              members={members}
            />
          )}

          {/* DOCUMENT INTELLIGENCE & CROSS-AGENT RETRIEVAL */}
          {user && project && (
            <DocumentIntelligence
              key={`documents:${project.id}:${user.id}`}
              projectId={project.id}
              userId={user.id}
              members={members}
            />
          )}

          {/* TEAM ACTIVITY */}
          <div className="synapse-room-divider">
            TEAM ACTIVITY
          </div>

          <div
            className="synapse-events"
            aria-live="polite"
          >
            {events.length === 0 ? (
              <p>
                No updates yet.
                Start the conversation.
              </p>
            ) : (
              events.map((event) => (
                <div
                  className="synapse-event"
                  key={event.id}
                >
                  <strong>
                    {getAuthorName(event.user_id)}
                  </strong>

                  <p>{event.content}</p>

                  <small>
                    {new Date(
                      event.created_at
                    ).toLocaleTimeString()}
                  </small>
                </div>
              ))
            )}
          </div>

          <textarea
            className="synapse-input synapse-textarea"
            placeholder="Share what you're working on..."
            value={message}
            onChange={(e) =>
              setMessage(e.target.value)
            }
            maxLength={2000}
          />

          <button
            className="synapse-primary-button"
            disabled={busy || !message.trim()}
            onClick={publishUpdate}
          >
            Publish update →
          </button>

          <button
            className="synapse-link-button"
            onClick={switchProject}
          >
            Switch project
          </button>
        </>
      )}
    </div>
  )
}
