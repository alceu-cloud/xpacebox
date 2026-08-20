import type { CfopOption, GeneralOption, PaymentCondition } from "@/types/cadastros-gerais";

export const initialPaymentConditions: PaymentCondition[] = [
  "A VISTA",
  "28 DIAS",
  "28/35/42 DIAS",
  "28/35/42/49 DIAS",
  "30/60 DIAS",
].map((name) => ({
  id: name.toLowerCase().replaceAll("/", "-").replaceAll(" ", "-"),
  name,
}));

export const initialCfops: CfopOption[] = [
  ["5101", "VENDA DE PRODUCAO DO ESTABELECIMENTO"],
  ["5102", "VENDA DE MERCADORIA ADQUIRIDA OU RECEBIDA DE TERCEIROS"],
  ["5201", "DEVOLUCAO DE COMPRA PARA INDUSTRIALIZACAO"],
  ["5202", "DEVOLUCAO DE COMPRA PARA COMERCIALIZACAO"],
  ["5949", "OUTRA SAIDA DE MERCADORIA OU PRESTACAO DE SERVICO"],
].map(([code, description]) => ({
  id: code,
  code,
  description,
}));

function options(names: string[]): GeneralOption[] {
  return names.map((name) => ({ id: name.toLowerCase().replaceAll(" ", "-"), name }));
}

export const initialTaxRegimes = options(["SIMPLES NACIONAL", "LUCRO PRESUMIDO", "LUCRO REAL", "MEI"]);
export const initialFiscalProfiles = options(["CONTRIBUINTE ICMS", "ISENTO", "NAO CONTRIBUINTE"]);
export const initialFiscalBenefits = options(["SEM BENEFICIO FISCAL", "BENEFICIO FISCAL PADRAO", "A DEFINIR"]);
