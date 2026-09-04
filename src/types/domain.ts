/**
 * App-facing domain model.
 *
 * These are what screens and hooks speak. Supabase rows are mapped into these
 * in `src/lib/api/*` so a schema change touches one mapping function rather
 * than forty components.
 *
 * Money is ALWAYS agorot. Distance is ALWAYS metres. Timestamps are ALWAYS
 * ISO 8601 strings in UTC.
 */

export type CategorySlug =
  | 'power-tools'
  | 'hand-tools'
  | 'gardening'
  | 'cleaning'
  | 'ladders'
  | 'painting'
  | 'automotive'
  | 'woodworking'
  | 'home-repair'
  | 'moving'
  | 'camping'
  | 'other';

export type RiskLevel = 'low' | 'medium' | 'high';
export type PaymentMode = 'free' | 'offline' | 'in_app';
export type AvailabilityMode = 'now' | 'dates' | 'ask';
export type ListingStatus = 'draft' | 'active' | 'paused' | 'borrowed' | 'removed';
export type Condition = 'like_new' | 'good' | 'worn';
export type VerificationLevel = 'none' | 'email' | 'phone' | 'id';

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type TransactionStatus =
  | 'agreed'
  | 'picked_up'
  | 'returned'
  | 'completed'
  | 'disputed'
  | 'cancelled';

export type Category = {
  id: number;
  slug: CategorySlug;
  icon: string;
  risk: RiskLevel;
};

export type PublicProfile = {
  id: string;
  firstName: string;
  avatarUrl: string | null;
  neighbourhood: string | null;
  /** Bayesian-smoothed, so one 5★ review doesn't outrank forty 4.8s. */
  rating: number | null;
  ratingCount: number;
  completedExchanges: number;
  verificationLevel: VerificationLevel;
  memberSince: string;
};

/**
 * A recurring pickup window, e.g. "Sun–Thu, 18:00–20:00".
 *
 * Weekly rather than a list of dates because that is how people actually lend:
 * "evenings after work" is a habit, not a calendar. `weekday` is 0 = Sunday, to
 * match Postgres `extract(dow …)` and the Israeli week.
 */
export type PickupWindow = {
  weekday: number;
  /** 'HH:MM', local to the owner. */
  startTime: string;
  endTime: string;
};

/** One line of "what's in the box", with a glyph so it reads at a glance. */
export type IncludedItem = {
  label: string;
  icon: 'battery' | 'charger' | 'case' | 'item';
};

/** A tool as it appears in search results — public data only. */
export type ToolSummary = {
  id: string;
  title: string;
  toolType: string;
  brand: string | null;
  categoryId: number;
  categorySlug: CategorySlug;
  paymentMode: PaymentMode;
  pricePerDayAgorot: number | null;
  currency: string;
  availabilityMode: AvailabilityMode;
  risk: RiskLevel;
  neighbourhood: string | null;
  /** Already rounded to 50 m by the server. Never display more precisely. */
  distanceM: number;
  /** The FUZZED point — a stable 100–200 m offset. Never the real location. */
  coords: { latitude: number; longitude: number };
  photoUrl: string | null;
  owner: Pick<PublicProfile, 'id' | 'firstName' | 'avatarUrl' | 'rating' | 'ratingCount'>;
  isFavorite?: boolean;
};

export type ToolDetail = ToolSummary & {
  model: string | null;
  isModelConfirmed: boolean;
  description: string | null;
  condition: Condition | null;
  /** Free text, kept for listings created before `includedItems` existed. */
  accessories: string | null;
  includedItems: IncludedItem[];
  pickupWindows: PickupWindow[];
  instructions: string | null;
  maxBorrowDays: number | null;
  depositAgorot: number | null;
  photos: string[];
  ownerProfile: PublicProfile;
  status: ListingStatus;
  createdAt: string;
};

export type ToolFilters = {
  freeOnly: boolean;
  availableNow: boolean;
  radiusM: number;
  categoryId: number | null;
  maxPriceAgorot: number | null;
  toolTypes: string[] | null;
  query: string | null;
};

export const DEFAULT_FILTERS: ToolFilters = {
  freeOnly: false,
  availableNow: false,
  radiusM: 500,
  categoryId: null,
  maxPriceAgorot: null,
  toolTypes: null,
  query: null,
};

export type BorrowRequest = {
  id: string;
  toolId: string;
  toolTitle: string;
  toolPhotoUrl: string | null;
  borrower: Pick<PublicProfile, 'id' | 'firstName' | 'avatarUrl' | 'rating'>;
  owner: Pick<PublicProfile, 'id' | 'firstName' | 'avatarUrl' | 'rating'>;
  status: RequestStatus;
  startAt: string;
  endAt: string;
  message: string | null;
  quotedTotalAgorot: number | null;
  paymentMode: PaymentMode;
  createdAt: string;
};

export type Transaction = {
  id: string;
  requestId: string;
  toolId: string;
  toolTitle: string;
  toolPhotoUrl: string | null;
  ownerId: string;
  borrowerId: string;
  counterparty: Pick<PublicProfile, 'id' | 'firstName' | 'avatarUrl' | 'rating'>;
  /** Which side the current user is on. Drives every label on the screen. */
  viewerRole: 'owner' | 'borrower';
  status: TransactionStatus;
  agreedTotalAgorot: number | null;
  currency: string;
  dueAt: string;
  pickedUpAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
  conversationId: string | null;
  hasRated: boolean;
};

/** Only ever obtained from get_pickup_location(), after a request is accepted. */
export type PickupLocation = {
  latitude: number;
  longitude: number;
  addressLine: string | null;
  pickupNotes: string | null;
};

export type Conversation = {
  id: string;
  toolId: string | null;
  toolTitle: string | null;
  toolPhotoUrl: string | null;
  transactionId: string | null;
  counterparty: Pick<PublicProfile, 'id' | 'firstName' | 'avatarUrl'>;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: boolean;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text' | 'system' | 'quick_reply';
  body: string;
  createdAt: string;
  /** Set while an optimistic message is still in flight. */
  pending?: boolean;
};

export type Rating = {
  id: string;
  transactionId: string;
  raterId: string;
  rateeId: string;
  direction: 'borrower_to_owner' | 'owner_to_borrower';
  stars: number;
  tags: string[];
  comment: string | null;
  createdAt: string;
  raterName?: string;
};

export type ToolRequest = {
  id: string;
  requesterId: string;
  requesterName: string;
  rawText: string;
  parsedToolTypes: string[];
  categoryId: number | null;
  radiusM: number;
  neededFrom: string | null;
  neededTo: string | null;
  distanceM: number | null;
  status: 'open' | 'fulfilled' | 'expired' | 'cancelled';
  offerCount: number;
  createdAt: string;
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  route: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPrefs = {
  borrowRequests: boolean;
  requestResponses: boolean;
  messages: boolean;
  reminders: boolean;
  nearbyToolRequests: boolean;
};

export type Coords = { latitude: number; longitude: number };
