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
  ignoreAdditionalCosts?: boolean;
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
  ignoreAdditionalCosts = false,
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
  const shouldIgnoreAdditionalCosts = sellerCompany.key === "dawos" && ignoreAdditionalCosts;
  const preliminaryExpensesPercent = getExpensesPercent(
    sellerCompany.key,
    params,
    params.commission,
    shouldIgnoreAdditionalCosts
  );
  const preliminaryExpensesRate = preliminaryExpensesPercent / 100;
  const mcRate = params.mcDefault / 100;
  const preliminaryStandardPrice = calculatePriceForMargin(pricingMaterialCost, mcRate, preliminaryExpensesRate);
  const preliminaryNetPrice = preliminaryStandardPrice * (1 - preliminaryExpensesRate);
  const preliminaryMarginValue = preliminaryNetPrice - pricingMaterialCost;
  const commissionPercent = calculateDynamicCommission(
    params.mcDefault,
    lotQuantity,
    sheetArea * grammage
  );
  const expensesPercent = getExpensesPercent(
    sellerCompany.key,
    params,
    commissionPercent,
    shouldIgnoreAdditionalCosts
  );
  const expensesRate = expensesPercent / 100;
  const standardPrice = calculatePriceForMargin(pricingMaterialCost, mcRate, expensesRate);
  const netPrice = standardPrice * (1 - expensesRate);
  const marginValue = netPrice - pricingMaterialCost;
  const unitWeightKg = sheetArea * grammage;
  const totalWeightKg = unitWeightKg * lotQuantity;
  const totalOrder = standardPrice * lotQuantity;
  const commissionValue = totalOrder * (commissionPercent / 100);
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
  const simulatedBoxesPerHour = Math.max(0, manualBoxesPerHour);
  const tableBoxesPerHour = hasRegisteredProductionTime ? productionTime!.boxesPerHour : 0;
  const boxesPerHour = simulatedBoxesPerHour > 0 ? simulatedBoxesPerHour : tableBoxesPerHour;
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
    commissionPercent,
    preliminaryCommissionPercent: params.commission,
    commissionReferenceMcPercent: params.mcDefault,
    preliminaryExpensesPercent,
    preliminaryMarginValue,
    sellerCompanyKey: sellerCompany.key,
    pricingParams: params,
    ignoreAdditionalCosts: shouldIgnoreAdditionalCosts,
    expensesPercent,
    additionalCostsIgnored: shouldIgnoreAdditionalCosts,
    configuredAdditionalCosts: params.additionalCosts,
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
    tableBoxesPerHour,
    productionCapacitySimulated: simulatedBoxesPerHour > 0,
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
  const preliminaryExpensesPercent = getExpensesPercent(
    analysis.sellerCompanyKey,
    analysis.pricingParams,
    analysis.preliminaryCommissionPercent,
    analysis.ignoreAdditionalCosts
  );
  const preliminaryExpensesRate = preliminaryExpensesPercent / 100;
  const preliminaryNetPrice = price * (1 - preliminaryExpensesRate);
  const preliminaryMarginValue = preliminaryNetPrice - analysis.pricingMaterialCost;
  const preliminaryMcPercent = preliminaryNetPrice !== 0
    ? (preliminaryMarginValue / preliminaryNetPrice) * 100
    : 0;
  const commissionPercent = calculateDynamicCommission(
    preliminaryMcPercent,
    analysis.lotQuantity,
    analysis.unitWeightKg
  );
  return calculatePriceResultWithCommission(price, analysis, commissionPercent, preliminaryMcPercent);
}

function calculatePriceResultWithCommission(
  price: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>,
  commissionPercent: number,
  preliminaryMcPercent: number
) {
  const expensesPercent = getExpensesPercent(
    analysis.sellerCompanyKey,
    analysis.pricingParams,
    commissionPercent,
    analysis.ignoreAdditionalCosts
  );
  const expensesRate = expensesPercent / 100;
  const netPrice = price * (1 - expensesRate);
  const marginValue = netPrice - analysis.pricingMaterialCost;
  const mcPercent = netPrice !== 0 ? (marginValue / netPrice) * 100 : 0;
  const mch = analysis.totalMinutes > 0
    ? marginValue * analysis.lotQuantity * (60 / analysis.totalMinutes)
    : 0;
  const pricePerKg = analysis.unitWeightKg > 0 ? price / analysis.unitWeightKg : 0;
  const totalOrder = price * analysis.lotQuantity;
  const commissionValue = totalOrder * (commissionPercent / 100);

  return { netPrice, marginValue, mcPercent, mch, pricePerKg, totalOrder, commissionValue, commissionPercent, preliminaryMcPercent };
}

export function calculatePriceForMarginTarget(
  mcPercent: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  const commissionPercent = calculateDynamicCommission(mcPercent, analysis.lotQuantity, analysis.unitWeightKg);
  const expensesPercent = getExpensesPercent(
    analysis.sellerCompanyKey,
    analysis.pricingParams,
    commissionPercent,
    analysis.ignoreAdditionalCosts
  );
  return calculatePriceForMargin(
    analysis.pricingMaterialCost,
    mcPercent / 100,
    expensesPercent / 100
  );
}

export function calculatePriceForHourlyTarget(
  targetMch: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>
) {
  if (!analysis.productionDataReady) return 0;

  const preliminaryExpensesPercent = getExpensesPercent(
    analysis.sellerCompanyKey,
    analysis.pricingParams,
    analysis.preliminaryCommissionPercent,
    analysis.ignoreAdditionalCosts
  );
  const preliminaryPrice = calculatePriceForHourlyTargetWithExpenses(targetMch, analysis, preliminaryExpensesPercent);
  const preliminaryResult = calculatePriceResultWithCommission(
    preliminaryPrice,
    analysis,
    analysis.preliminaryCommissionPercent,
    0
  );
  const commissionPercent = calculateDynamicCommission(
    preliminaryResult.mcPercent,
    analysis.lotQuantity,
    analysis.unitWeightKg
  );
  const expensesPercent = getExpensesPercent(
    analysis.sellerCompanyKey,
    analysis.pricingParams,
    commissionPercent,
    analysis.ignoreAdditionalCosts
  );
  return calculatePriceForHourlyTargetWithExpenses(targetMch, analysis, expensesPercent);
}

function calculatePriceForHourlyTargetWithExpenses(
  targetMch: number,
  analysis: ReturnType<typeof calculatePriceAnalysis>,
  expensesPercent: number
) {
  const expensesRate = expensesPercent / 100;
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

function getExpensesPercent(
  company: SellerCompanyKey,
  params: PricingParams,
  commissionPercent: number,
  ignoreAdditionalCosts = false
) {
  if (company === "carcat") {
    return params.simplesTax + commissionPercent + params.freight + params.otherCosts;
  }

  if (company === "gta") {
    return params.outputIcms + params.outputPisCofins + params.outputIpi + commissionPercent + params.freight + params.otherCosts;
  }

  const additionalCosts = ignoreAdditionalCosts ? 0 : params.additionalCosts;
  return commissionPercent + params.freight + params.otherCosts + params.clientIcms + additionalCosts;
}

function calculateDynamicCommission(mcPercent: number, lotQuantity: number, unitWeightKg: number) {
  return commissionByMc(mcPercent) + commissionByVolume(lotQuantity) + commissionByWeight(unitWeightKg);
}

function commissionByMc(mcPercent: number) {
  if (mcPercent >= 45) return 1.33;
  if (mcPercent >= 40) return 1;
  if (mcPercent >= 35) return 0.66;
  if (mcPercent >= 10) return 0.34;
  return 0;
}

function commissionByVolume(lotQuantity: number) {
  if (lotQuantity >= 1000) return 1.33;
  if (lotQuantity >= 500) return 1;
  if (lotQuantity >= 201) return 0.66;
  if (lotQuantity >= 100) return 0.34;
  return 0;
}

function commissionByWeight(unitWeightKg: number) {
  if (unitWeightKg >= 1) return 1.33;
  if (unitWeightKg >= 0.7) return 1;
  if (unitWeightKg >= 0.5) return 0.66;
  if (unitWeightKg >= 0.1) return 0.34;
  return 0;
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
