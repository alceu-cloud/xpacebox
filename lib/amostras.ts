import type { ClientSampleFormData, ClientSampleRecord } from "@/types/amostras";

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

export async function loadClientSamples(slug: string): Promise<ClientSampleRecord[]> {
  const payload = await authorizedFetch(`/api/clientes/amostras?slug=${encodeURIComponent(slug)}`);
  return payload.samples;
}

export async function saveClientSample(slug: string, sample: ClientSampleFormData): Promise<ClientSampleRecord> {
  const payload = await authorizedFetch("/api/clientes/amostras", {
    method: sample.id ? "PATCH" : "POST",
    body: JSON.stringify({ slug, sample }),
  });
  return payload.sample;
}

export async function deleteClientSample(slug: string, id: string) {
  await authorizedFetch("/api/clientes/amostras", {
    method: "DELETE",
    body: JSON.stringify({ slug, id }),
  });
}
