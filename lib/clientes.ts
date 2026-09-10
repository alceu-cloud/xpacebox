import type { ClientChangeLog, ClientFormData, ClientRecord, CnpjLookupResult, RepresentativeOption, SellerCompanyOption } from "@/types/clientes";
import type { ProductFicha } from "@/types/gerenciador";

type ClientOptions = {
  sellerCompanies: SellerCompanyOption[];
  representatives: RepresentativeOption[];
};

type ApiPayload = {
  success?: boolean;
  message?: unknown;
} & Record<string, unknown>;

async function authorizedFetch<T extends object = ApiPayload>(path: string, init?: RequestInit): Promise<T> {
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

  const responseText = await response.text();
  let payload: ApiPayload;
  try {
    payload = responseText ? JSON.parse(responseText) as ApiPayload : {};
  } catch {
    throw new Error(response.ok
      ? "O SERVICO RETORNOU UMA RESPOSTA INVALIDA. TENTE NOVAMENTE."
      : "O SERVICO ESTA TEMPORARIAMENTE INDISPONIVEL. TENTE NOVAMENTE.");
  }
  if (!response.ok || !payload.success) {
    throw new Error(String(payload.message || "NAO FOI POSSIVEL CONCLUIR A OPERACAO."));
  }

  return payload as T;
}

export async function loadClientOptions(slug: string): Promise<ClientOptions> {
  const payload = await authorizedFetch<{ options: ClientOptions }>(`/api/clientes/opcoes?slug=${encodeURIComponent(slug)}`);
  return payload.options;
}

export async function loadClients(slug: string): Promise<ClientRecord[]> {
  const payload = await authorizedFetch<{ clients: ClientRecord[] }>(`/api/clientes?slug=${encodeURIComponent(slug)}`);
  return payload.clients;
}

export async function loadClientChangeHistory(slug: string, clientId: string): Promise<ClientChangeLog[]> {
  const payload = await authorizedFetch<{ history: ClientChangeLog[] }>(`/api/clientes?slug=${encodeURIComponent(slug)}&historyClientId=${encodeURIComponent(clientId)}`);
  return payload.history;
}

export async function saveClient(slug: string, client: ClientFormData): Promise<{ client: ClientRecord; syncedProductFichas: ProductFicha[] }> {
  const payload = await authorizedFetch<{ client: ClientRecord; syncedProductFichas?: ProductFicha[] }>("/api/clientes", {
    method: client.id ? "PATCH" : "POST",
    body: JSON.stringify({ slug, client }),
  });
  return { client: payload.client, syncedProductFichas: payload.syncedProductFichas ?? [] };
}

export async function deactivateClient(slug: string, id: string) {
  await authorizedFetch("/api/clientes", {
    method: "DELETE",
    body: JSON.stringify({ slug, id }),
  });
}

export async function lookupCnpj(cnpj: string): Promise<CnpjLookupResult> {
  const payload = await authorizedFetch<{ company: CnpjLookupResult }>(`/api/cnpj/${cnpj.replace(/\D/g, "")}`);
  return payload.company;
}
