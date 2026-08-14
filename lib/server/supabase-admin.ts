import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !secret) throw new Error("CONFIGURACAO DO SUPABASE AUSENTE.");

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createSupabaseAuth() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("CONFIGURACAO DO SUPABASE AUSENTE.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
