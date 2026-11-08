
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

Deno.serve(async (request) => {
  const early = preflight(request)
  if (early) return early

  try {
    const userId = await authenticate(request)
    const body = await request.json().catch(() => null)
    const projectId = body?.project_id

    if (!isUuid(projectId)) {
      throw new AgentError('Invalid project_id')
    }

    await verifyMember(projectId, userId)

    const { data, error } = await admin
      .from('agent_messages')
      .select(`
        id,
        project_id,
        sender_user_id,
        recipient_user_id,
        message_type,
        content,
        created_at,
        source_event_id,
        coordination_insight_id
      `)
      .eq('project_id', projectId)
      .or(
        `sender_user_id.eq.${userId},recipient_user_id.eq.${userId}`
      )
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    // Revalidate membership before returning results.
    await verifyMember(projectId, userId)

    return json({
      messages: data ?? [],
    })
  } catch (error) {
    return handleError(error)
  }
})
