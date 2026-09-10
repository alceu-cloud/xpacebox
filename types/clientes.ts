export type SellerCompanyOption = {
  id: string;
  name: string;
  slug: string;
};

export type RepresentativeOption = {
  id: string;
  name: string;
  email: string;
};

export type ClientChange = {
  field: string;
  label: string;
  previousValue: string;
  nextValue: string;
};

export type ClientChangeLog = {
  id: string;
  changedAt: string;
  changedByName: string;
  changes: ClientChange[];
};

export type ClientRecord = {
  id: string;
  clientNumber: number;
  clientCode: string;
  legalName: string;
  tradeName: string;
  buyerName: string;
  whatsapp: string;
  cnpj: string;
  stateRegistration: string;
  phone: string;
  purchaseEmail: string;
  invoiceEmail: string;
  street: string;
  streetNumber: string;
  complement: string;
  postalCode: string;
  district: string;
  city: string;
  state: string;
  sellerCompanyId: string;
  sellerCompanyName: string;
  representativeUserId: string;
  representativeName: string;
  paymentTerms: string;
  cfop: string;
  freightTerms: string;
  purchaseLimit: string;
  taxRegime: string;
  fiscalProfile: string;
  fiscalBenefit: string;
  icms: string;
  active: boolean;
  updatedAt: string;
  changeHistory: ClientChangeLog[];
};

export type ClientFormData = {
  id?: string;
  legalName: string;
  tradeName: string;
  buyerName: string;
  whatsapp: string;
  cnpj: string;
  stateRegistration: string;
  phone: string;
  purchaseEmail: string;
  invoiceEmail: string;
  street: string;
  streetNumber: string;
  complement: string;
  postalCode: string;
  district: string;
  city: string;
  state: string;
  sellerCompanyId: string;
  representativeUserId: string;
  paymentTerms: string;
  cfop: string;
  freightTerms: string;
  purchaseLimit: string;
  taxRegime: string;
  fiscalProfile: string;
  fiscalBenefit: string;
  icms: string;
};

export type CnpjLookupResult = {
  cnpj: string;
  legalName: string;
  tradeName: string;
  status: string;
  openedAt: string;
  stateRegistration?: string;
  taxRegime?: string;
  phone: string;
  email: string;
  street: string;
  streetNumber: string;
  complement: string;
  postalCode: string;
  district: string;
  city: string;
  state: string;
  mainCnae: string;
  legalNature: string;
};
