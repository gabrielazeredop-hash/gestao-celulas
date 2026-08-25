import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://wflazouqkyktunxralxc.supabase.co'
// Chave pública (anon) — pode ficar no código; sozinha ela só dá o acesso que as
// regras do banco (RLS) permitirem ao papel "anon".
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmbGF6b3Vxa3lrdHVueHJhbHhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2Mjg4MzEsImV4cCI6MjA5NTIwNDgzMX0.M6HuSC3uk7BwuStnTdkU_8ouyUbmas_EbaVxivAn26M'

// Crachá (JWT) do usuário logado, emitido pela função login() do banco.
// Fica na memória e no localStorage; o cliente o envia em toda requisição.
// Sem crachá, cai no anon.
let _token = null
try { _token = localStorage.getItem('celulas_token') || null } catch (e) {}

export function setAuthToken(t) {
  _token = t || null
  try {
    if (t) localStorage.setItem('celulas_token', t)
    else localStorage.removeItem('celulas_token')
  } catch (e) {}
  try { supabase.realtime.setAuth(_token || SUPABASE_ANON_KEY) } catch (e) {}
}

export function getAuthToken() { return _token }

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => _token || SUPABASE_ANON_KEY,
})

// Garante que o "tempo real" também use o crachá (necessário com o banco fechado).
if (_token) { try { supabase.realtime.setAuth(_token) } catch (e) {} }
