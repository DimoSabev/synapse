
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')
const anonKey =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const openAIKey = Deno.env.get('OPENAI_API_KEY')

if (!url || !anonKey || !serviceKey || !openAIKey) {
  throw new Error('Missing required server environment variables')
}

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

const authClient = createClient(url, anonKey, {
  auth: { persistSession: false },
})

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export function preflight(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  return null
}

export class AgentError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function authorize(
  request: Request,
  projectId: unknown
): Promise<string> {
  if (
    typeof projectId !== 'string' ||
    !uuidPattern.test(projectId)
  ) {
    throw new AgentError('Invalid project_id', 400)
  }

  const header = request.headers.get('Authorization')

  if (!header?.startsWith('Bearer ')) {
    throw new AgentError('Unauthorized', 401)
  }

  const { data, error } = await authClient.auth.getUser(
    header.slice(7)
  )

  if (error || !data.user) {
    throw new AgentError('Invalid session', 401)
  }

  const userId = data.user.id

  const { data: member, error: memberError } = await admin
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError) throw memberError

  if (!member) {
    throw new AgentError('Project access denied', 403)
  }

  const { data: settings, error: settingsError } = await admin
    .from('personal_agent_settings')
    .select('enabled')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (settingsError) throw settingsError

  if (settings?.enabled !== true) {
    throw new AgentError('Personal Memory is disabled', 403)
  }

  return userId
}

export async function loadMemories(
  projectId: string,
  userId: string,
  limit = 60
) {
  const { data, error } = await admin
    .from('personal_agent_memories')
    .select(
      'id, memory_type, source, title, summary, occurred_at'
    )
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return data ?? []
}

export async function generateJSON(
  systemPrompt: string,
  payload: unknown
): Promise<Record<string, unknown>> {
  const response = await fetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
      signal: AbortSignal.timeout(25000),
    }
  )

  if (!response.ok) {
    console.error('AI request failed', response.status)
    throw new AgentError('AI service unavailable', 502)
  }

  const result = await response.json()
  const content = result.choices?.[0]?.message?.content

  if (typeof content !== 'string') {
    throw new AgentError('Empty AI response', 502)
  }

  const parsed = JSON.parse(content)

  if (!parsed || typeof parsed !== 'object' ||
      Array.isArray(parsed)) {
    throw new AgentError('Invalid AI response', 502)
  }

  return parsed
}

export function handleError(error: unknown): Response {
  if (error instanceof AgentError) {
    return json({ error: error.message }, error.status)
  }

  console.error('Personal Agent server error', error)
  return json({ error: 'Personal Agent request failed' }, 500)
}
