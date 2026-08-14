import type {
  EngineeringFormula,
  PaperCostParams,
  PricingParams,
  ProductionTime,
  SpecificMaterial,
} from "@/types/gerenciador";

export type SellerCompanyKey = "dawos" | "carcat" | "gta";

type SellerCompanyPricing = {
  key: SellerCompanyKey;
  taxProfile: {
    simples: number;
    commission: number;
  };
};

type PriceAnalysisInput = {
  sellerCompany: SellerCompanyPricing;
  selectedMaterial?: SpecificMaterial;
  selectedFormula: EngineeringFormula;
  sheetArea: number;
  lotQuantity: number;
  paperCostParams: PaperCostParams;
  pricingParams: PricingParams;
  productionTimes: ProductionTime[];
  ignoreSetup?: boolean;
  manualBoxesPerHour?: number;
};

export function calculatePriceAnalysis({
  sellerCompany,
  selectedMaterial,
  selectedFormula,
  sheetArea,
  lotQuantity,
  paperCostParams,
  pricingParams,
  productionTimes,
  ignoreSetup = false,
  manualBoxesPerHour = 0,
}: PriceAnalysisInput) {
  const params = { ...pricingParams };
  const materialCostM2 = selectedMaterial?.costIpi ?? 0;
  const grammage = parseDecimal(selectedMaterial?.grammage ?? "");
  const materialCostWithIpi = materialCostM2 > 0 && sheetArea > 0
    ? (materialCostM2 * sheetArea) / 0.99
    : 0;
  const materialCostNoInvoice = calculateNoInvoiceMaterialCost(
    materialCostWithIpi,
    paperCostParams.ipi,
    paperCostParams.icms
  );
  const pricingMaterialCost = sellerCompany.key === "carcat"
    ? materialCostWithIpi
    : materialCostNoInvoice;
  const pricingMaterialCostLabel = sellerCompany.key === "carcat" ? "C/ IPI" : "S/ NOTA";
  const expensesPercent = getExpensesPercent(sellerCompany.key, params);
  const expensesRate = expensesPercent / 100;
  const mcRate = params.mcDefault / 100;
  const standardPrice = calculatePriceForMargin(pricingMaterialCost, mcRate, expensesRate);
  const netPrice = standardPrice * (1 - expensesRate);
  const marginValue = netPrice - pricingMaterialCost;
  const unitWeightKg = sheetArea * grammage;
  const totalWeightKg = unitWeightKg * lotQuantity;
  const totalOrder = standardPrice * lotQuantity;
  const commissionValue = totalOrder * (params.commission / 100);
  const pricePerKg = unitWeightKg > 0 ? standardPrice / unitWeightKg : 0;
  const productionTimeMatch = findProductionTime(
    productionTimes,
    selectedMaterial?.paperType ?? selectedFormula.wave,
    selectedMaterial?.code ?? "",
    unitWeightKg
  );
  const productionTime = productionTimeMatch?.time;
  const hasRegisteredProductionTime = Boolean(productionTime && productionTime.boxesPerHour > 0);
  const requiresManualProductionRate = !hasRegisteredProductionTime;
  const configuredSetupMinutes = hasRegisteredProductionTime ? productionTime!.setupMinutes : 15;
  const setupMinutes = ignoreSetup ? 0 : configuredSetupMinutes;
  const boxesPerHour = hasRegisteredProductionTime
    ? productionTime!.boxesPerHour
    : Math.max(0, manualBoxesPerHour);
  const productionDataReady = boxesPerHour > 0;
  const productionMinutes = productionDataReady ? (lotQuantity / boxesPerHour) * 60 : 0;
  const totalMinutes = productionDataReady ? setupMinutes + productionMinutes : 0;
  const mchStandard = totalMinutes > 0 ? marginValue * lotQuantity * (60 / totalMinutes) : 0;
  const targetMarginTotal = params.mcrHour * (totalMinutes / 60);
  const targetMarginUnit = lotQuantity > 0 ? targetMarginTotal / lotQuantity : 0;
  const mchSuggestedPrice = productionDataReady && 1 - expensesRate > 0
    ? (pricingMaterialCost + targetMarginUnit) / (1 - expensesRate)
    : 0;

  return {
    mcDefault: params.mcDefault,
    mcrHour: params.mcrHour,
    commissionPercent: params.commission,
    expensesPercent,
    materialCostWithIpi,
    materialCostNoInvoice,
    pricingMaterialCost,
    pricingMaterialCostLabel,
    standardPrice,
    netPrice,
    marginValue,
    unitWeightKg,
    totalWeightKg,
    totalOrder,
    commissionValue,
    pricePerKg,
    mchStandard,
    mchSuggestedPrice,
    configuredSetupMinutes,
    setupMinutes,
    setupIgnored: ignoreSetup,
    boxesPerHour,
    productionDataReady,
    requiresManualProductionRate,
    productionTimeSource: productionTimeMatch?.source ?? "manual",
    productionReferenceMaterial: productionTime?.materialCode ?? null,
    productionMinutes,
    totalMinutes,
    lotQuantity,
  };
}

export function calculatePriceResult(
  price: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  const expensesRate = analysis.expensesPercent / 100;
  const netPrice = price * (1 - expensesRate);
  const marginValue = netPrice - analysis.pricingMaterialCost;
  const mcPercent = netPrice !== 0 ? (marginValue / netPrice) * 100 : 0;
  const mch = analysis.totalMinutes > 0
    ? marginValue * analysis.lotQuantity * (60 / analysis.totalMinutes)
    : 0;
  const pricePerKg = analysis.unitWeightKg > 0 ? price / analysis.unitWeightKg : 0;
  const totalOrder = price * analysis.lotQuantity;
  const commissionValue = totalOrder * (analysis.commissionPercent / 100);

  return { netPrice, marginValue, mcPercent, mch, pricePerKg, totalOrder, commissionValue };
}

export function calculatePriceForMarginTarget(
  mcPercent: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  return calculatePriceForMargin(
    analysis.pricingMaterialCost,
    mcPercent / 100,
    analysis.expensesPercent / 100
  );
}

export function calculatePriceForHourlyTarget(
  targetMch: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  if (!analysis.productionDataReady) return 0;

  const expensesRate = analysis.expensesPercent / 100;
  const targetMarginTotal = targetMch * (analysis.totalMinutes / 60);
  const targetMarginUnit = analysis.lotQuantity > 0
    ? targetMarginTotal / analysis.lotQuantity
    : 0;

  return 1 - expensesRate > 0
    ? (analysis.pricingMaterialCost + targetMarginUnit) / (1 - expensesRate)
    : 0;
}

export function calculateRequiredLotForHourlyTarget(
  price: number,
  targetMch: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  const priceResult = calculatePriceResult(price, analysis);
  const maximumMch = priceResult.marginValue * analysis.boxesPerHour;

  if (analysis.setupMinutes <= 0 && analysis.boxesPerHour > 0) {
    const attainable = price > 0 && targetMch > 0 && priceResult.marginValue > 0 && maximumMch >= targetMch;
    return {
      attainable,
      quantity: attainable ? 1 : null,
      maximumMch,
      independentOfLot: true as const,
    };
  }

  if (
    price <= 0 ||
    targetMch <= 0 ||
    priceResult.marginValue <= 0 ||
    analysis.boxesPerHour <= 0
  ) {
    return { attainable: false as const, quantity: null, maximumMch, independentOfLot: false as const };
  }

  const denominator = 60 * (priceResult.marginValue - targetMch / analysis.boxesPerHour);
  if (denominator <= 0) {
    return { attainable: false as const, quantity: null, maximumMch, independentOfLot: false as const };
  }

  const exactQuantity = (targetMch * analysis.setupMinutes) / denominator;
  return {
    attainable: Number.isFinite(exactQuantity) && exactQuantity > 0,
    quantity: Number.isFinite(exactQuantity) && exactQuantity > 0 ? Math.ceil(exactQuantity) : null,
    maximumMch,
    independentOfLot: false as const,
  };
}

function calculatePriceForMargin(materialCost: number, mcRate: number, expensesRate: number) {
  const netAfterMargin = 1 - mcRate;
  const netAfterExpenses = 1 - expensesRate;
  return materialCost > 0 && netAfterMargin > 0 && netAfterExpenses > 0
    ? materialCost / netAfterMargin / netAfterExpenses
    : 0;
}

function getExpensesPercent(company: SellerCompanyKey, params: PricingParams) {
  if (company === "carcat") {
    return params.simplesTax + params.commission + params.freight + params.otherCosts;
  }

  if (company === "gta") {
    return params.outputIcms + params.outputPisCofins + params.outputIpi + params.commission + params.freight + params.otherCosts;
  }

  return params.commission + params.freight + params.otherCosts + params.clientIcms + params.additionalCosts;
}

function calculateNoInvoiceMaterialCost(costWithIpi: number, ipiPercent: number, icmsPercent: number) {
  return costWithIpi * (1 - ipiPercent / 100 - icmsPercent / 100);
}

function findProductionTime(
  productionTimes: ProductionTime[],
  paperType: string,
  materialCode: string,
  unitWeightKg: number
) {
  const normalizedPaperType = paperType.toUpperCase();
  const normalizedMaterial = materialCode.toUpperCase();
  const exact = productionTimes.find((time) =>
    time.paperType.toUpperCase() === normalizedPaperType &&
    time.materialCode.toUpperCase() === normalizedMaterial &&
    unitWeightKg >= time.minWeight &&
    unitWeightKg <= time.maxWeight
  );

  if (exact) return { time: exact, source: "exact" as const };

  const similar = productionTimes.find((time) =>
    time.paperType.toUpperCase() === normalizedPaperType &&
    unitWeightKg >= time.minWeight &&
    unitWeightKg <= time.maxWeight
  );

  return similar ? { time: similar, source: "similar" as const } : null;
}

function parseDecimal(value: string) {
  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}
