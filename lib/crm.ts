import type { CrmActivityInput, CrmOpportunityInput, CrmOverview, CrmProfileInput } from "@/types/crm";

async function authorizedFetch(path: string, init?: RequestInit) {
  const { supabase } = await import("@/lib/supabase");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) throw new Error("SESSAO NAO ENCONTRADA.");

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(payload.message || "NAO FOI POSSIVEL CONCLUIR A OPERACAO.");
  return payload;
}

export async function loadCrmOverview(slug: string): Promise<CrmOverview> {
  const payload = await authorizedFetch(`/api/crm?slug=${encodeURIComponent(slug)}`);
  return payload.overview;
}

export async function saveCrmProfile(slug: string, profile: CrmProfileInput) {
  const payload = await authorizedFetch("/api/crm/profiles", {
    method: "PUT",
    body: JSON.stringify({ slug, profile }),
  });
  return payload.profile;
}

export async function createCrmActivity(slug: string, activity: CrmActivityInput) {
  const payload = await authorizedFetch("/api/crm/activities", {
    method: "POST",
    body: JSON.stringify({ slug, activity }),
  });
  return payload.activity;
}

export async function saveCrmOpportunity(slug: string, opportunity: CrmOpportunityInput) {
  const payload = await authorizedFetch("/api/crm/opportunities", {
    method: opportunity.id ? "PATCH" : "POST",
    body: JSON.stringify({ slug, opportunity }),
  });
  return payload.opportunity;
}
