import type { QuoteDraft, QuoteRecord } from "@/types/orcamentos";

async function authorizedFetch(path: string, init?: RequestInit) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("SESSAO NAO ENCONTRADA.");

  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL CONCLUIR A OPERACAO.");
  return payload;
}

export async function loadQuotes(slug: string, kind: "DIRECT" | "ENGINEERING", search = "") {
  const params = new URLSearchParams({ slug, kind });
  if (search.trim()) params.set("search", search.trim());
  const payload = await authorizedFetch(`/api/orcamentos?${params.toString()}`);
  return payload.quotes as QuoteRecord[];
}

export async function createQuote(slug: string, quote: QuoteDraft) {
  const payload = await authorizedFetch("/api/orcamentos", {
    method: "POST",
    body: JSON.stringify({ slug, quote }),
  });
  return payload.quote as QuoteRecord;
}

export async function updateQuote(slug: string, id: string, quote: QuoteDraft) {
  const payload = await authorizedFetch("/api/orcamentos", {
    method: "PATCH",
    body: JSON.stringify({ slug, id, quote }),
  });
  return payload.quote as QuoteRecord;
}

export async function deleteQuote(slug: string, id: string) {
  await authorizedFetch(`/api/orcamentos?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
