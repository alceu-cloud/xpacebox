import { NextResponse } from "next/server";

import { AccessError } from "@/lib/server/company-access";
import { createSupabaseAuth } from "@/lib/server/supabase-admin";

let tokenCache: { value: string; expiresAt: number } | null = null;

export async function GET(request: Request, context: { params: Promise<{ cnpj: string }> }) {
  try {
    await requireSession(request);
    const { cnpj: rawCnpj } = await context.params;
    const cnpj = rawCnpj.replace(/\D/g, "");
    if (cnpj.length !== 14) return failure("CNPJ INVALIDO.", 400);

    const source = hasSerproCredentials()
      ? await lookupSerpro(cnpj)
      : await lookupBrasilApi(cnpj);
    const company = mapCompany(source, cnpj);
    const stateRegistration = company.stateRegistration || await lookupSintegraStateRegistration(cnpj);
    return NextResponse.json({ success: true, company: { ...company, stateRegistration } });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("CNPJ LOOKUP ERROR", error);
    return failure("NAO FOI POSSIVEL CONSULTAR O CNPJ.", 500);
  }
}

async function lookupSintegraStateRegistration(cnpj: string) {
  const token = process.env.SINTEGRA_WS_TOKEN;
  if (!token) return "";

  const params = new URLSearchParams({ token, cnpj, plugin: "ST" });
  try {
    const response = await fetch(`https://www.sintegraws.com.br/api/v1/execute-api.php?${params}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) return "";
    const payload = (await response.json()) as Record<string, unknown>;
    return text(payload.inscricao_estadual ?? payload.inscricaoEstadual);
  } catch (error) {
    console.error("SINTEGRA IE ERROR", error);
    return "";
  }
}

function hasSerproCredentials() {
  return Boolean(
    process.env.SERPRO_CNPJ_BASE_URL &&
      process.env.SERPRO_CNPJ_TOKEN_URL &&
      process.env.SERPRO_CNPJ_CONSUMER_KEY &&
      process.env.SERPRO_CNPJ_CONSUMER_SECRET
  );
}

async function lookupSerpro(cnpj: string) {
  const token = await getSerproToken();
  const baseUrl = process.env.SERPRO_CNPJ_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/${cnpj}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (response.status === 404) throw new AccessError("CNPJ NAO ENCONTRADO NA RECEITA FEDERAL.", 404);
  if (!response.ok) {
    console.error("SERPRO CNPJ ERROR", response.status, await response.text());
    throw new AccessError("A RECEITA FEDERAL NAO RESPONDEU A CONSULTA AGORA.", 502);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function lookupBrasilApi(cnpj: string) {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Xpacebox/1.0 (consulta cadastral autorizada pelo usuario)",
    },
    cache: "no-store",
  });

  if (response.status === 404) throw new AccessError("CNPJ NAO ENCONTRADO NA BASE PUBLICA.", 404);
  if (!response.ok) {
    console.error("BRASIL API CNPJ ERROR", response.status, await response.text());
    throw new AccessError("A CONSULTA PUBLICA DE CNPJ ESTA INDISPONIVEL AGORA.", 502);
  }
  return (await response.json()) as Record<string, unknown>;
}

async function requireSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new AccessError("SESSAO NAO ENCONTRADA.", 401);
  const auth = createSupabaseAuth();
  const { data, error } = await auth.auth.getUser(authorization.slice("Bearer ".length).trim());
  if (error || !data.user) throw new AccessError("SESSAO INVALIDA.", 401);
}

async function getSerproToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;

  const credentials = Buffer.from(
    `${process.env.SERPRO_CNPJ_CONSUMER_KEY}:${process.env.SERPRO_CNPJ_CONSUMER_SECRET}`
  ).toString("base64");
  const response = await fetch(process.env.SERPRO_CNPJ_TOKEN_URL!, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`SERPRO TOKEN ${response.status}`);
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error("SERPRO TOKEN AUSENTE");
  tokenCache = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 300) * 1000,
  };
  return tokenCache.value;
}

function mapCompany(source: Record<string, unknown>, cnpj: string) {
  const address = object(source.endereco ?? source.address);
  const status = object(source.situacaoCadastral ?? source.registrationStatus);
  const legalNature = object(source.naturezaJuridica ?? source.legalNature);
  const mainCnae = object(source.cnaePrincipal ?? source.mainCnae);
  const municipality = object(address.municipio ?? address.city);
  const phones = Array.isArray(source.telefone) ? source.telefone : Array.isArray(source.phones) ? source.phones : [];
  const firstPhone = object(phones[0]);

  return {
    cnpj,
    legalName: text(source.nomeEmpresarial ?? source.razaoSocial ?? source.razao_social ?? source.legalName),
    tradeName: text(source.nomeFantasia ?? source.nome_fantasia ?? source.tradeName),
    status: text(status.descricao ?? status.codigo ?? source.situacao ?? source.descricao_situacao_cadastral),
    openedAt: text(source.dataAbertura ?? source.data_inicio_atividade ?? source.openedAt),
    stateRegistration: text(source.inscricaoEstadual ?? source.stateRegistration),
    phone:
      [text(firstPhone.ddd), text(firstPhone.numero)].filter(Boolean).join(" ") ||
      text(source.telefone ?? source.ddd_telefone_1),
    email: text(source.correioEletronico ?? source.email),
    street:
      [text(address.tipoLogradouro), text(address.logradouro)].filter(Boolean).join(" ") ||
      [text(source.descricao_tipo_de_logradouro), text(source.logradouro)].filter(Boolean).join(" "),
    streetNumber: text(address.numero ?? source.numero),
    complement: text(address.complemento ?? source.complemento),
    postalCode: text(address.cep ?? source.cep),
    district: text(address.bairro ?? source.bairro),
    city: text(municipality.descricao ?? municipality.nome ?? address.municipio ?? source.municipio),
    state: text(address.uf ?? address.estado ?? source.uf),
    mainCnae:
      [text(mainCnae.codigo), text(mainCnae.descricao)].filter(Boolean).join(" - ") ||
      [text(source.cnae_fiscal), text(source.cnae_fiscal_descricao)].filter(Boolean).join(" - "),
    legalNature:
      [text(legalNature.codigo), text(legalNature.descricao)].filter(Boolean).join(" - ") ||
      [text(source.codigo_natureza_juridica), text(source.natureza_juridica)].filter(Boolean).join(" - "),
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}
