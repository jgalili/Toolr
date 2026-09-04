/**
 * Demo data source — in-memory, no network, no account.
 *
 * This exists so a fresh clone is genuinely useful before any Supabase project
 * exists. It behaves like the real backend, including the rules that matter:
 * distances are pre-rounded to 50 m, coordinates are the fuzzed points, and the
 * pickup address is only returned for an accepted transaction.
 *
 * It deliberately does NOT persist: restarting the app resets it. Anything that
 * needs to survive belongs in a real backend.
 */

import {
  DEMO_USER_ID,
  demoConversations,
  demoMessages,
  demoPickupLocations,
  demoProfiles,
  demoRequests,
  demoTools,
  demoTransactions,
} from '@/demo/seed';
import type { Interpretation } from '@/schemas/ai';
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
  ToolRequest,
  ToolSummary,
  Transaction,
} from '@/types/domain';

import { distanceMetres } from '../geo';
import type { DataSource, IdentifyOutcome, SearchParams } from './types';

/** Mutable copies so the session can add, favourite and message. */
const tools: ToolDetail[] = demoTools.map((t) => ({ ...t }));
const favorites = new Set<string>(['t-ladder']);
const requests: BorrowRequest[] = [...demoRequests];
const transactions: Transaction[] = [...demoTransactions];
const conversations: Conversation[] = [...demoConversations];
const messages: Record<string, Message[]> = Object.fromEntries(
  Object.entries(demoMessages).map(([k, v]) => [k, [...v]]),
);
const toolRequests: ToolRequest[] = [];
const ratings: Rating[] = [];
const listeners: Record<string, ((m: Message) => void)[]> = {};

let prefs: NotificationPrefs = {
  borrowRequests: true,
  requestResponses: true,
  messages: true,
  reminders: true,
  nearbyToolRequests: true,
};

/** A small delay so loading states are visible and honest during development. */
const wait = (ms = 220) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function summarise(tool: ToolDetail, centre: Coords): ToolSummary {
  const raw = distanceMetres(centre, tool.coords);
  return {
    id: tool.id,
    title: tool.title,
    toolType: tool.toolType,
    brand: tool.brand,
    categoryId: tool.categoryId,
    categorySlug: tool.categorySlug,
    paymentMode: tool.paymentMode,
    pricePerDayAgorot: tool.pricePerDayAgorot,
    currency: tool.currency,
    availabilityMode: tool.availabilityMode,
    risk: tool.risk,
    neighbourhood: tool.neighbourhood,
    // Rounded to 50 m, exactly as the real RPC does.
    distanceM: Math.max(50, Math.round(raw / 50) * 50),
    coords: tool.coords,
    photoUrl: tool.photoUrl,
    owner: tool.owner,
    isFavorite: favorites.has(tool.id),
  };
}

/** Mirrors the ranking in `search_tools_nearby` so demo ordering matches production. */
function score(tool: ToolSummary, params: SearchParams): number {
  const availability = tool.availabilityMode === 'now' ? 1 : tool.availabilityMode === 'dates' ? 0.7 : 0.4;
  const fit = params.toolTypes?.includes(tool.toolType)
    ? 1
    : params.categoryId != null && tool.categoryId === params.categoryId
      ? 0.6
      : 0.3;
  const reputation = (tool.owner.rating ?? 4.6) / 5;
  return (
    0.45 * Math.exp(-tool.distanceM / 500) +
    0.2 * availability +
    0.15 * fit +
    0.12 * reputation +
    0.08 * (tool.paymentMode === 'free' ? 1 : 0)
  );
}

function matchesQuery(tool: ToolDetail, query: string): boolean {
  const haystack = [tool.title, tool.toolType, tool.brand, tool.model, tool.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => haystack.includes(word));
}

/**
 * A tiny offline stand-in for the natural-language interpreter, so the
 * "describe the job, not the tool" behaviour is demonstrable without a Gemini
 * key. The real thing is an Edge Function; this is a lookup table.
 */
const INTENT_HINTS: { match: RegExp; types: string[]; en: string; he: string }[] = [
  {
    match: /concrete|masonry|brick|beton|בטון|קיר/i,
    types: ['rotary-hammer', 'cordless-drill'],
    en: 'hammer drills and rotary hammers',
    he: 'פטישונים ומקדחות',
  },
  {
    match: /sand|sanding|smooth|ליטוש|לשייף/i,
    types: ['orbital-sander'],
    en: 'sanders',
    he: 'מלטשות',
  },
  {
    match: /hedge|bush|trim|garden|גינה|גיזום/i,
    types: ['hedge-trimmer', 'lawn-mower'],
    en: 'garden trimmers and mowers',
    he: 'מגזמות ומכסחות',
  },
  {
    match: /hole|drill|hang|shelf|tv|קדח|לתלות|מדף/i,
    types: ['cordless-drill', 'rotary-hammer', 'stud-detector'],
    en: 'drills and a stud detector',
    he: 'מקדחות וגלאי קירות',
  },
  {
    match: /high|ceiling|reach|ladder|גבוה|סולם|תקרה/i,
    types: ['ladder'],
    en: 'ladders',
    he: 'סולמות',
  },
  {
    match: /clean|wash|balcony|tiles|ניקוי|שטיפה|מרפסת/i,
    types: ['pressure-washer'],
    en: 'pressure washers',
    he: 'מכונות שטיפה בלחץ',
  },
  {
    match: /cut wood|curve|plywood|לנסר|עץ/i,
    types: ['jigsaw'],
    en: 'jigsaws',
    he: 'מסורים אנכיים',
  },
];

export const demoSource: DataSource = {
  isDemo: true,

  async searchTools(params) {
    await wait();
    const centre = params.centre;
    let results = tools.filter((t) => t.status === 'active').map((t) => summarise(t, centre));

    results = results.filter((t) => t.distanceM <= params.radiusM);
    if (params.freeOnly) results = results.filter((t) => t.paymentMode === 'free');
    if (params.availableNow) results = results.filter((t) => t.availabilityMode === 'now');
    if (params.categoryId != null) results = results.filter((t) => t.categoryId === params.categoryId);
    if (params.maxPriceAgorot != null) {
      results = results.filter(
        (t) => t.paymentMode === 'free' || (t.pricePerDayAgorot ?? 0) <= params.maxPriceAgorot!,
      );
    }
    if (params.toolTypes?.length) {
      const set = new Set(params.toolTypes);
      const matched = results.filter((t) => set.has(t.toolType));
      // Fall back to everything nearby rather than showing nothing, the way the
      // real query does when an interpretation is too narrow.
      if (matched.length > 0) results = matched;
    }
    if (params.query) {
      const full = tools.filter((t) => matchesQuery(t, params.query!)).map((t) => t.id);
      const set = new Set(full);
      const matched = results.filter((t) => set.has(t.id));
      if (matched.length > 0 || !params.toolTypes?.length) results = matched;
    }

    return results
      .sort((a, b) => score(b, params) - score(a, params) || a.distanceM - b.distanceM)
      .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 30));
  },

  async getTool(id) {
    await wait(150);
    const tool = tools.find((t) => t.id === id);
    if (!tool) return null;
    return { ...tool, isFavorite: favorites.has(tool.id) };
  },

  async getProfile(id) {
    await wait(120);
    return Object.values(demoProfiles).find((p) => p.id === id) ?? null;
  },

  async getProfileTools(id) {
    await wait(120);
    return tools
      .filter((t) => t.owner.id === id && t.status === 'active')
      .map((t) => summarise(t, t.coords));
  },

  async getRatingsFor(userId) {
    await wait(120);
    return ratings.filter((r) => r.rateeId === userId);
  },

  async getMyTools() {
    await wait();
    return tools.filter((t) => t.owner.id === DEMO_USER_ID).map((t) => summarise(t, t.coords));
  },

  async createTool(input: ListingInput, photoUri) {
    await wait(400);
    const me = demoProfiles.dana!;
    const id = `t-new-${Date.now()}`;
    tools.unshift({
      id,
      title: input.title,
      toolType: input.toolType,
      brand: input.brand,
      model: input.model,
      isModelConfirmed: input.isModelConfirmed,
      includedItems: input.accessories
        ? input.accessories
            .split(',')
            .map((label) => label.trim())
            .filter(Boolean)
            .slice(0, 3)
            .map((label) => ({ label, icon: 'item' as const }))
        : [],
      // A brand-new listing has no stated hours yet; the detail screen falls
      // back to "ask the owner for a time" rather than inventing any.
      pickupWindows: [],
      categoryId: 1,
      categorySlug: input.categorySlug as ToolDetail['categorySlug'],
      paymentMode: input.isFree ? 'free' : 'offline',
      pricePerDayAgorot: input.isFree ? null : input.pricePerDayAgorot,
      currency: 'ILS',
      availabilityMode: input.availabilityMode,
      risk: input.risk,
      neighbourhood: input.neighbourhood ?? 'Florentin',
      distanceM: 0,
      coords: input.coords,
      photoUrl: photoUri,
      photos: photoUri ? [photoUri] : [],
      description: input.description,
      condition: input.condition,
      accessories: input.accessories,
      instructions: input.instructions,
      maxBorrowDays: input.maxBorrowDays,
      depositAgorot: null,
      owner: {
        id: me.id,
        firstName: me.firstName,
        avatarUrl: me.avatarUrl,
        rating: me.rating,
        ratingCount: me.ratingCount,
      },
      ownerProfile: me,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    return { id };
  },

  async setToolStatus(id, status) {
    await wait(150);
    const tool = tools.find((t) => t.id === id);
    if (tool) tool.status = status;
  },

  async getFavorites() {
    await wait(150);
    return tools
      .filter((t) => favorites.has(t.id))
      .map((t) => summarise(t, t.coords))
      .map((t) => ({ ...t, isFavorite: true }));
  },

  async setFavorite(toolId, favorite) {
    await wait(80);
    if (favorite) favorites.add(toolId);
    else favorites.delete(toolId);
  },

  async createBorrowRequest(input) {
    await wait(350);
    const tool = tools.find((t) => t.id === input.toolId);
    if (!tool) throw new Error('Tool not found');
    const me = demoProfiles.dana!;
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(input.endAt).getTime() - new Date(input.startAt).getTime()) / 86_400_000,
      ),
    );
    const request: BorrowRequest = {
      id: `r-${Date.now()}`,
      toolId: tool.id,
      toolTitle: tool.title,
      toolPhotoUrl: tool.photoUrl,
      borrower: { id: me.id, firstName: me.firstName, avatarUrl: me.avatarUrl, rating: me.rating },
      owner: {
        id: tool.owner.id,
        firstName: tool.owner.firstName,
        avatarUrl: tool.owner.avatarUrl,
        rating: tool.owner.rating,
      },
      status: 'pending',
      startAt: input.startAt,
      endAt: input.endAt,
      message: input.message,
      quotedTotalAgorot:
        tool.paymentMode === 'free' ? null : (tool.pricePerDayAgorot ?? 0) * days,
      paymentMode: tool.paymentMode,
      createdAt: new Date().toISOString(),
    };
    requests.unshift(request);
    return request;
  },

  async getIncomingRequests() {
    await wait(150);
    return requests.filter((r) => r.owner.id === DEMO_USER_ID);
  },

  async getOutgoingRequests() {
    await wait(150);
    return requests.filter((r) => r.borrower.id === DEMO_USER_ID);
  },

  async respondToRequest(requestId, decision, dueAt) {
    await wait(250);
    const request = requests.find((r) => r.id === requestId);
    if (!request) return;
    request.status = decision;
    if (decision !== 'accepted') return;
    // Demo mode mirrors the server: accepting with a new time moves the return.
    if (dueAt) request.endAt = dueAt;

    const conversationId = `c-${requestId}`;
    conversations.unshift({
      id: conversationId,
      toolId: request.toolId,
      toolTitle: request.toolTitle,
      toolPhotoUrl: request.toolPhotoUrl,
      transactionId: `x-${requestId}`,
      counterparty: {
        id: request.borrower.id,
        firstName: request.borrower.firstName,
        avatarUrl: request.borrower.avatarUrl,
      },
      lastMessage: null,
      lastMessageAt: new Date().toISOString(),
      unread: false,
    });
    messages[conversationId] = [];
    transactions.unshift({
      id: `x-${requestId}`,
      requestId,
      toolId: request.toolId,
      toolTitle: request.toolTitle,
      toolPhotoUrl: request.toolPhotoUrl,
      ownerId: request.owner.id,
      borrowerId: request.borrower.id,
      counterparty: request.borrower,
      viewerRole: 'owner',
      status: 'agreed',
      agreedTotalAgorot: request.quotedTotalAgorot,
      currency: 'ILS',
      dueAt: dueAt ?? request.endAt,
      pickedUpAt: null,
      returnedAt: null,
      completedAt: null,
      conversationId,
      hasRated: false,
    });
  },

  async getTransactions() {
    await wait(150);
    return transactions;
  },

  async getTransaction(id) {
    await wait(120);
    return transactions.find((t) => t.id === id) ?? null;
  },

  async getPickupLocation(transactionId): Promise<PickupLocation | null> {
    await wait(150);
    const tx = transactions.find((t) => t.id === transactionId);
    // The same gate the real SECURITY DEFINER function applies.
    if (!tx || !['agreed', 'picked_up', 'returned'].includes(tx.status)) return null;
    const location = demoPickupLocations[transactionId];
    return location ?? null;
  },

  async confirmPickup(transactionId) {
    await wait(200);
    const tx = transactions.find((t) => t.id === transactionId);
    if (tx) {
      tx.status = 'picked_up';
      tx.pickedUpAt = new Date().toISOString();
    }
  },

  async confirmReturn(transactionId) {
    await wait(200);
    const tx = transactions.find((t) => t.id === transactionId);
    if (tx) {
      tx.status = 'returned';
      tx.returnedAt = new Date().toISOString();
    }
  },

  async submitRating(input) {
    await wait(250);
    const tx = transactions.find((t) => t.id === input.transactionId);
    if (!tx) return;
    tx.hasRated = true;
    tx.status = 'completed';
    tx.completedAt = new Date().toISOString();
    ratings.push({
      id: `rating-${Date.now()}`,
      transactionId: input.transactionId,
      raterId: DEMO_USER_ID,
      rateeId: tx.counterparty.id,
      direction: tx.viewerRole === 'borrower' ? 'borrower_to_owner' : 'owner_to_borrower',
      stars: input.stars,
      tags: input.tags,
      comment: input.comment,
      createdAt: new Date().toISOString(),
    });
  },

  async reportIssue(input) {
    await wait(300);
    const tx = transactions.find((t) => t.id === input.transactionId);
    if (tx) tx.status = 'disputed';
  },

  async getConversations() {
    await wait(150);
    return conversations;
  },

  async getMessages(conversationId) {
    await wait(120);
    return messages[conversationId] ?? [];
  },

  async sendMessage(conversationId, body, kind = 'text') {
    await wait(120);
    const message: Message = {
      id: `m-${Date.now()}`,
      conversationId,
      senderId: DEMO_USER_ID,
      kind,
      body,
      createdAt: new Date().toISOString(),
    };
    messages[conversationId] = [...(messages[conversationId] ?? []), message];
    const conversation = conversations.find((c) => c.id === conversationId);
    if (conversation) {
      conversation.lastMessage = body;
      conversation.lastMessageAt = message.createdAt;
      conversation.unread = false;
    }
    listeners[conversationId]?.forEach((fn) => fn(message));
    return message;
  },

  subscribeToMessages(conversationId, onMessage) {
    listeners[conversationId] = [...(listeners[conversationId] ?? []), onMessage];
    return () => {
      listeners[conversationId] = (listeners[conversationId] ?? []).filter((fn) => fn !== onMessage);
    };
  },

  async getToolRequests(centre, radiusM) {
    await wait(150);
    return toolRequests.filter((r) => (r.distanceM ?? 0) <= radiusM);
  },

  async createToolRequest(input) {
    await wait(300);
    const interpretation = await demoSource.interpretQuery(input.rawText, 'en');
    const request: ToolRequest = {
      id: `tr-${Date.now()}`,
      requesterId: DEMO_USER_ID,
      requesterName: 'Dana',
      rawText: input.rawText,
      parsedToolTypes: interpretation?.tool_types ?? [],
      categoryId: null,
      radiusM: input.radiusM,
      neededFrom: input.neededFrom,
      neededTo: input.neededTo,
      distanceM: 0,
      status: 'open',
      offerCount: 0,
      createdAt: new Date().toISOString(),
    };
    toolRequests.unshift(request);
    return request;
  },

  async offerTool(toolRequestId) {
    await wait(200);
    const request = toolRequests.find((r) => r.id === toolRequestId);
    if (request) request.offerCount += 1;
  },

  async identifyTool(imageUri): Promise<IdentifyOutcome> {
    // Demo mode has no vision model. Rather than fake a confident answer — which
    // would misrepresent how the real feature behaves — it returns the medium
    // tier, so the "which looks closest?" path is what you actually see.
    await wait(1400);
    if (!imageUri) return { ok: false, code: 'invalid_image' };
    return {
      ok: true,
      tier: 'medium',
      resultId: null,
      identification: {
        is_tool: true,
        category: 'power-tools',
        tool_type: 'cordless-drill',
        tool_type_confidence: 0.68,
        brand: 'Bosch',
        brand_confidence: 0.62,
        // Below the 0.70 threshold, so the policy blanks it — exactly as the
        // server would. The UI must show "model uncertain".
        model: null,
        model_confidence: 0.41,
        power_source: 'cordless',
        visible_accessories: ['battery', 'charger'],
        condition_hint: 'good',
        risk: 'medium',
        suggested_title: 'Bosch Cordless Drill',
        suggested_description:
          '18V cordless drill for wood, metal and light masonry. Includes one battery and charger.',
        alternatives: [
          { brand: 'Bosch', model: 'GSB 18V-55', tool_type: 'cordless-drill', confidence: 0.41 },
          { brand: 'Bosch', model: 'GSR 18V-55', tool_type: 'cordless-drill', confidence: 0.22 },
          { brand: 'Bosch', model: 'EasyImpact 18V', tool_type: 'cordless-drill', confidence: 0.11 },
        ],
        notes: 'Demo mode — no vision model is running.',
      },
    };
  },

  async interpretQuery(query): Promise<Interpretation | null> {
    await wait(200);
    const hint = INTENT_HINTS.find((h) => h.match.test(query));
    if (!hint) return null;
    return {
      tool_types: hint.types,
      categories: [],
      keywords: query.split(/\s+/).slice(0, 6),
      explanation_en: hint.en,
      explanation_he: hint.he,
      confidence: 0.8,
    };
  },

  async getNotifications(): Promise<AppNotification[]> {
    await wait(120);
    return [];
  },

  async markNotificationRead() {
    await wait(50);
  },

  async getNotificationPrefs() {
    await wait(80);
    return prefs;
  },

  async setNotificationPrefs(next) {
    await wait(80);
    prefs = next;
  },

  async demoBorrowMyTool() {
    return { ok: false, reason: 'demo_mode' };
  },

  async demoAnswerMyRequests() {
    return { ok: false, reason: 'demo_mode' };
  },

  async loadSampleData() {
    // Demo mode is nothing but sample data; there is nothing to add.
    return { ok: true };
  },

  async moveDemoToolsHere() {
    // Demo mode measures distance from whatever centre it is given, so the
    // tools are already wherever you are.
    return { ok: true, moved: tools.length };
  },

  async deleteAccount() {
    await wait(300);
  },
};
