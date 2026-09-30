export type SampleStatus = "REQUESTED" | "IN_PRODUCTION" | "READY" | "SENT" | "APPROVED" | "REJECTED" | "CANCELLED";
export type SampleControlStage = "PRODUCAO" | "ENTREGA" | "APROVACAO" | "ENCERRADA";

export type SampleDeadlineEvent = {
  id: string; stage: Exclude<SampleControlStage, "ENCERRADA">;
  action: "BASELINE" | "REPROGRAM" | "MARK_READY" | "MARK_DELIVERED" | "APPROVE" | "REJECT";
  oldDueDate: string; newDueDate: string; actualDate: string; reason: string;
  changedByName: string; createdAt: string;
};

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
  productionDueDate: string;
  readyAt: string;
  customerDeliveryDate: string;
  deliveredAt: string;
  approvalDueDate: string;
  approvedAt: string;
  controlStage: SampleControlStage;
  controlDueDate: string;
  controlCurrentDueDate?: string;
  closedAt: string;
  status: SampleStatus;
  productFichaId: string;
  productDescription: string;
  dimensions: string;
  quantity: number;
  shippingMethod: string;
  trackingCode: string;
  notes: string;
  updatedAt: string;
  originalProductionDueDate?: string;
  originalCustomerDeliveryDate?: string;
  originalApprovalDueDate?: string;
  deadlineBaselineAt?: string;
};

export type ClientSampleFormData = {
  id?: string;
  clientId: string;
  responsibleProfileId: string;
  requestedAt: string;
  deliveryDate: string;
  productionDueDate: string;
  readyAt: string;
  customerDeliveryDate: string;
  deliveredAt: string;
  approvalDueDate: string;
  approvedAt: string;
  closedAt: string;
  status: SampleStatus;
  productFichaId: string;
  productDescription: string;
  dimensions: string;
  quantity: string;
  shippingMethod: string;
  trackingCode: string;
  notes: string;
};
