/** Stub: evita importar o SDK Supabase no bundle (só cast de tipo local abaixo). */
type SupabaseClient = Record<string, unknown>

const noopStorage = {
  from: () => ({
    upload: async () => ({ error: new Error('Supabase desativado') }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
    download: async () => ({ error: new Error('Supabase desativado') }),
    remove: async () => ({ error: new Error('Supabase desativado') }),
    list: async () => ({ data: [], error: null }),
  }),
}

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
  },
  storage: noopStorage,
  from: () => ({
    select: () => ({ data: [], error: null }),
    insert: async () => ({ data: null, error: new Error('Supabase desativado') }),
    update: async () => ({ data: null, error: new Error('Supabase desativado') }),
    delete: async () => ({ data: null, error: new Error('Supabase desativado') }),
  }),
  rpc: async () => ({ data: null, error: new Error('Supabase desativado') }),
} as unknown as SupabaseClient
