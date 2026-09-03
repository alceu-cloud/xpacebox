export type CrmHealth = "GREEN" | "YELLOW" | "RED" | "GRAY";

export type CrmActivityType = "WHATSAPP" | "CALL" | "EMAIL" | "VISIT" | "NOTE" | "QUOTE";
export type CrmActivityOutcome = "CONTACTED" | "NO_RESPONSE" | "QUOTE_REQUESTED" | "PURCHASE_EXPECTED" | "FOLLOW_UP" | "NO_INTEREST" | "OTHER";
export type CrmNextActionType = "WHATSAPP" | "CALL" | "EMAIL" | "VISIT" | "QUOTE" | "FOLLOW_UP";
export type CrmOpportunityStage = "CONTACT_PENDING" | "CONTACTED" | "QUOTE_PREPARATION" | "QUOTE_SENT" | "NEGOTIATION" | "WON" | "LOST";

export type CrmCustomerProfile = {
  clientId: string;
  ownerProfileId: string;
  ownerName: string;
  purchaseFrequencyDays: number | null;
  averagePurchaseValue: number;
  lastPurchaseAt: string;
  nextPurchaseAt: string;
  nextContactAt: string;
  relationshipStatus: "ACTIVE" | "DORMANT" | "BLOCKED";
  whatsappOptIn: boolean;
  whatsappOptInAt: string;
  whatsappOptInSource: string;
  notes: string;
  updatedAt: string;
};

export type CrmActivity = {
  id: string;
  clientId: string;
  opportunityId: string;
  representativeProfileId: string;
  representativeName: string;
  activityType: CrmActivityType;
  outcome: CrmActivityOutcome;
  subject: string;
  notes: string;
  occurredAt: string;
  nextActionType: CrmNextActionType | "";
  nextActionAt: string;
};

export type CrmTelephonyCall = {
  id: string;
  clientId: string;
  representativeProfileId: string;
  representativeName: string;
  extension: string;
  direction: "INBOUND" | "OUTBOUND" | "UNKNOWN";
  remotePhone: string;
  status: string;
  startedAt: string;
  durationSeconds: number;
  hasAudio: boolean;
  transcript: string;
  justification: string;
  summary: string;
  qualityScore: number | null;
};

export type CrmOpportunity = {
  id: string;
  clientId: string;
  representativeProfileId: string;
  representativeName: string;
  title: string;
  productFichaId: string;
  productReference: string;
  productQuantity: number;
  productUnitPrice: number;
  stage: CrmOpportunityStage;
  estimatedValue: number;
  expectedCloseDate: string;
  quoteId: string;
  notes: string;
  lostReason: string;
  createdAt: string;
  updatedAt: string;
};

export type CrmQuoteSummary = {
  clientId: string;
  count: number;
  total: number;
  lastQuoteAt: string;
};

export type CrmExpiredQuoteSummary = {
  clientId: string;
  count: number;
};

export type WhatsAppConnection = {
  sellerCompanyId: string;
  sellerCompanyName: string;
  status: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "ERROR";
  displayPhoneNumber: string;
  displayName: string;
  webhookSubscribed: boolean;
  connectedAt: string;
};

export type CrmOverview = {
  currentProfileId: string;
  currentProfileName: string;
  isManager: boolean;
  profiles: CrmCustomerProfile[];
  activities: CrmActivity[];
  telephonyCalls: CrmTelephonyCall[];
  opportunities: CrmOpportunity[];
  quotes: CrmQuoteSummary[];
  expiredQuotes: CrmExpiredQuoteSummary[];
  whatsappConnections: WhatsAppConnection[];
};

export type CrmOperationalLock = {
  activityId: string;
  clientId: string;
  clientName: string;
  representativeProfileId: string;
  opportunityId: string;
  opportunityTitle: string;
  nextActionType: CrmNextActionType | "";
  nextActionAt: string;
  postponementCount: number;
  canPostpone: boolean;
};

export type CrmProfileInput = {
  clientId: string;
  ownerProfileId: string;
  purchaseFrequencyDays: number | null;
  averagePurchaseValue: number;
  lastPurchaseAt: string;
  nextPurchaseAt: string;
  nextContactAt: string;
  relationshipStatus: "ACTIVE" | "DORMANT" | "BLOCKED";
  whatsappOptIn: boolean;
  whatsappOptInSource: string;
  notes: string;
};

export type CrmActivityInput = {
  clientId: string;
  representativeProfileId: string;
  activityType: CrmActivityType;
  outcome: CrmActivityOutcome;
  subject: string;
  notes: string;
  occurredAt: string;
  nextActionType: CrmNextActionType | "";
  nextActionAt: string;
  logOnly?: boolean;
};

export type CrmOpportunityInput = {
  id?: string;
  clientId: string;
  linkedActivityId?: string;
  reuseExistingAgenda?: boolean;
  representativeProfileId: string;
  title: string;
  productFichaId?: string;
  productReference?: string;
  productQuantity?: number;
  productUnitPrice?: number;
  stage: CrmOpportunityStage;
  estimatedValue: number;
  expectedCloseDate: string;
  notes: string;
  lostReason: string;
  nextActionType?: CrmNextActionType | "";
  nextActionAt?: string;
};
