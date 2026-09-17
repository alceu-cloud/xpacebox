import { NextResponse } from "next/server";

import { AccessError } from "@/lib/server/company-access";
import { createSupabaseAuth } from "@/lib/server/supabase-admin";

const lookupTimeoutMs = 4_000;

export async function GET(request: Request, context: { params: Promise<{ cep: string }> }) {
  try {
    await requireSession(request);
    const { cep: rawCep } = await context.params;
    const cep = digits(rawCep);
    if (cep.length !== 8) return failure("CEP INVÁLIDO.", 400);

    const address = await lookupBrasilApi(cep).catch(() => lookupViaCep(cep));
    return NextResponse.json({ success: true, address: { postalCode: cep, ...address } });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("CEP LOOKUP ERROR", error);
    return failure("NÃO FOI POSSÍVEL CONSULTAR O CEP.", 502);
  }
}

async function lookupBrasilApi(cep: string) {
  const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, {
    headers: { Accept: "application/json", "User-Agent": "Xpacebox/1.0 (consulta cadastral autorizada pelo usuario)" },
    cache: "no-store",
    signal: AbortSignal.timeout(lookupTimeoutMs),
  });
  if (!response.ok) throw new Error(`BRASIL API CEP ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  return normalizeAddress({ street: data.street, district: data.neighborhood, city: data.city, state: data.state });
}

async function lookupViaCep(cep: string) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(lookupTimeoutMs),
  });
  if (!response.ok) throw new Error(`VIACEP ${response.status}`);
  const data = await response.json() as Record<string, unknown>;
  if (data.erro === true) throw new AccessError("CEP NÃO ENCONTRADO.", 404);
  return normalizeAddress({ street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf });
}

function normalizeAddress(value: { street: unknown; district: unknown; city: unknown; state: unknown }) {
  const address = { street: text(value.street), district: text(value.district), city: text(value.city), state: text(value.state).toUpperCase() };
  if (!address.city || !/^[A-Z]{2}$/.test(address.state)) throw new Error("CEP SEM ENDEREÇO UTILIZÁVEL.");
  return address;
}

async function requireSession(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new AccessError("SESSÃO NÃO ENCONTRADA.", 401);
  const auth = createSupabaseAuth();
  const { data, error } = await auth.auth.getUser(authorization.slice("Bearer ".length).trim());
  if (error || !data.user) throw new AccessError("SESSÃO INVÁLIDA.", 401);
}

function digits(value: string) { return value.replace(/\D/g, ""); }
function text(value: unknown) { return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""; }
function failure(message: string, status: number) { return NextResponse.json({ success: false, message }, { status }); }
