import { StoreError } from "@/lib/errors";
import type { MarketplaceConversationRecord, MarketplaceMessageRecord } from "@/lib/marketplace/types";

const MAX_BODY = 1000;

export function sanitizeMarketplaceMessageBody(raw: string): string {
  const body = raw.trim().replace(/\s+/g, " ");
  if (body.length < 1 || body.length > MAX_BODY) {
    throw new StoreError("Message must be 1–1000 characters.", 400);
  }
  return body;
}

export function assertConversationParticipant(
  conversation: MarketplaceConversationRecord,
  userId: string,
): "buyer" | "seller" {
  if (conversation.buyerUserId === userId) return "buyer";
  if (conversation.sellerUserId === userId) return "seller";
  throw new StoreError("You cannot access this conversation.", 403);
}

export function unreadFor(conversation: MarketplaceConversationRecord, userId: string): number {
  if (conversation.buyerUserId === userId) return conversation.buyerUnread;
  if (conversation.sellerUserId === userId) return conversation.sellerUnread;
  return 0;
}

export function sortMessages(messages: MarketplaceMessageRecord[]): MarketplaceMessageRecord[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
