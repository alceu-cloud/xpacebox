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
  signatures?: Array<{ link?: { short_link?: string | null } | null }>;
};

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
      signatures { link { short_link } }
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
        reminder: "WEEKLY",
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
  return { documentId: document.id, signatureUrl: document.signatures?.find((signature) => signature.link?.short_link)?.link?.short_link ?? "", sandbox };
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
