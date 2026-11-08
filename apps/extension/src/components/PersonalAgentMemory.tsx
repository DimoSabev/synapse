
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

import {
  getMemoryConsent,
  setMemoryConsent,
  listPersonalMemories,
  disableAndClearMemory,
  type PersonalMemory,
} from '@/memory/personalMemory'



type Props = {
  projectId: string
  userId: string
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error)
}

export default function PersonalAgentMemory({
  projectId,
  userId,
}: Props) {
  const [enabled, setEnabled] = useState(false)
  const [memories, setMemories] = useState<PersonalMemory[]>([])
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [evidenceIds, setEvidenceIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const [consent, records] = await Promise.all([
      getMemoryConsent(projectId, userId),
      listPersonalMemories(projectId, userId),
    ])

    setEnabled(consent)
    setMemories(records)
  }, [projectId, userId])

  useEffect(() => {
    let active = true

    setReady(false)
    setEnabled(false)
    setMemories([])
    setAnswer('')
    setEvidenceIds([])
    setError('')

    async function load() {
      try {
        const [consent, records] = await Promise.all([
          getMemoryConsent(projectId, userId),
          listPersonalMemories(projectId, userId),
        ])

        if (!active) return

        setEnabled(consent)
        setMemories(records)
      } catch (err) {
        if (active) setError(errorText(err))
      } finally {
        if (active) setReady(true)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [projectId, userId])

  async function toggleMemory() {
    setBusy(true)
    setError('')

    try {
      await setMemoryConsent(
        projectId,
        userId,
        !enabled
      )

      await refresh()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  async function clearMemory() {
    if (
      !window.confirm(
        'Disable Personal Memory and permanently delete all its records for this project?'
      )
    ) {
      return
    }

    setBusy(true)
    setError('')

    try {
      await disableAndClearMemory(
        projectId,
        userId
      )

      setEnabled(false)
      setMemories([])
      setAnswer('')
      setEvidenceIds([])
    } catch (err) {
      setError(errorText(err))
      try {
        await refresh()
      } catch {
        // Preserve the original error.
      }
    } finally {
      setBusy(false)
    }
  }

  
async function askAgent() {
  if (!question.trim() || !enabled) return

  setBusy(true)
  setError('')
  setAnswer('')
  setEvidenceIds([])

  try {
    const { data, error: invokeError } =
      await supabase.functions.invoke(
        'ask-personal-agent',
        {
          body: {
            project_id: projectId,
            question: question.trim(),
          },
        }
      )

    if (invokeError) throw invokeError

    if (
      !data ||
      typeof data.answer !== 'string'
    ) {
      throw new Error('Invalid Personal Agent response')
    }

    setAnswer(data.answer)
    setEvidenceIds(
      Array.isArray(data.evidence_ids)
        ? data.evidence_ids
        : []
    )
  } catch (err) {
    setError(errorText(err))
  } finally {
    setBusy(false)
  }
}


async function summarizeWithAI() {
  if (!enabled) return

  setBusy(true)
  setError('')

  try {
    const { data, error: invokeError } =
      await supabase.functions.invoke(
        'summarize-personal-memory',
        {
          body: {
            project_id: projectId,
          },
        }
      )

    if (invokeError) throw invokeError

    if (data?.error) {
      throw new Error(data.error)
    }

    if (data?.reason ===
        'No manual updates available to summarize') {
      setAnswer(
        'Publish a project update first. ' +
        'Synapse needs actual project activity ' +
        'before it can generate a summary.'
      )
    } else if (data?.memory?.summary) {
      setAnswer(data.memory.summary)
    } else {
      setAnswer('No new summary was created.')
    }

    setEvidenceIds([])
    await refresh()
  } catch (err) {
    setError(errorText(err))
  } finally {
    setBusy(false)
  }
}



  return (
    <section className="synapse-auto-sync">
      <div className="synapse-room-divider">
        ✦ PERSONAL AGENT MEMORY
      </div>

      {!ready ? (
        <p>Loading memory...</p>
      ) : (
        <>
          <p>
            {enabled
              ? '● Personal Memory enabled'
              : '○ Personal Memory disabled'}
          </p>

          <p>
            {memories.length} recent memory records
          </p>

          <small>
            Separate consent is required. Enabling
            Memory does not authorize automatic
            browser content uploads.
          </small>

          <button
            type="button"
            className="synapse-secondary-button"
            disabled={busy}
            onClick={() => void toggleMemory()}
          >
            {enabled
              ? 'Pause Memory'
              : 'Enable Personal Memory'}
          </button>

          <button
            type="button"
            className="synapse-secondary-button"
            disabled={busy}
            onClick={() => void refresh().catch(
              (err) => setError(errorText(err))
            )}
          >
            Refresh memories
          </button>

          <button
            type="button"
            className="synapse-secondary-button"
            disabled={busy}
            onClick={() => void clearMemory()}
          >
            Disable & Delete Memory
          </button>

          
{enabled && (
  <>
    <div className="synapse-room-divider">
      AI MEMORY INTELLIGENCE
    </div>

    <button
      type="button"
      className="synapse-secondary-button"
      disabled={busy}
      onClick={() => void summarizeWithAI()}
    >
      {busy
        ? 'Processing...'
        : '✦ Generate AI Memory Summary'}
    </button>

    <div className="synapse-room-divider">
      ASK MY AGENT
    </div>


              <textarea
                className="synapse-input synapse-textarea"
                value={question}
                onChange={(event) =>
                  setQuestion(event.target.value)
                }
                placeholder="What have I accomplished today?"
                maxLength={500}
              />

              <button
                type="button"
                className="synapse-primary-button"
                disabled={busy || !question.trim()}
                onClick={() => void askAgent()}
              >
                Ask My Agent →
              </button>

              {answer && (
                <div className="synapse-event">
                  <strong>Synapse Memory</strong>
                  <p style={{ whiteSpace: 'pre-wrap' }}>
                    {answer}
                  </p>
                  <small>
                    Evidence records: {evidenceIds.length}
                  </small>
                </div>
              )}
            </>
          )}

          {error && (
            <p className="synapse-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  )
}
