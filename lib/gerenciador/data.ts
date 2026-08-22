import type { EngineeringFormula, PaperCostParams, PaperType, PricingGoals, PricingGoalsByCompany, PricingParams, ReminderFormula, SpecificMaterial, Supplier } from "@/types/gerenciador";

export const initialSuppliers: Supplier[] = [
  "COCELPA",
  "EMPAR",
  "FAPOLPA",
  "KLABIN",
  "NOVACKI",
  "RIO BONITO",
  "SOPASTA",
  "TROMBINI",
  "WESTROCK",
].map((name) => ({ id: name.toLowerCase().replaceAll(" ", "-"), name }));

export const initialPaperTypes: PaperType[] = [
  ["OSRR-B", "OSRR-B (ONDA SIMPLES - RECICLADO/RECICLADO)"],
  ["OSKR-B", "OSKR-B (ONDA SIMPLES - KRAFT/RECICLADO)"],
  ["OSKK-B", "OSKK-B (ONDA SIMPLES - KRAFT/KRAFT)"],
  ["OSRK-B", "OSRK-B (ONDA SIMPLES - RECICLADO/KRAFT)"],
  ["OSBM-B", "OSBM-B (ONDA SIMPLES - SEMI-KRAFT/MIOLO)"],
  ["OSBKRES-B", "OSBKRES-B (ONDA SIMPLES - SEMI-KRAFT COM RESINA)"],
  ["OSRT-T", "OSRT-T (ONDA SIMPLES - RECICLADO/TESTLINER)"],
  ["OSTT-T", "OSTT-T (ONDA SIMPLES - TESTLINER/TESTLINER)"],
  ["OSKK-C", "OSKK-C (ONDA SIMPLES C - KRAFT/KRAFT)"],
  ["OCKK-C", "OCKK-C (ONDA SIMPLES C - KRAFT/KRAFT)"],
  ["OCRR-C", "OCRR-C (ONDA SIMPLES C - RECICLADO/RECICLADO)"],
  ["ODKK-BC", "ODKK-BC (ONDA DUPLA - KRAFT/KRAFT)"],
  ["ODRR-BC", "ODRR-BC (ONDA DUPLA - RECICLADO/RECICLADO)"],
  ["ODKR-BC", "ODKR-BC (ONDA DUPLA - KRAFT/RECICLADO)"],
  ["ODTT-BC", "ODTT-BC (ONDA DUPLA - TESTLINER/TESTLINER)"],
  ["ODBB-BB", "ODBB-BB (ONDA DUPLA BB - KRAFT/KRAFT)"],
  ["ODRR-BB", "ODRR-BB (ONDA DUPLA BB - RECICLADO/RECICLADO)"],
  ["ODRRES-BC", "ODRRES-BC (ONDA DUPLA BC - RECICLADO RESINADO)"],
  ["ODBK-BC", "ODBK-BC (ONDA DUPLA BC - SEMI-KRAFT/KRAFT)"],
  ["OCKK", "OCKK (ONDA SIMPLES C - KRAFT/KRAFT)"],
].map(([code, description]) => ({
  id: code.toLowerCase(),
  code,
  description,
}));

export const initialMaterials: SpecificMaterial[] = [
  ["KCBC80-BC", "KCBC80-BC", "ODKR-BC", "COCELPA", "0,630 KG/M2", "8,00 KG/COL", 4.47],
  ["CMB40-B", "CMB40-B", "OSRR-B", "COCELPA", "0,325 KG/M2", "4,00 KG/COL", 2.36],
  ["KCB40-B", "KCB40-B", "OSKR-B", "COCELPA", "0,325 KG/M2", "4,00 KG/COL", 2.51],
  ["KCB50-B", "KCB50-B", "OSKR-B", "COCELPA", "0,365 KG/M2", "5,00 KG/COL", 2.74],
  ["CMBC65-BC", "CMBC65-BC", "ODRR-BC", "COCELPA", "0,555 KG/M2", "6,50 KG/COL", 3.92],
  ["KB4", "KB4", "OSKK-B", "EMPAR", "0,325 KG/M2", "4,00 KG/COL", 2.56],
  ["KB5", "KB5", "OSKK-B", "EMPAR", "0,320 KG/M2", "5,00 KG/COL", 2.77],
  ["KB6", "KB6", "OSKK-B", "EMPAR", "0,365 KG/M2", "6,00 KG/COL", 3.13],
  ["FCM07", "FCM07", "ODTT-BC", "FAPOLPA", "0,470 KG/M2", "6,80 KG/COL", 3.8],
  ["FCM16", "FCM16", "OSRR-B", "FAPOLPA", "0,320 KG/M2", "3,60 KG/COL", 2.78],
  ["FCM05", "FCM05", "OSRT-T", "FAPOLPA", "0,280 KG/M2", "3,80 KG/COL", 2.32],
  ["FMM01B-T", "FMM01B-T", "OSTT-T", "FAPOLPA", "0,270 KG/M2", "3,50 KG/COL", 1.9],
  ["34B-KKK60", "34B/KKK60 S/RESINA", "OSBM-B", "KLABIN", "0,412 KG/M2", "6,00 KG/COL", 3.47],
  ["34B-KKK80", "34B/KKK80 C/RES", "OSBKRES-B", "KLABIN", "0,437 KG/M2", "7,00 KG/COL", 4.56],
  ["34B-KKK50", "34B/KKK50", "OSKK-B", "KLABIN", "0,329 KG/M2", "5,00 KG/COL", 2.79],
  ["34BC-KKKKK80", "34BC/KKKKK80", "ODKK-BC", "KLABIN", "0,550 KG/M2", "8,00 KG/COL", 4.6],
  ["34C-KKK60R", "34C/KKK60 RESINA", "OCKK-C", "KLABIN", "0,500 KG/M2", "6,00 KG/COL", 3.53],
  ["34BC-KKKKK110", "34BC/KKKKK110", "ODKK-BC", "KLABIN", "0,600 KG/M2", "11,00 KG/COL", 5.6],
  ["CMC315-B", "CMC315-B", "OSRR-B", "RIO BONITO", "0,315 KG/M2", "3,50 KG/COL", 2.43],
  ["CMC550-BC", "CMC550-BC", "ODRR-BC", "RIO BONITO", "0,550 KG/M2", "5,50 KG/COL", 4.35],
  ["CMC355-B", "CMC355-B", "OSRK-B", "RIO BONITO", "0,355 KG/M2", "4,50 KG/COL", 3],
  ["CMC435-C", "CMC435-C", "OCRR-C", "RIO BONITO", "0,435 KG/M2", "5,50 KG/COL", 3.69],
  ["CMC635-BC", "CMC635-BC", "ODRR-BC", "RIO BONITO", "0,635 KG/M2", "8,00 KG/COL", 5.38],
  ["CMC605-BC", "CMC605-BC", "ODRR-BC", "RIO BONITO", "0,605 KG/M2", "6,50 KG/COL", 5.12],
  ["CMC705-BC", "CMC705-BC", "ODRR-BC", "RIO BONITO", "0,705 KG/M2", "10,00 KG/COL", 5.97],
  ["KMC580-BC", "KMC580-BC", "ODKK-BC", "RIO BONITO", "0,580 KG/M2", "6,00 KG/COL", 4.58],
  ["KE0B-B", "KE0B-B", "OSRR-B", "SOPASTA", "0,344 KG/M2", "4,00 KG/COL", 2.42],
  ["K1BB-BB", "K1BB-BB", "ODBB-BB", "SOPASTA", "0,643 KG/M2", "7,50 KG/COL", 4.51],
  ["RIKS3C", "RIKS3C RESINA", "OCRR-C", "SOPASTA", "0,514 KG/M2", "6,00 KG/COL", 3.61],
  ["PO3060", "PO3060", "OSRR-B", "TROMBINI", "0,358 KG/M2", "4,00 KG/COL", 2.93],
  ["PO3200", "PO3200", "OSKK-B", "TROMBINI", "0,388 KG/M2", "4,50 KG/COL", 3.33],
  ["PO4050", "PO4050", "OSBM-B", "TROMBINI", "0,403 KG/M2", "5,50 KG/COL", 4.82],
  ["PO4190", "PO4190", "OSBKRES-B", "TROMBINI", "0,503 KG/M2", "7,00 KG/COL", 5.67],
  ["PO5100", "PO5100", "OSKK-C", "TROMBINI", "0,396 KG/M2", "4,50 KG/COL", 3.76],
  ["PO5150", "PO5150", "OCKK", "TROMBINI", "0,445 KG/M2", "5,50 KG/COL", 4.3],
  ["PO7100", "PO7100", "ODRR-BC", "TROMBINI", "0,619 KG/M2", "6,50 KG/COL", 4.84],
  ["PO7150", "PO7150", "ODKK-BC", "TROMBINI", "0,644 KG/M2", "7,00 KG/COL", 5.16],
  ["PO7300R", "PO7300 RES.", "ODRRES-BC", "TROMBINI", "0,729 KG/M2", "8,50 KG/COL", 5.9],
  ["PO7400", "PO7400", "ODKK-BC", "TROMBINI", "0,818 KG/M2", "10,50 KG/COL", 6.06],
  ["PO7600", "PO7600", "ODKK-BC", "TROMBINI", "1,053 KG/M2", "13,00 KG/COL", 8.6],
  ["POPR8050", "POPR8050", "ODBK-BC", "TROMBINI", "0,690 KG/M2", "-", 10.16],
  ["POPR8150", "POPR8150", "ODBK-BC", "TROMBINI", "0,779 KG/M2", "-", 11.53],
  ["TTBC080", "TTBC080", "ODKK-BC", "WESTROCK", "0,598 KG/M2", "8,00 KG/COL", 5.41],
  ["KL0C060", "KL0C060", "OSKK-C", "WESTROCK", "0,422 KG/M2", "6,00 KG/COL", 3.82],
  ["KBLC210", "KBLC210", "ODKK-BC", "WESTROCK", "1,400 KG/M2", "21,00 KG/COL", 13.17],
  ["KLOC070", "KLOC070", "OSKK-C", "WESTROCK", "0,462 KG/M2", "7,00 KG/COL", 4.18],
  ["KLOC085", "KLOC085", "OSKK-C", "WESTROCK", "0,558 KG/M2", "8,50 KG/COL", 4.95],
  ["KLBC150F", "KLBC150F", "ODKK-BC", "WESTROCK", "0,925 KG/M2", "15,00 KG/COL", 8.32],
  ["KLBC110", "KLBC110", "ODKK-BC", "WESTROCK", "0,712 KG/M2", "11,00 KG/COL", 6.39],
  ["NIK60", "NIK60", "OSRR-B", "NOVACKI", "0,325 KG/M2", "3,50 KG/COL", 2.68],
  ["NIK61", "NIK61", "OSRR-B", "NOVACKI", "0,390 KG/M2", "5,00 KG/COL", 3.21],
  ["NIK62", "NIK62", "OSRR-B", "NOVACKI", "0,450 KG/M2", "5,50 KG/COL", 3.65],
  ["NIK70", "NIK70", "ODRR-BB", "NOVACKI", "0,555 KG/M2", "6,20 KG/COL", 4.53],
  ["NIK68", "NIK68", "ODRR-BB", "NOVACKI", "0,650 KG/M2", "7,50 KG/COL", 5.34],
  ["NIK69", "NIK69", "ODRR-BB", "NOVACKI", "0,785 KG/M2", "10,00 KG/COL", 6.54],
].map(([code, name, paperType, supplier, grammage, pressure, costIpi]) => ({
  id: String(code).toLowerCase(),
  code: String(code),
  name: String(name),
  paperType: String(paperType),
  supplier: String(supplier),
  grammage: String(grammage),
  pressure: String(pressure),
  costIpi: Number(costIpi),
}));

export const initialEngineeringFormulas: EngineeringFormula[] = [
  ["MN-B", "MALETA NORMAL - B", "MALETA", "B", "(L/2)+3 + A+6 + (L/2)+3", "C+3 + L+3 + C+3 + L+3 + 30"],
  ["MN-BC", "MALETA NORMAL - BC", "MALETA", "BC", "(L/2)+6 + A+12 + (L/2)+6", "C+6 + L+6 + C+6 + L+6 + 35"],
  ["MT-B", "MALETA TRANSPASSE TOTAL - B", "MALETA", "B", "L+3 + A+6 + L+3", "C+3 + L+3 + C+3 + L+3 + 30"],
  ["MT-BC", "MALETA TRANSPASSE TOTAL - BC", "MALETA", "BC", "L+6 + A+12 + L+6", "C+6 + L+6 + C+6 + L+6 + 35"],
  ["CV-GERAL", "CORTE E VINCO GERAL", "CORTE-VINCO", "B / BC", "L + 30", "C + 30"],
  ["SEDEX-B", "CAIXA SEDEX - B", "CORTE-VINCO", "B", "((((A+1)+8+(A+3))*2)+12)+(C+23) + 30", "(A+3)+(L+3)+(A+4)+(L+5)+(A+3) + 30"],
  ["SEDEX-BC", "CAIXA SEDEX - BC", "CORTE-VINCO", "BC", "((((A+3)+18+(A+6))*2)+20)+(C+48) + 30", "(A+6)+(L+6)+(A+8)+(L+13)+(A+11) + 30"],
  ["TAB-B", "TABULEIRO - B", "ACESSORIO", "B", "L", "C"],
  ["TAB-BC", "TABULEIRO - BC", "ACESSORIO", "BC", "L", "C"],
].map(([style, description, category, wave, widthFormula, lengthFormula]) => ({
  id: String(style).toLowerCase(),
  style: String(style),
  description: String(description),
  category: String(category),
  wave: String(wave),
  widthFormula: String(widthFormula),
  lengthFormula: String(lengthFormula),
}));

export const defaultPricingParams: PricingParams = {
  mcDefault: 40,
  mcrHour: 1500,
  commission: 2,
  simplesTax: 5,
  freight: 2.27,
  otherCosts: 1.7,
  icmsDawos: 12,
  clientIcms: 12,
  additionalCosts: 8,
  outputIcms: 12,
  outputPisCofins: 3.65,
  outputIpi: 3.25,
};

export const defaultPaperCostParams: PaperCostParams = {
  ipi: 3.25,
  icms: 12,
  pisCofins: 9.65,
};

export const defaultPricingGoals: PricingGoals = {
  mcPercent: { redMax: 20, greenMin: 35 },
  mcrHour: { redMax: 500, greenMin: 1201 },
  pricePerKg: { redMax: 10, greenMin: 14.1 },
};

function clonePricingGoals(): PricingGoals {
  return {
    mcPercent: { ...defaultPricingGoals.mcPercent },
    mcrHour: { ...defaultPricingGoals.mcrHour },
    pricePerKg: { ...defaultPricingGoals.pricePerKg },
  };
}

export const defaultPricingGoalsByCompany: PricingGoalsByCompany = {
  dawos: clonePricingGoals(),
  carcat: clonePricingGoals(),
  gta: clonePricingGoals(),
};

export const defaultQuoteParametersByCompany: import("@/types/gerenciador").QuoteParametersByCompany = {
  dawos: {
    name: "DAWOS EMBALAGENS",
    address: "",
    phone: "",
    email: "",
    site: "",
    logo: "/companies/dawos-logo.jpg",
    technicalNotes: "",
  },
  carcat: {
    name: "CARCAT EMBALAGENS",
    address: "",
    phone: "",
    email: "",
    site: "",
    logo: "",
    technicalNotes: "",
  },
  gta: {
    name: "GTA EMBALAGENS LTDA",
    address: "",
    phone: "",
    email: "",
    site: "",
    logo: "",
    technicalNotes: "",
  },
};

export const reminderFormulas: ReminderFormula[] = [
  {
    id: "variaveis",
    title: "VARIAVEIS USADAS NAS FORMULAS",
    description: "PADRAO DE LEITURA PARA AS FORMULAS DE ENGENHARIA E PRECIFICACAO.",
    items: [
      "C = COMPRIMENTO INTERNO DA CAIXA.",
      "L = LARGURA INTERNA DA CAIXA.",
      "A = ALTURA INTERNA DA CAIXA.",
      "FORMULA LARGURA DEFINE A LARGURA DA CHAPA ABERTA.",
      "FORMULA COMPRIMENTO DEFINE O COMPRIMENTO DA CHAPA ABERTA.",
    ],
  },
  {
    id: "preco",
    title: "LEMBRETES DE PRECIFICACAO",
    description: "REGRAS GERAIS USADAS NA FORMACAO DE PRECO.",
    items: [
      "MATERIAIS ESPECIFICOS ALIMENTAM O CUSTO DE PAPEL.",
      "CUSTO DE PAPEL CALCULA COMPRA S/ IPI, COMPRA NO L/P, PIS/COFINS E CUSTO S/ NOTA.",
      "PARAMETROS DE PRECO SAO USADOS PARA MARGEM, CUSTOS OPERACIONAIS E IMPOSTOS DE SAIDA.",
      "TEMPOS DE PRODUCAO ALIMENTAM O CALCULO DE MCR/HORA E PRODUTIVIDADE.",
    ],
  },
  {
    id: "operacao",
    title: "LEMBRETES OPERACIONAIS",
    description: "PONTOS PARA CONFERENCIA ANTES DE FECHAR ORCAMENTO.",
    items: [
      "CONFIRA SE O MATERIAL ESCOLHIDO TEM GRAMATURA, RESISTENCIA E PRECO C/ IPI.",
      "CONFIRA SE A FORMULA DA CAIXA CORRESPONDE AO MODELO SELECIONADO.",
      "CONFIRA SE OS PARAMETROS DA EMPRESA ESTAO ATUALIZADOS ANTES DE CALCULAR.",
      "ALTERACOES DE TEMPO DE PRODUCAO DEVEM SER SALVAS PARA VIRAR NOVO PADRAO.",
    ],
  },
];
