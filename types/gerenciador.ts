export type Supplier = {
  id: string;
  name: string;
};

export type PaperType = {
  id: string;
  code: string;
  description: string;
};

export type SpecificMaterial = {
  id: string;
  code: string;
  name: string;
  paperType: string;
  supplier: string;
  grammage: string;
  pressure: string;
  costIpi: number;
};

export type EngineeringFormula = {
  id: string;
  style: string;
  description: string;
  category: string;
  wave: string;
  widthFormula: string;
  lengthFormula: string;
};

export type PaperCostParams = {
  ipi: number;
  icms: number;
  pisCofins: number;
};

export type PricingParams = {
  mcDefault: number;
  mcrHour: number;
  commission: number;
  simplesTax: number;
  freight: number;
  otherCosts: number;
  icmsDawos: number;
  clientIcms: number;
  additionalCosts: number;
  outputIcms: number;
  outputPisCofins: number;
  outputIpi: number;
};

export type PricingGoalRange = {
  redMax: number;
  greenMin: number;
};

export type PricingGoals = {
  mcPercent: PricingGoalRange;
  mcrHour: PricingGoalRange;
  pricePerKg: PricingGoalRange;
};

export type PricingGoalCompany = "dawos" | "carcat" | "gta";

export type PricingGoalsByCompany = Record<PricingGoalCompany, PricingGoals>;

export type QuoteCompanyKey = PricingGoalCompany;

export type QuoteCompanyParameters = {
  name: string;
  address: string;
  phone: string;
  email: string;
  site: string;
  logo: string;
  technicalNotes: string;
  validityDays: number;
};

export type QuoteParametersByCompany = Record<QuoteCompanyKey, QuoteCompanyParameters>;

export type ProductionTime = {
  id: string;
  sector: string;
  paperType: string;
  materialCode: string;
  minWeight: number;
  maxWeight: number;
  setupMinutes: number;
  boxesPerHour: number;
};

export type ReminderFormula = {
  id: string;
  title: string;
  description: string;
  items: string[];
};

export type ProductComponent = {
  id: string;
  reference: string;
  price: number;
  revision: string;
  company: string;
  clientId: string;
  materialId?: string;
  laudo: "SIM" | "NAO";
  palete: "SIM" | "NAO";
  tieCount: number;
  status: "INATIVO" | "DESENVOLVIMENTO" | "PRE-CALCULO" | "PRODUTO FINAL";
  length: number;
  width: number;
  height: number;
  topOverlap: number;
  bottomOverlap: number;
  knifeWidth: number;
  knifeWidthBoxes: number;
  knifeLength: number;
  knifeLengthBoxes: number;
  supplierQuality: string;
  color1: string;
  color2: string;
  engineeringId: string;
  observations: string;
};

export type ProductPriceSnapshot = {
  id: string;
  source: string;
  price: number;
  createdAt: string;
  sellerCompany?: string;
  mcPercent?: number;
  mcrHour?: number;
  pricePerKg?: number;
  setupMinutes?: number;
  boxesPerHour?: number;
  commissionPercent?: number;
  quantity?: number;
  materialCode?: string;
  paperType?: string;
  areaM2?: number;
  weightKg?: number;
  totalOrder?: number;
};

export type ProductFicha = ProductComponent & {
  ftNumber: string;
  accessories: ProductComponent[];
  pricingData?: ProductPriceSnapshot;
  priceHistory?: ProductPriceSnapshot[];
};
