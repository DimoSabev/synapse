
import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')
const anonKey =
  Deno.env.get('SUPABASE_ANON_KEY') ??
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!url || !anonKey || !serviceKey) {
  throw new Error('Missing Supabase environment variables')
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

export function preflight(request: Request) {
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
    public status = 400
  ) {
    super(message)
  }
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function authenticate(request: Request) {
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

  return data.user.id
}

export async function verifyMember(
  projectId: unknown,
  userId: string
) {
  if (!isUuid(projectId)) {
    throw new AgentError('Invalid project_id')
  }

  const { data, error } = await admin
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  if (!data) {
    throw new AgentError('Project access denied', 403)
  }
}

export function handleError(error: unknown) {
  if (error instanceof AgentError) {
    return json({ error: error.message }, error.status)
  }

  console.error('[Synapse Agent Messaging]', error)

  return json({ error: 'Request failed' }, 500)
}
