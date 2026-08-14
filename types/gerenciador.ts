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
