export type ListingKind = "permanent" | "temporary";
export type ListingPriceMode = "fixed" | "negotiable" | "hidden";
export type ListingAvailability = "available" | "preorder" | "unavailable" | "sold_out";
export type ListingModerationStatus = "pending" | "approved" | "rejected" | "hidden";

export type MarketplaceListingRecord = {
  id: string;
  chefProfileId: string;
  sellerUserId: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  kind: ListingKind;
  priceMode: ListingPriceMode;
  priceMad: number | null;
  availability: ListingAvailability;
  isPublished: boolean;
  moderationStatus: ListingModerationStatus;
  moderationReason: string | null;
  previouslyApprovedAt: string | null;
  city: string;
  neighborhood: string;
  expiresAt: string | null;
  isDeleted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceConversationRecord = {
  id: string;
  buyerUserId: string;
  sellerUserId: string;
  listingId: string | null;
  lastMessageAt: string | null;
  buyerUnread: number;
  sellerUnread: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceMessageRecord = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export type SellerPresenceRecord = {
  sellerUserId: string;
  lastSeenAt: string;
  acceptingInquiries: boolean;
  updatedAt: string;
};

export type AppNotificationRecord = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  dedupeKey: string | null;
  createdAt: string;
};

export type CaseStatus =
  | "open"
  | "under_review"
  | "waiting_for_reporter"
  | "waiting_for_seller"
  | "action_required"
  | "resolved"
  | "dismissed"
  | "reopened";

export type ReportCategory = "spam" | "fraud" | "inappropriate" | "misleading" | "other" | "general";
export type CasePriority = "low" | "normal" | "high" | "urgent";

export type ListingReportRecord = {
  id: string;
  listingId: string;
  reporterUserId: string;
  reason: string;
  description: string | null;
  category: ReportCategory;
  priority: CasePriority;
  status: CaseStatus;
  assignedAdminId: string | null;
  assignedAt: string | null;
  decisionType: string | null;
  decisionReason: string | null;
  decidedByAdminId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ModerationCaseNoteRecord = {
  id: string;
  reportId: string;
  authorAdminId: string;
  body: string;
  createdAt: string;
};

export type ModerationCaseEventRecord = {
  id: string;
  reportId: string;
  actorId: string | null;
  actorRole: string;
  eventType: string;
  summary: string;
  metadata: string | null;
  createdAt: string;
};

export type ModerationCaseMessageRecord = {
  id: string;
  reportId: string;
  senderUserId: string;
  senderRole: "admin" | "reporter" | "seller";
  recipientUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type MarketplaceStoreData = {
  listings: MarketplaceListingRecord[];
  conversations: MarketplaceConversationRecord[];
  messages: MarketplaceMessageRecord[];
  presence: SellerPresenceRecord[];
  notifications: AppNotificationRecord[];
  reports: ListingReportRecord[];
};

export type PublicMarketplaceListing = {
  id: string;
  chefProfileId: string;
  sellerUserId: string;
  title: string;
  description: string;
  category: string;
  images: string[];
  kind: ListingKind;
  priceMode: ListingPriceMode;
  priceMad: number | null;
  availability: ListingAvailability;
  city: string;
  neighborhood: string;
  expiresAt: string | null;
  kitchenName?: string;
  sellerOnline?: boolean;
  sellerAcceptingInquiries?: boolean;
};

export type ListingWriteInput = {
  title: string;
  description: string;
  category: string;
  images: string[];
  kind: ListingKind;
  priceMode: ListingPriceMode;
  priceMad: number | null;
  availability: ListingAvailability;
  city: string;
  neighborhood: string;
  expiresAt: string | null;
  isPublished: boolean;
};
