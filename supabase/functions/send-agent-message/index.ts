
import {
  admin,
  authenticate,
  verifyMember,
  isUuid,
  AgentError,
  handleError,
  json,
  preflight,
} from '../_shared/agentMessaging.ts'

const types = ['context', 'dependency', 'question']

Deno.serve(async (request) => {
  const early = preflight(request)
  if (early) return early

  try {
    const senderId = await authenticate(request)
    const body = await request.json().catch(() => null)

    const projectId = body?.project_id
    const recipientId = body?.recipient_user_id
    const content = body?.content
    const type = body?.message_type ?? 'context'

    if (
      !isUuid(projectId) ||
      !isUuid(recipientId) ||
      typeof content !== 'string' ||
      content.trim().length < 1 ||
      content.trim().length > 1200 ||
      !types.includes(type)
    ) {
      throw new AgentError('Invalid message')
    }

    if (recipientId === senderId) {
      throw new AgentError('Cannot message yourself')
    }

    await verifyMember(projectId, senderId)
    await verifyMember(projectId, recipientId)

    const { data, error } = await admin
      .from('agent_messages')
      .insert({
        project_id: projectId,
        sender_user_id: senderId,
        recipient_user_id: recipientId,
        message_type: type,
        content: content.trim(),
      })
      .select(
        'id, project_id, sender_user_id, recipient_user_id, message_type, content, created_at'
      )
      .single()

    if (error) throw error

    return json({ success: true, message: data })
  } catch (error) {
    return handleError(error)
  }
})
