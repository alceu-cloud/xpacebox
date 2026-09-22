import { supabase } from "./supabase";

const baseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || "https://xpacebox.com.br").replace(/\/$/, "");

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as T & { success?: boolean; message?: string };
  if (!response.ok || !payload.success) throw new Error(payload.message || "Não foi possível carregar os dados.");
  return payload;
}
