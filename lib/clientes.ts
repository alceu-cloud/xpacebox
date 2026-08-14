import type { ClientFormData, ClientRecord, CnpjLookupResult, RepresentativeOption, SellerCompanyOption } from "@/types/clientes";

type ClientOptions = {
  sellerCompanies: SellerCompanyOption[];
  representatives: RepresentativeOption[];
};

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
  if (!response.ok || !payload.success) {
    throw new Error(payload.message || "NAO FOI POSSIVEL CONCLUIR A OPERACAO.");
  }

  return payload;
}

export async function loadClientOptions(slug: string): Promise<ClientOptions> {
  const payload = await authorizedFetch(`/api/clientes/opcoes?slug=${encodeURIComponent(slug)}`);
  return payload.options;
}

export async function loadClients(slug: string): Promise<ClientRecord[]> {
  const payload = await authorizedFetch(`/api/clientes?slug=${encodeURIComponent(slug)}`);
  return payload.clients;
}

export async function saveClient(slug: string, client: ClientFormData): Promise<ClientRecord> {
  const payload = await authorizedFetch("/api/clientes", {
    method: client.id ? "PATCH" : "POST",
    body: JSON.stringify({ slug, client }),
  });
  return payload.client;
}

export async function deactivateClient(slug: string, id: string) {
  await authorizedFetch("/api/clientes", {
    method: "DELETE",
    body: JSON.stringify({ slug, id }),
  });
}

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const payload = await authorizedFetch(`/api/cnpj/${cnpj.replace(/\D/g, "")}`);
  return payload.company;
}
