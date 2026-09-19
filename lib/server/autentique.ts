type Signer = {
  name: string;
  email?: string | null;
  mobile?: string | null;
  cpf?: string | null;
};

type CreateSignatureDocumentInput = {
  file: Blob;
  fileName: string;
  documentName: string;
  signer: Signer;
};

type AutentiqueDocument = {
  id: string;
  signatures?: Array<{ public_id?: string | null; link?: { short_link?: string | null } | null }>;
};

type AutentiqueSignatureStatus = "ENVIADA" | "ASSINADA" | "RECUSADA";

const endpoint = "https://api.autentique.com.br/v2/graphql";

export function autentiqueIsConfigured() {
  return Boolean(process.env.AUTENTIQUE_API_TOKEN?.trim());
}

export function autentiqueIsSandbox() {
  return process.env.AUTENTIQUE_MODE?.trim().toLowerCase() !== "production";
}

export async function createAutentiqueSignatureDocument(input: CreateSignatureDocumentInput) {
  const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
  if (!token) throw new AutentiqueError("A INTEGRAÇÃO AUTENTIQUE AINDA NÃO ESTÁ CONFIGURADA.", 503);

  const signer = buildSigner(input.signer);
  const sandbox = autentiqueIsSandbox();
  const query = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
    createDocument(sandbox: ${sandbox ? "true" : "false"}, document: $document, signers: $signers, file: $file) {
      id
      name
      signatures { public_id link { short_link } }
    }
  }`;
  const form = new FormData();
  form.set("operations", JSON.stringify({
    query,
    variables: {
      document: {
        name: input.documentName,
        refusable: true,
        stop_on_rejected: true,
        locale: { country: "BR", language: "pt-BR", timezone: "America/Sao_Paulo", date_format: "DD_MM_YYYY" },
      },
      signers: [signer],
      file: null,
    },
  }));
  form.set("map", JSON.stringify({ file: ["variables.file"] }));
  form.set("file", input.file, input.fileName);

  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, cache: "no-store" });
  } catch {
    throw new AutentiqueError("NÃO FOI POSSÍVEL CONECTAR À AUTENTIQUE. TENTE NOVAMENTE.", 502);
  }
  const payload = await response.json().catch(() => null) as { data?: { createDocument?: AutentiqueDocument | null }; errors?: Array<{ message?: string }> } | null;
  const errorMessage = payload?.errors?.map((item) => item.message).filter(Boolean).join(" · ");
  if (!response.ok || errorMessage || !payload?.data?.createDocument?.id) {
    throw new AutentiqueError(errorMessage || "A AUTENTIQUE NÃO ACEITOU O DOCUMENTO PARA ASSINATURA.", 502);
  }
  const document = payload.data.createDocument;
  const signature = document.signatures?.find((item) => item.link?.short_link) ?? document.signatures?.[0];
  return { documentId: document.id, signatureId: signature?.public_id ?? "", signatureUrl: signature?.link?.short_link ?? "", sandbox };
}

export async function resendAutentiqueSignature(signatureId: string) {
  const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
  if (!token) throw new AutentiqueError("A INTEGRAÇÃO AUTENTIQUE AINDA NÃO ESTÁ CONFIGURADA.", 503);
  if (!/^[0-9a-f-]{20,}$/i.test(signatureId)) throw new AutentiqueError("A ASSINATURA NÃO POSSUI UM IDENTIFICADOR VÁLIDO PARA REENVIO.", 409);
  const query = `mutation ResendSignatures($publicIds: [UUID!]!) { resendSignatures(public_ids: $publicIds) }`;
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { publicIds: [signatureId] } }), cache: "no-store" });
  } catch {
    throw new AutentiqueError("NÃO FOI POSSÍVEL CONECTAR À AUTENTIQUE PARA REENVIAR A ASSINATURA.", 502);
  }
  const payload = await response.json().catch(() => null) as { data?: { resendSignatures?: boolean }; errors?: Array<{ message?: string }> } | null;
  const errorMessage = payload?.errors?.map((item) => item.message).filter(Boolean).join(" · ");
  if (!response.ok || errorMessage || !payload?.data?.resendSignatures) throw new AutentiqueError(errorMessage || "A AUTENTIQUE NÃO ACEITOU O REENVIO DA ASSINATURA.", 502);
}

export async function getAutentiqueSignatureStatus(documentId: string) {
  const token = process.env.AUTENTIQUE_API_TOKEN?.trim();
  if (!token) throw new AutentiqueError("A INTEGRAÇÃO AUTENTIQUE AINDA NÃO ESTÁ CONFIGURADA.", 503);
  if (!/^[a-z0-9_-]{12,128}$/i.test(documentId)) throw new AutentiqueError("O DOCUMENTO NÃO POSSUI UM IDENTIFICADOR VÁLIDO PARA CONSULTA.", 409);
  const query = `query { document(id: "${documentId}") { files { signed } signatures { action { name } signed { created_at } rejected { created_at } } } }`;
  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }), cache: "no-store" });
  } catch {
    throw new AutentiqueError("NÃO FOI POSSÍVEL CONECTAR À AUTENTIQUE PARA CONSULTAR A ASSINATURA.", 502);
  }
  const payload = await response.json().catch(() => null) as { data?: { document?: { files?: { signed?: string | null } | null; signatures?: Array<{ action?: { name?: string | null } | null; signed?: { created_at?: string | null } | null; rejected?: { created_at?: string | null } | null }> | null } | null }; errors?: Array<{ message?: string }> } | null;
  const errorMessage = payload?.errors?.map((item) => item.message).filter(Boolean).join(" · ");
  const document = payload?.data?.document;
  if (!response.ok || errorMessage || !document) throw new AutentiqueError(errorMessage || "A AUTENTIQUE NÃO RETORNOU O STATUS DO DOCUMENTO.", 502);
  // Autentique includes the API account as a document participant without an
  // action. Only entries with an action are actual requested signatures.
  const signatures = (document.signatures ?? []).filter((signature) => Boolean(signature.action?.name));
  const signedAt = signatures.map((signature) => signature.signed?.created_at ?? "").find(Boolean) ?? "";
  if (signedAt && signatures.length && signatures.every((signature) => Boolean(signature.signed?.created_at))) return { status: "ASSINADA" as AutentiqueSignatureStatus, signedAt, signedDocumentUrl: document.files?.signed ?? "" };
  if (signatures.some((signature) => Boolean(signature.rejected?.created_at))) return { status: "RECUSADA" as AutentiqueSignatureStatus, signedAt: "", signedDocumentUrl: "" };
  return { status: "ENVIADA" as AutentiqueSignatureStatus, signedAt: "", signedDocumentUrl: "" };
}

function buildSigner(signer: Signer) {
  const phone = normalizePhone(signer.mobile);
  const email = signer.email?.trim().toLowerCase() ?? "";
  const cpf = digits(signer.cpf);
  if (!phone && !email) throw new AutentiqueError("INFORME CELULAR OU E-MAIL NO CADASTRO DO ALUNO PARA ENVIAR A ASSINATURA.", 409);
  const result: Record<string, unknown> = { name: signer.name, action: "SIGN" };
  if (email) {
    result.email = email;
  } else {
    result.phone = phone;
    result.delivery_method = "DELIVERY_METHOD_WHATSAPP";
  }
  if (cpf.length === 11) result.configs = { cpf };
  return result;
}

function digits(value?: string | null) { return (value ?? "").replace(/\D/g, ""); }
function normalizePhone(value?: string | null) {
  const number = digits(value);
  if (!number) return "";
  if (number.length === 10 || number.length === 11) return `+55${number}`;
  if (number.length === 12 || number.length === 13) return `+${number}`;
  return "";
}

export class AutentiqueError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
