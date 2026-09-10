export type SalesOrderItem = {
  id: string;
  itemNumber: number;
  productFichaId: string;
  ftNumber: string;
  revision: string;
  description: string;
  materialCode: string;
  baseQuantity: number;
  quantity: number;
  unitPrice: number;
  ipiPercent: number;
  ipiValue: number;
  total: number;
  netUnitPrice: number | null;
  materialCostUnit: number | null;
  contributionUnit: number | null;
  mcPercent: number | null;
  marginSource: "SNAPSHOT" | "LEGACY_REFERENCE";
};

export type SalesOrder = {
  id: string;
  saleNumber: string;
  crmOpportunityId: string;
  clientId: string;
  clientName: string;
  representativeName: string;
  sellerCompanyName: string;
  sellerCompanySlug: string;
  orderedAt: string;
  notes: string;
  productTotal: number;
  ipiTotal: number;
  grandTotal: number;
  contributionTotal: number | null;
  mcPercent: number | null;
  items: SalesOrderItem[];
};
