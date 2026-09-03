import { NextResponse } from "next/server";

import { AccessError, requireCompanyAccess } from "@/lib/server/company-access";
import { decryptBaldussiCredential } from "@/lib/server/telephony-credentials";

type DialRequest = { slug?: string; clientId?: string };
type BaldussiResponse = { http_response_code?: number; mensagem?: string; chamada_id?: string };

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function formatBaldussiDestination(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) digits = digits.slice(2);
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);
  if (!/^\d{10,11}$/.test(digits)) throw new AccessError("O TELEFONE DO CLIENTE PRECISA TER DDD PARA LIGAR PELO BALDUSSI.", 400);
  return `0${digits}`;
}

function extensionNumber(explicitExtension: string | null, providerExtension: string | null) {
  const value = explicitExtension || providerExtension?.match(/(\d+)$/)?.[1] || "";
  if (!/^\d{1,8}$/.test(value)) throw new AccessError("CONFIGURE O RAMAL NUMERICO DO CLICK2CALL PARA O SEU USUARIO.", 409);
  return Number(value);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as DialRequest;
    const slug = body.slug?.trim() || "";
    const clientId = body.clientId?.trim() || "";
    if (!slug || !clientId) return failure("CLIENTE OU EMPRESA NAO INFORMADOS.", 400);

    const { admin, company, profile } = await requireCompanyAccess(request, slug);
    const [connectionResult, clientResult] = await Promise.all([
      admin.from("telephony_connections")
        .select("id,click_to_call_username,click_to_call_token_ciphertext,click_to_call_token_iv,click_to_call_token_auth_tag,click_to_call_base_url")
        .eq("tenant_company_id", company.id)
        .maybeSingle(),
      admin.from("clients")
        .select("id,phone,whatsapp")
        .eq("id", clientId)
        .eq("tenant_company_id", company.id)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (connectionResult.error) throw connectionResult.error;
    if (clientResult.error) throw clientResult.error;
    const connection = connectionResult.data;
    const client = clientResult.data;
    if (!client) throw new AccessError("CLIENTE NAO ENCONTRADO OU INATIVO.", 404);
    if (!connection?.click_to_call_username || !connection.click_to_call_token_ciphertext || !connection.click_to_call_token_iv || !connection.click_to_call_token_auth_tag) {
      throw new AccessError("O CLICK2CALL DA BALDUSSI AINDA NAO FOI CONFIGURADO NESTA EMPRESA.", 409);
    }

    const { data: extension, error: extensionError } = await admin
      .from("telephony_user_extensions")
      .select("extension,click_to_call_extension")
      .eq("connection_id", connection.id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (extensionError) throw extensionError;
    if (!extension) throw new AccessError("SEU USUARIO AINDA NAO POSSUI UM RAMAL BALDUSSI CONFIGURADO.", 409);

    const destination = formatBaldussiDestination(client.phone || client.whatsapp || "");
    const originExtension = extensionNumber(extension.click_to_call_extension, extension.extension);
    const token = decryptBaldussiCredential({
      ciphertext: connection.click_to_call_token_ciphertext,
      iv: connection.click_to_call_token_iv,
      authTag: connection.click_to_call_token_auth_tag,
    });
    const baseUrl = connection.click_to_call_base_url || "https://cloud10.baldussi.com.br/suite/api";
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/discar_numero`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        usuario: connection.click_to_call_username,
        token,
      },
      body: JSON.stringify({ dados: { numero_ramal_origem: originExtension, numero_destino: destination, variaveis: [] } }),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json().catch(() => ({})) as BaldussiResponse;
    if (!response.ok || Number(result.http_response_code) !== 200) {
      return failure(result.mensagem || "O BALDUSSI NAO ACEITOU A DISCAGEM. CONFIRA O RAMAL E O TELEFONE.", 502);
    }

    return NextResponse.json({
      success: true,
      message: result.mensagem || "DISCAGEM EFETUADA COM SUCESSO.",
      callId: result.chamada_id || "",
      destination,
    });
  } catch (error) {
    if (error instanceof AccessError) return failure(error.message, error.status);
    console.error("BALDUSSI CLICK2CALL ERROR", error);
    const message = String((error as { message?: string })?.message || "");
    if (message.includes("telephony_")) return failure("A ESTRUTURA DO CLICK2CALL AINDA NAO FOI APLICADA NO SUPABASE.", 503);
    return failure("NAO FOI POSSIVEL SOLICITAR A LIGACAO NO BALDUSSI.", 502);
  }
}
