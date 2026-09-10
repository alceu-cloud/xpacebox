import type { SalesOrder } from "@/types/pedidos";

export async function loadSalesOrders(slug: string): Promise<SalesOrder[]> {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSAO NAO ENCONTRADA.");
  const response = await fetch(`/api/pedidos?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL CARREGAR OS PEDIDOS.");
  return payload.orders as SalesOrder[];
}
