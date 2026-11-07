
import { createClient } from '@supabase/supabase-js'
import { chromeStorage } from './chromeStorage'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing Supabase configuration')
}

export const supabase = createClient(url, key, {
  auth: {
    storage: chromeStorage,
    storageKey: 'synapse-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
