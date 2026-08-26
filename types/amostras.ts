export type SampleStatus = "REQUESTED" | "IN_PRODUCTION" | "SENT" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ClientSampleRecord = {
  id: string;
  sampleNumber: number;
  sampleCode: string;
  clientId: string;
  clientName: string;
  sellerCompanyId: string;
  sellerCompanyName: string;
  responsibleProfileId: string;
  responsibleName: string;
  requestedAt: string;
  deliveryDate: string;
  status: SampleStatus;
  productDescription: string;
  dimensions: string;
  quantity: number;
  shippingMethod: string;
  trackingCode: string;
  notes: string;
  updatedAt: string;
};

export type ClientSampleFormData = {
  id?: string;
  clientId: string;
  sellerCompanyId: string;
  responsibleProfileId: string;
  requestedAt: string;
  deliveryDate: string;
  status: SampleStatus;
  productDescription: string;
  dimensions: string;
  quantity: string;
  shippingMethod: string;
  trackingCode: string;
  notes: string;
};
