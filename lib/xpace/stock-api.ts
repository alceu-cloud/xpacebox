import { supabase } from "@/lib/supabase";
export class StockApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function stockApi<T>(query = "", body?: object): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("SUA SESSÃO EXPIROU. ENTRE NOVAMENTE.");
  const response = await fetch(`/api/xpace/estoque${query}`, { method: body ? "POST" : "GET", cache: "no-store", headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new StockApiError(result.message || "NÃO FOI POSSÍVEL CONSULTAR O ESTOQUE.", response.status);
  return result;
}

export async function uploadStockImage(id: string, image: File) {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("SUA SESSÃO EXPIROU.");
  const form = new FormData(); form.set("image", image);
  const response = await fetch(`/api/xpace/estoque/${id}/imagem`, { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` }, body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || "PRODUTO SALVO, MAS NÃO FOI POSSÍVEL ENVIAR A FOTO.");
}
