export type QuoteKind = "DIRECT" | "ENGINEERING";
export type QuoteRecipient = "CLIENT" | "REPRESENTATIVE";

export type QuoteItem = {
  id?: string;
  itemNumber: number;
  ftNumber: string;
  description: string;
  length: number;
  width: number;
  height: number;
  area: number;
  quality: string;
  boxType: string;
  material: string;
  quantity: number;
  unitPrice: number;
  ipiPercent: number;
  ipiValue: number;
  total: number;
  snapshot?: Record<string, unknown>;
};

export type QuoteRecord = {
  id: string;
  quoteNumber: string;
  kind: QuoteKind;
  status: "DRAFT" | "FINALIZED";
  recipient: QuoteRecipient;
  sellerCompanyName: string;
  sellerCompanySlug: string;
  clientId?: string;
  clientName: string;
  clientCnpj: string;
  buyerName: string;
  phone: string;
  email: string;
  address: string;
  representativeName: string;
  issueDate: string;
  deliveryDate: string;
  validUntil: string;
  paymentTerms: string;
  freight: string;
  observations: string;
  productTotal: number;
  ipiTotal: number;
  grandTotal: number;
  items: QuoteItem[];
};

export type CrmOpportunityLinkCandidate = {
  id: string;
  title: string;
  stage: string;
  estimatedValue: number;
  productReference: string;
  expectedCloseDate: string;
};

export type QuoteDraft = Omit<QuoteRecord, "id" | "quoteNumber" | "status" | "productTotal" | "ipiTotal" | "grandTotal" | "items"> & {
  items: QuoteItem[];
  crmOpportunityId?: string;
};

export type PricingQuotePrefill = {
  kind: QuoteKind;
  sellerCompanyName: string;
  sellerCompanySlug: string;
  clientId?: string;
  clientName?: string;
  buyerName?: string;
  phone?: string;
  email?: string;
  clientCnpj?: string;
  address?: string;
  representativeName?: string;
  fichaId?: string;
  items: QuoteItem[];
};
