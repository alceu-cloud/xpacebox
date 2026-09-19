import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

export type ContractTemplateData = {
  RazaoSocialFilial: string;
  NomeFantasiaFilial: string;
  CnpjCpfFilial: string;
  CidadeFilial: string;
  EnderecoFilial: string;
  NumeroEnderecoFilial: string;
  BairroFilial: string;
  CepFilial: string;
  UfFilial: string;
  NomeCliente: string;
  CpfCliente: string;
  EnderecoCliente: string;
  NumeroEnderecoCliente: string;
  BairroCliente: string;
  CepCliente: string;
  CidadeCliente: string;
  UfCliente: string;
  NomeResponsavel: string;
  CpfResponsavel: string;
  EnderecoResponsavel: string;
  NumeroEnderecoResponsavel: string;
  BairroResponsavel: string;
  CepResponsavel: string;
  DuracaoContrato: string;
  DescricaoContrato: string;
  ValorTotalContratoFormatado: string;
  ValorAdesaoFormatado: string;
  TemAdesao: Array<Record<string, never>>;
  TemResponsavel: Array<Record<string, never>>;
  Modalidades: Array<{
    DescricaoModalidade: string;
    LimiteAcessos: string;
    DiasLiberadosParaAcesso: string;
    HorariosLiberadosParaAcesso: string;
  }>;
  Parcelas: Array<{
    ValorFormatado: string;
    DataVencimento: string;
  }>;
};

const docxMimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function renderXpaceContractTemplate(template: ArrayBuffer, data: ContractTemplateData) {
  const zip = new PizZip(template);
  normalizeNextFitTemplateTags(zip);

  const document = new Docxtemplater(zip, {
    delimiters: { start: "<<", end: ">>" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });
  document.render(data);

  const output = document.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  const unresolved = new PizZip(output).file("word/document.xml")?.asText() ?? "";
  if (unresolved.includes("&lt;&lt;") || unresolved.includes("<<")) {
    throw new ContractTemplateError("O MODELO POSSUI CAMPOS QUE A XPACE AINDA NÃO RECONHECE. REVISE OS MARCADORES DO DOCX.");
  }
  const bytes = new Uint8Array(output.byteLength);
  bytes.set(output);
  return new Blob([bytes.buffer], { type: docxMimeType });
}

function normalizeNextFitTemplateTags(zip: PizZip) {
  const document = zip.file("word/document.xml");
  if (!document) throw new ContractTemplateError("O MODELO DOCX NÃO POSSUI O CONTEÚDO PRINCIPAL DO DOCUMENTO.");
  const xml = document.asText();
  const normalized = xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => normalizeParagraph(paragraph));
  zip.file("word/document.xml", normalized);
}

function normalizeParagraph(paragraph: string) {
  const text = [...paragraph.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1])).join("");
  if (!text.includes("<<")) return paragraph;

  const open = paragraph.match(/^<w:p\b[^>]*>/)?.[0];
  if (!open) return paragraph;
  const paragraphProperties = paragraph.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const runProperties = paragraph.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
  let normalizedText = normalizeText(text);
  if (normalizedText.includes("CONTRATANTE (RESPONSÁVEL)")) normalizedText = `<<#TemResponsavel>>${normalizedText}<</TemResponsavel>>`;
  return `${open}${paragraphProperties}<w:r>${runProperties}<w:t xml:space="preserve">${escapeXml(normalizedText)}</w:t></w:r></w:p>`;
}

function normalizeText(value: string) {
  let result = value
    // Some legacy Next Fit exports contain a single opening angle bracket.
    .replace(/(?<!<)<\s*\[\s*([A-Za-z.]+)\s*\]\s*>>/g, "<<[$1]>>")
    .replace(/<<\s*image\s*\[\s*LogoFilial\s*\]\s*>>/gi, "")
    .replace(/<<\s*foreach\s*\[\s*modalidade\s+in\s+Modalidades\s*\]\s*>>/gi, "<<#Modalidades>>")
    .replace(/<<\s*foreach\s*\[\s*parcela\s+in\s+Parcelas\s*\]\s*>>/gi, "<<#Parcelas>>")
    .replace(/<<\s*if\s*\[\s*ValorAdesao\s*>\s*0\s*\]\s*>>/gi, "<<#TemAdesao>>")
    .replace(/<<\s*\/\s*if\s*>>/gi, "<</TemAdesao>>")
    .replace(/RG\s*n[º°]\s*<<\s*\[\s*RgCliente\s*\]\s*>>\s*,?\s*/gi, "")
    .replace(/RG\s*n[º°]\s*<<\s*\[\s*RgResponsavel\s*\]\s*>>\s*,?\s*/gi, "");

  const loops: string[] = [];
  result = result.replace(/<<\s*#(Modalidades|Parcelas)\s*>>|<<\s*\/\s*foreach\s*>>/g, (match, name?: string) => {
    if (name) {
      loops.push(name);
      return `<<#${name}>>`;
    }
    const current = loops.pop();
    return current ? `<</${current}>>` : match;
  });

  return result
    .replace(/<<\s*\[\s*modalidade\.([A-Za-z]+)\s*\]\s*>>/g, "<<$1>>")
    .replace(/<<\s*\[\s*parcela\.([A-Za-z]+)\s*\]\s*>>/g, "<<$1>>")
    .replace(/<<\s*\[\s*([A-Za-z]+)\s*\]\s*>>/g, "<<$1>>");
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

export class ContractTemplateError extends Error {}
