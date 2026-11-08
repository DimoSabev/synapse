
import { supabase } from '@/lib/supabase'

export type AgentMessage = {
  id: string
  project_id: string
  sender_user_id: string
  recipient_user_id: string
  message_type: 'context' | 'dependency' | 'question'
  content: string
  created_at: string
  source_event_id: string | null
  coordination_insight_id: string | null
}

export type AgentAnalysis = {
  analysis: string
  evidence_ids: string[]
  evidence_status: 'grounded' | 'insufficient'
}

async function invoke<T>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    functionName,
    { body }
  )

  if (error) {
    let message = error.message

    const context = (
      error as { context?: Response }
    ).context

    if (context && typeof context.json === 'function') {
      try {
        const details = await context.json()
        message = details?.error ?? message
      } catch {
        // Preserve the original error.
      }
    }

    throw new Error(message)
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as T
}

export async function sendAgentMessage(
  projectId: string,
  recipientId: string,
  content: string,
  messageType: AgentMessage['message_type']
): Promise<AgentMessage> {
  const result = await invoke<{
    message: AgentMessage
  }>('send-agent-message', {
    project_id: projectId,
    recipient_user_id: recipientId,
    content,
    message_type: messageType,
  })

  return result.message
}

export async function getAgentMessages(
  projectId: string
): Promise<AgentMessage[]> {
  const result = await invoke<{
    messages: AgentMessage[]
  }>('get-agent-messages', {
    project_id: projectId,
  })

  return result.messages
}

export async function analyzeAgentMessage(
  messageId: string
): Promise<AgentAnalysis> {
  return invoke<AgentAnalysis>(
    'analyze-agent-message',
    {
      message_id: messageId,
    }
  )
}
