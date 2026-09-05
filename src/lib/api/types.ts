import type { Identification, Interpretation } from '@/schemas/ai';
import type { ListingInput } from '@/schemas/forms';
import type {
  AppNotification,
  BorrowRequest,
  Conversation,
  Coords,
  Message,
  NotificationPrefs,
  PickupLocation,
  PublicProfile,
  Rating,
  ToolDetail,
  ToolFilters,
  ToolRequest,
  ReservedWindow,
  ToolSummary,
  Transaction,
} from '@/types/domain';

export type SearchParams = ToolFilters & { centre: Coords; limit?: number; offset?: number };

/**
 * The editable part of a listing.
 *
 * Every key optional, so a caller sends only what changed; `null` where the
 * column is nullable means "clear this". Notably absent: `risk`, `toolType`
 * and `brand` — what a thing IS does not change after you publish it, and a
 * listing that can silently become a different tool is a listing a borrower
 * cannot trust.
 */
export type ToolPatch = Partial<{
  title: string;
  description: string | null;
  condition: 'like_new' | 'good' | 'worn';
  accessories: string | null;
  instructions: string | null;
  maxBorrowDays: number | null;
  isFree: boolean;
  pricePerDayAgorot: number | null;
  availabilityMode: 'now' | 'dates' | 'ask';
  categorySlug: string;
  addressLine: string;
  pickupNotes: string;
  coords: Coords;
}>;

export type IdentifyOutcome =
  | { ok: true; tier: 'high' | 'medium' | 'low'; identification: Identification; resultId: string | null }
  | { ok: false; code: 'not_a_tool' | 'quota_exceeded' | 'invalid_image' | 'model_failed' | 'unauthorized' | 'timeout' | 'offline' };

/**
 * The single seam between the app and its backend.
 *
 * Two implementations: `demo` (in-memory seed data, no network, no account) and
 * `live` (Supabase). Screens never import either directly — they go through
 * `src/lib/api/index.ts`, so demo mode is a configuration fact rather than a
 * branch scattered through the UI.
 */
export interface DataSource {
  readonly isDemo: boolean;

  // ── discovery ────────────────────────────────────────────────────────────
  searchTools(params: SearchParams): Promise<ToolSummary[]>;
  getTool(id: string): Promise<ToolDetail | null>;
  getProfile(id: string): Promise<PublicProfile | null>;
  getProfileTools(id: string): Promise<ToolSummary[]>;
  getRatingsFor(userId: string): Promise<Rating[]>;

  // ── supply ───────────────────────────────────────────────────────────────
  getMyTools(): Promise<ToolSummary[]>;
  createTool(input: ListingInput, photoUri: string | null): Promise<{ id: string }>;
  setToolStatus(id: string, status: 'active' | 'paused' | 'removed'): Promise<void>;
  /**
   * Change a published listing.
   *
   * A partial: only the fields present are written, because an edit screen
   * that posts its whole model would overwrite anything it does not happen to
   * show. `null` on a nullable field means "clear it" — the server has an
   * explicit flag for that, so absent and null stay distinguishable.
   */
  updateTool(id: string, patch: ToolPatch): Promise<void>;
  /** Soft delete. Refused while the tool is out on loan. */
  removeTool(id: string): Promise<void>;
  /** Replaces the listing's photo. */
  replaceToolPhoto(id: string, photoUri: string): Promise<void>;

  // ── favourites (the one thing a guest may write) ──────────────────────────
  getFavorites(): Promise<ToolSummary[]>;
  setFavorite(toolId: string, favorite: boolean): Promise<void>;

  // ── transactions ─────────────────────────────────────────────────────────
  createBorrowRequest(input: {
    toolId: string;
    startAt: string;
    endAt: string;
    message: string | null;
    riskAcknowledged: boolean;
  }): Promise<BorrowRequest>;
  getIncomingRequests(): Promise<BorrowRequest[]>;
  getOutgoingRequests(): Promise<BorrowRequest[]>;
  respondToRequest(
    requestId: string,
    decision: 'accepted' | 'declined',
    /** Optional new return time, when the owner accepts on a different day. */
    dueAt?: string | null,
  ): Promise<void>;

  getTransactions(): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | null>;
  /** The ONLY path to a real coordinate, and only for an accepted transaction. */
  getPickupLocation(transactionId: string): Promise<PickupLocation | null>;
  /**
   * Records that the tool physically changed hands. Either side may call it —
   * the owner watched it go and the borrower walked off with it, so making
   * them agree on who taps is friction for its own sake.
   */
  confirmPickup(transactionId: string): Promise<void>;
  /** Anonymous "these dates are taken" for a screenful of cards, in one call. */
  getReservedWindows(toolIds: string[]): Promise<ReservedWindow[]>;
  confirmReturn(transactionId: string): Promise<void>;
  submitRating(input: {
    transactionId: string;
    stars: number;
    tags: string[];
    comment: string | null;
  }): Promise<void>;
  reportIssue(input: {
    transactionId: string;
    reason: 'damaged' | 'not_returned' | 'not_as_described' | 'other';
    description: string;
    photoPaths: string[];
  }): Promise<void>;

  // ── chat ─────────────────────────────────────────────────────────────────
  getConversations(): Promise<Conversation[]>;
  /**
   * Clear a thread from YOUR list.
   *
   * Not a delete: the other person keeps their copy, including the system
   * messages recording when the tool changed hands. It comes back if they
   * write again, because a new message is not old mail.
   */
  hideConversation(conversationId: string): Promise<void>;
  getMessages(conversationId: string): Promise<Message[]>;
  sendMessage(conversationId: string, body: string, kind?: 'text' | 'quick_reply'): Promise<Message>;
  subscribeToMessages(conversationId: string, onMessage: (message: Message) => void): () => void;

  // ── demand signals ───────────────────────────────────────────────────────
  getToolRequests(centre: Coords, radiusM: number): Promise<ToolRequest[]>;
  createToolRequest(input: {
    rawText: string;
    radiusM: number;
    neededFrom: string | null;
    neededTo: string | null;
    centre: Coords;
  }): Promise<ToolRequest>;
  offerTool(toolRequestId: string, toolId: string, message: string | null): Promise<void>;

  // ── AI ───────────────────────────────────────────────────────────────────
  identifyTool(imageUri: string): Promise<IdentifyOutcome>;
  interpretQuery(query: string, locale: string): Promise<Interpretation | null>;

  // ── account ──────────────────────────────────────────────────────────────
  getNotifications(): Promise<AppNotification[]>;
  markNotificationRead(id: string): Promise<void>;
  getNotificationPrefs(): Promise<NotificationPrefs>;
  setNotificationPrefs(prefs: NotificationPrefs): Promise<void>;
  deleteAccount(): Promise<void>;

  /**
   * Demo affordance, not a product feature: gives the signed-in person their
   * own copy of the sample borrow so the Messages tab has something in it
   * when the app is being shown to someone. No-ops if they already have real
   * activity. Backed by `seed_demo_for_me()`, which is dropped before launch.
   */
  loadSampleData(): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Demo affordance: move the seeded listings so they surround `centre`.
   * The seed sits in Tel Aviv; anyone demonstrating the app from elsewhere
   * searches their own neighbourhood and finds nothing, which looks like a
   * bug and isn't one.
   */
  moveDemoToolsHere(centre: Coords): Promise<{ ok: boolean; moved?: number; reason?: string }>;
  /** Demo: a seeded neighbour asks to borrow one of your tools. */
  demoBorrowMyTool(): Promise<{ ok: boolean; tool?: string; reason?: string }>;
  /** Demo: the seeded owners accept the requests you sent them. */
  demoAnswerMyRequests(): Promise<{ ok: boolean; answered?: number; reason?: string }>;
}
