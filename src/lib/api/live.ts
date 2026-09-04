/**
 * Supabase data source.
 *
 * Everything here goes through RLS or a whitelisted RPC. Three rules the shape
 * of this file exists to hold:
 *   1. Exact coordinates are only ever obtained via `get_pickup_location`.
 *   2. Creating a listing goes through `create_tool_with_location`, so the
 *      exact point is never written to the public `tools` table even briefly.
 *   3. AI calls go to Edge Functions, never to a model API directly — the key
 *      must not exist in this bundle.
 */

import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

import {
  identifyErrorSchema,
  identifyResponseSchema,
  interpretResponseSchema,
  type Interpretation,
} from '@/schemas/ai';
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
  ReservedWindow,
  ToolDetail,
  ToolRequest,
  ToolSummary,
  Transaction,
} from '@/types/domain';

import { DEFAULTS } from '../config';
import { requireSupabase } from '../supabase';
import type { DataSource, IdentifyOutcome, SearchParams } from './types';

const TOOL_PHOTOS_BUCKET = 'tool-photos';
const AI_TEMP_BUCKET = 'ai-temp';

/**
 * Read a picked image into something the storage client can upload.
 *
 * On native, `photoUri` is a `file://` path and expo-file-system reads it.
 * On web it is a `blob:` URL from the browser's file picker, and
 * expo-file-system has no web implementation at all — `readAsStringAsync`
 * throws. That threw straight out of `createTool` *after* the listing row had
 * already been written, so the tool was saved and the app still said it had
 * failed. People then pressed the button again. And again.
 *
 * `fetch` handles blob: URLs natively, and supabase-js accepts a Blob, so the
 * web path is both shorter and avoids a base64 round trip.
 */
async function readImageForUpload(uri: string): Promise<Blob | ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.blob();
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  return decode(base64);
}

function publicPhotoUrl(path: string | null, width = 800): string | null {
  if (!path) return null;
  const supabase = requireSupabase();
  const { data } = supabase.storage.from(TOOL_PHOTOS_BUCKET).getPublicUrl(path, {
    transform: { width, quality: 70 },
  });
  return data.publicUrl;
}

async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getUser();
  return data.user?.id ?? null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapSearchRow(row: any): ToolSummary {
  return {
    id: row.id,
    title: row.title,
    toolType: row.tool_type,
    brand: row.brand,
    categoryId: row.category_id,
    categorySlug: row.category_slug ?? 'other',
    paymentMode: row.payment_mode,
    pricePerDayAgorot: row.price_per_day_agorot,
    currency: row.currency ?? 'ILS',
    availabilityMode: row.availability_mode,
    risk: row.risk,
    neighbourhood: row.neighborhood_label,
    distanceM: row.distance_m,
    coords: { latitude: row.lat, longitude: row.lng },
    photoUrl: publicPhotoUrl(row.primary_photo, 600),
    owner: {
      id: row.owner_id ?? '',
      firstName: row.owner_first_name ?? '',
      avatarUrl: row.owner_avatar_url ?? null,
      rating: row.owner_rating != null ? Number(row.owner_rating) : null,
      ratingCount: row.owner_rating_count ?? 0,
    },
  };
}

function mapProfile(row: any): PublicProfile {
  const ownerCount = row.rating_count_owner ?? 0;
  const ownerSum = row.rating_sum_owner ?? 0;
  return {
    id: row.id,
    firstName: row.first_name,
    avatarUrl: row.avatar_url,
    neighbourhood: row.neighborhood_label,
    rating: ownerCount > 0 ? Number(((ownerSum + 4.6 * 5) / (ownerCount + 5)).toFixed(2)) : null,
    ratingCount: ownerCount,
    completedExchanges: (row.completed_lends ?? 0) + (row.completed_borrows ?? 0),
    verificationLevel: row.verification_level ?? 'none',
    memberSince: row.created_at,
  };
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data as T;
}

export const liveSource: DataSource = {
  isDemo: false,

  async searchTools(params: SearchParams) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('search_tools_nearby', {
      p_lat: params.centre.latitude,
      p_lng: params.centre.longitude,
      p_radius_m: params.radiusM,
      p_free_only: params.freeOnly,
      p_category_id: params.categoryId,
      p_tool_types: params.toolTypes,
      p_query: params.query,
      p_max_price: params.maxPriceAgorot,
      p_available_from: params.availableNow ? new Date().toISOString() : null,
      p_available_to: null,
      p_limit: params.limit ?? 30,
      p_offset: params.offset ?? 0,
    });
    if (error) throw error;

    const summaries: ToolSummary[] = (data ?? []).map(mapSearchRow);
    const favoriteIds = await favoriteIdSet();
    return summaries.map((tool) => ({ ...tool, isFavorite: favoriteIds.has(tool.id) }));
  },

  async getTool(id) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('tools')
      .select(
        `*, tool_categories(slug), tool_photos(storage_path, position),
         tool_pickup_windows(weekday, start_time, end_time),
         tool_included_items(label, icon, position),
         profiles!tools_owner_id_fkey(*)`,
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as any;
    const photos: string[] = (row.tool_photos ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((p: any) => publicPhotoUrl(p.storage_path, 1200))
      .filter(Boolean);
    const ownerProfile = mapProfile(row.profiles);
    const favoriteIds = await favoriteIdSet();

    const detail: ToolDetail = {
      id: row.id,
      title: row.title,
      toolType: row.tool_type,
      brand: row.brand,
      model: row.model,
      isModelConfirmed: row.is_model_confirmed,
      includedItems: (row.tool_included_items ?? [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((i: any) => ({ label: i.label, icon: i.icon ?? 'item' })),
      pickupWindows: (row.tool_pickup_windows ?? []).map((w: any) => ({
        weekday: w.weekday,
        // Postgres returns `time` as 'HH:MM:SS'; the UI wants 'HH:MM'.
        startTime: String(w.start_time).slice(0, 5),
        endTime: String(w.end_time).slice(0, 5),
      })),
      categoryId: row.category_id,
      categorySlug: row.tool_categories?.slug ?? 'other',
      paymentMode: row.payment_mode,
      pricePerDayAgorot: row.price_per_day_agorot,
      currency: row.currency ?? 'ILS',
      availabilityMode: row.availability_mode,
      risk: row.risk,
      neighbourhood: row.neighborhood_label,
      distanceM: 0,
      coords: { latitude: 0, longitude: 0 },
      photoUrl: photos[0] ?? null,
      photos,
      description: row.description,
      condition: row.condition,
      accessories: row.accessories,
      instructions: row.instructions,
      maxBorrowDays: row.max_borrow_days,
      depositAgorot: row.deposit_agorot,
      owner: {
        id: ownerProfile.id,
        firstName: ownerProfile.firstName,
        avatarUrl: ownerProfile.avatarUrl,
        rating: ownerProfile.rating,
        ratingCount: ownerProfile.ratingCount,
      },
      ownerProfile,
      status: row.status,
      createdAt: row.created_at,
      isFavorite: favoriteIds.has(row.id),
    };
    return detail;
  },

  async getProfile(id) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapProfile(data) : null;
  },

  async getProfileTools(id) {
    return ownerTools(id, ['active']);
  },

  async getRatingsFor(userId) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('ratings')
      .select('*, profiles!ratings_rater_id_fkey(first_name)')
      .eq('ratee_id', userId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map(
      (row: any): Rating => ({
        id: row.id,
        transactionId: row.transaction_id,
        raterId: row.rater_id,
        rateeId: row.ratee_id,
        direction: row.direction,
        stars: row.stars,
        tags: row.tags ?? [],
        comment: row.comment,
        createdAt: row.created_at,
        raterName: row.profiles?.first_name,
      }),
    );
  },

  // Your own shelf shows everything you own that still exists -- a drill that
  // is out on loan is the row you most want to see, and filtering to 'active'
  // made it vanish from My Tools at exactly the moment it mattered.
  async getMyTools() {
    const userId = await currentUserId();
    if (!userId) return [];
    return ownerTools(userId, ['active', 'paused', 'borrowed', 'draft']);
  },

  async createTool(input: ListingInput, photoUri) {
    const supabase = requireSupabase();

    // One RPC, one transaction: the exact point never lands in the public
    // `tools` table, not even for the moment between two inserts.
    const { data, error } = await supabase.rpc('create_tool_with_location', {
      p_title: input.title,
      p_tool_type: input.toolType,
      p_brand: input.brand,
      p_model: input.model,
      p_is_model_confirmed: input.isModelConfirmed,
      p_category_slug: input.categorySlug,
      p_description: input.description,
      p_condition: input.condition,
      p_accessories: input.accessories,
      p_instructions: input.instructions,
      p_max_borrow_days: input.maxBorrowDays,
      p_is_free: input.isFree,
      p_price_per_day_agorot: input.pricePerDayAgorot,
      p_availability_mode: input.availabilityMode,
      p_risk: input.risk,
      p_lat: input.coords.latitude,
      p_lng: input.coords.longitude,
      p_neighborhood_label: input.neighbourhood,
    });
    if (error) throw error;

    const toolId = data as string;

    // The listing exists from here on. A photo that fails to upload is a
    // listing without a picture — annoying, fixable from the edit screen, and
    // emphatically not a reason to tell someone their tool wasn't saved.
    if (photoUri) {
      try {
        const path = `${await currentUserId()}/${toolId}/${Date.now()}.jpg`;
        const body = await readImageForUpload(photoUri);
        const { error: uploadError } = await supabase.storage
          .from(TOOL_PHOTOS_BUCKET)
          .upload(path, body, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) {
          console.warn('[listing] photo upload failed:', uploadError.message);
        } else {
          await supabase
            .from('tool_photos')
            .insert({ tool_id: toolId, storage_path: path, position: 0 });
        }
      } catch (photoError) {
        console.warn('[listing] could not read the photo:', photoError);
      }
    }

    return { id: toolId };
  },

  async setToolStatus(id, status) {
    const supabase = requireSupabase();
    const patch =
      status === 'removed'
        ? { status: 'removed', deleted_at: new Date().toISOString() }
        : { status };
    const { error } = await supabase.from('tools').update(patch).eq('id', id);
    if (error) throw error;
  },

  async getFavorites() {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('favorites')
      .select('tool_id, tools(*, tool_categories(slug), tool_photos(storage_path, position))');
    if (error) throw error;
    return (data ?? [])
      .filter((row: any) => row.tools)
      .map((row: any) => ({
        ...mapSearchRow({
          ...row.tools,
          category_slug: row.tools.tool_categories?.slug,
          distance_m: 0,
          lat: 0,
          lng: 0,
          primary_photo: row.tools.tool_photos?.[0]?.storage_path ?? null,
        }),
        isFavorite: true,
      }));
  },

  async setFavorite(toolId, favorite) {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    if (favorite) {
      const { error } = await supabase.from('favorites').insert({ user_id: userId, tool_id: toolId });
      if (error && error.code !== '23505') throw error;
    } else {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('tool_id', toolId);
      if (error) throw error;
    }
  },

  async createBorrowRequest(input) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('create_borrow_request', {
      p_tool_id: input.toolId,
      p_start_at: input.startAt,
      p_end_at: input.endAt,
      p_message: input.message,
      p_risk_acknowledged: input.riskAcknowledged,
    });
    if (error) throw error;
    const rows = await mapRequests([data]);
    return rows[0]!;
  },

  async getIncomingRequests() {
    const userId = await currentUserId();
    if (!userId) return [];
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('borrow_requests')
      .select(requestSelect)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapRequests(data ?? []);
  },

  async getOutgoingRequests() {
    const userId = await currentUserId();
    if (!userId) return [];
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('borrow_requests')
      .select(requestSelect)
      .eq('borrower_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return mapRequests(data ?? []);
  },

  async respondToRequest(requestId, decision, dueAt) {
    const supabase = requireSupabase();
    const { error } = await supabase.rpc('respond_to_request', {
      p_request_id: requestId,
      p_decision: decision,
      p_due_at: dueAt ?? null,
    });
    if (error) throw error;
  },

  async getTransactions() {
    const userId = await currentUserId();
    if (!userId) return [];
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('transactions')
      .select(
        `*, tools(title, tool_photos(storage_path, position)),
         borrow_requests(start_at),
         owner:profiles!transactions_owner_id_fkey(id, first_name, avatar_url, rating_sum_owner, rating_count_owner),
         borrower:profiles!transactions_borrower_id_fkey(id, first_name, avatar_url, rating_sum_borrower, rating_count_borrower),
         conversations(id), ratings(rater_id)`,
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row: any) => mapTransaction(row, userId));
  },

  async getTransaction(id) {
    const all = await liveSource.getTransactions();
    return all.find((t) => t.id === id) ?? null;
  },

  async getPickupLocation(transactionId): Promise<PickupLocation | null> {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('get_pickup_location', {
      p_transaction_id: transactionId,
    });
    if (error) throw error;
    const row = (data as any[])?.[0];
    if (!row) return null;
    return {
      latitude: row.lat,
      longitude: row.lng,
      addressLine: row.address_line,
      pickupNotes: row.pickup_notes,
    };
  },

  // An RPC, not an UPDATE. The direct write only worked because the table's
  // update policy let either party set any column -- including status and
  // due_at -- and now that a listing's availability follows its loan, that
  // would have let a borrower put someone else's drill back into search.
  async confirmPickup(transactionId) {
    const supabase = requireSupabase();
    const { error } = await supabase.rpc('confirm_pickup', { p_transaction_id: transactionId });
    if (error) throw error;
  },

  async getReservedWindows(toolIds): Promise<ReservedWindow[]> {
    if (toolIds.length === 0) return [];
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('reserved_windows', { p_tool_ids: toolIds });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      toolId: row.tool_id,
      startAt: row.start_at,
      endAt: row.end_at,
      isOut: Boolean(row.is_out),
    }));
  },

  async confirmReturn(transactionId) {
    const supabase = requireSupabase();
    const { error } = await supabase.rpc('confirm_return', { p_transaction_id: transactionId });
    if (error) throw error;
  },

  async submitRating(input) {
    const supabase = requireSupabase();
    const { error } = await supabase.rpc('submit_rating', {
      p_transaction_id: input.transactionId,
      p_stars: input.stars,
      p_tags: input.tags,
      p_comment: input.comment,
    });
    if (error) throw error;
  },

  async reportIssue(input) {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    const { error } = await supabase.from('disputes').insert({
      transaction_id: input.transactionId,
      opened_by: userId,
      reason: input.reason,
      description: input.description,
      evidence_paths: input.photoPaths,
    });
    if (error) throw error;
  },

  async getConversations() {
    const userId = await currentUserId();
    if (!userId) return [];
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('conversations')
      .select(
        `*, tools(title, tool_photos(storage_path, position)),
         owner:profiles!conversations_owner_id_fkey(id, first_name, avatar_url),
         borrower:profiles!conversations_borrower_id_fkey(id, first_name, avatar_url),
         messages(body, created_at, read_at, sender_id)`,
      )
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;

    return (data ?? []).map((row: any): Conversation => {
      const other = row.owner?.id === userId ? row.borrower : row.owner;
      const sorted = (row.messages ?? []).sort(
        (a: any, b: any) => Date.parse(b.created_at) - Date.parse(a.created_at),
      );
      const last = sorted[0];
      return {
        id: row.id,
        toolId: row.tool_id,
        toolTitle: row.tools?.title ?? null,
        toolPhotoUrl: publicPhotoUrl(row.tools?.tool_photos?.[0]?.storage_path ?? null, 200),
        transactionId: null,
        counterparty: {
          id: other?.id ?? '',
          firstName: other?.first_name ?? '',
          avatarUrl: other?.avatar_url ?? null,
        },
        lastMessage: last?.body ?? null,
        lastMessageAt: row.last_message_at,
        unread: Boolean(last && last.sender_id !== userId && !last.read_at),
      };
    });
  },

  async getMessages(conversationId) {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map(
      (row: any): Message => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        kind: row.kind,
        body: row.body,
        createdAt: row.created_at,
      }),
    );
  },

  async sendMessage(conversationId, body, kind = 'text') {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    if (!userId) throw new Error('Not signed in');
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, sender_id: userId, kind, body })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id,
      conversationId: data.conversation_id,
      senderId: data.sender_id,
      kind: data.kind,
      body: data.body,
      createdAt: data.created_at,
    };
  },

  subscribeToMessages(conversationId, onMessage) {
    const supabase = requireSupabase();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as any;
          onMessage({
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            kind: row.kind,
            body: row.body,
            createdAt: row.created_at,
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  },

  async getToolRequests(centre: Coords, radiusM) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('nearby_tool_requests', {
      p_lat: centre.latitude,
      p_lng: centre.longitude,
      p_radius_m: radiusM,
    });
    if (error) throw error;
    return (data ?? []).map(
      (row: any): ToolRequest => ({
        id: row.id,
        requesterId: row.requester_id,
        requesterName: row.requester_first_name ?? '',
        rawText: row.raw_text,
        parsedToolTypes: row.parsed_tool_types ?? [],
        categoryId: row.category_id,
        radiusM: row.radius_m,
        neededFrom: row.needed_from,
        neededTo: row.needed_to,
        distanceM: row.distance_m,
        status: row.status,
        offerCount: row.offer_count ?? 0,
        createdAt: row.created_at,
      }),
    );
  },

  async createToolRequest(input) {
    const supabase = requireSupabase();
    const interpretation = await liveSource.interpretQuery(input.rawText, 'en');
    const { data, error } = await supabase.rpc('create_tool_request', {
      p_raw_text: input.rawText,
      p_parsed_tool_types: interpretation?.tool_types ?? [],
      p_radius_m: input.radiusM,
      p_needed_from: input.neededFrom,
      p_needed_to: input.neededTo,
      p_lat: input.centre.latitude,
      p_lng: input.centre.longitude,
    });
    if (error) throw error;
    const row = data as any;
    return {
      id: row.id,
      requesterId: row.requester_id,
      requesterName: '',
      rawText: row.raw_text,
      parsedToolTypes: row.parsed_tool_types ?? [],
      categoryId: row.category_id,
      radiusM: row.radius_m,
      neededFrom: row.needed_from,
      neededTo: row.needed_to,
      distanceM: 0,
      status: row.status,
      offerCount: 0,
      createdAt: row.created_at,
    };
  },

  async offerTool(toolRequestId, toolId, message) {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    const { error } = await supabase.from('tool_request_offers').insert({
      tool_request_id: toolRequestId,
      tool_id: toolId,
      owner_id: userId,
      message,
    });
    if (error) throw error;
  },

  async identifyTool(imageUri): Promise<IdentifyOutcome> {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    if (!userId) return { ok: false, code: 'unauthorized' };

    try {
      const path = `${userId}/${Date.now()}.jpg`;
      const body = await readImageForUpload(imageUri);
      const { error: uploadError } = await supabase.storage
        .from(AI_TEMP_BUCKET)
        .upload(path, body, { contentType: 'image/jpeg' });
      if (uploadError) return { ok: false, code: 'invalid_image' };

      const raw = await Promise.race([
        invoke<unknown>('identify-tool', { path }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), DEFAULTS.aiTimeoutMs),
        ),
      ]);

      const ok = identifyResponseSchema.safeParse(raw);
      if (ok.success) {
        return {
          ok: true,
          tier: ok.data.tier,
          identification: ok.data.identification,
          resultId: ok.data.resultId,
        };
      }
      const failed = identifyErrorSchema.safeParse(raw);
      if (failed.success) return { ok: false, code: failed.data.code };
      return { ok: false, code: 'model_failed' };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'timeout') return { ok: false, code: 'timeout' };
      return { ok: false, code: 'model_failed' };
    }
  },

  async interpretQuery(query, locale): Promise<Interpretation | null> {
    try {
      const raw = await invoke<unknown>('interpret-query', { query, locale });
      const parsed = interpretResponseSchema.safeParse(raw);
      return parsed.success ? parsed.data.interpretation : null;
    } catch {
      // Degrade to plain keyword search. Slightly worse results, zero breakage.
      return null;
    }
  },

  async getNotifications() {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map(
      (row: any): AppNotification => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        route: row.route,
        readAt: row.read_at,
        createdAt: row.created_at,
      }),
    );
  },

  async markNotificationRead(id) {
    const supabase = requireSupabase();
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  },

  async getNotificationPrefs(): Promise<NotificationPrefs> {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    if (!userId) return defaultPrefs;
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return defaultPrefs;
    return {
      borrowRequests: data.borrow_requests,
      requestResponses: data.request_responses,
      messages: data.messages,
      reminders: data.reminders,
      nearbyToolRequests: data.nearby_tool_requests,
    };
  },

  async setNotificationPrefs(prefs) {
    const supabase = requireSupabase();
    const userId = await currentUserId();
    if (!userId) return;
    await supabase.from('notification_prefs').update({
      borrow_requests: prefs.borrowRequests,
      request_responses: prefs.requestResponses,
      messages: prefs.messages,
      reminders: prefs.reminders,
      nearby_tool_requests: prefs.nearbyToolRequests,
    }).eq('user_id', userId);
  },

  async loadSampleData() {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('seed_demo_for_me');
    if (error) throw error;
    return (data as { ok: boolean; reason?: string }) ?? { ok: false };
  },

  async moveDemoToolsHere(centre) {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('move_demo_tools_here', {
      p_lat: centre.latitude,
      p_lng: centre.longitude,
    });
    if (error) throw error;
    return (data as { ok: boolean; moved?: number; reason?: string }) ?? { ok: false };
  },

  async demoBorrowMyTool() {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('demo_borrow_my_tool', { p_tool_id: null });
    if (error) throw error;
    return (data as { ok: boolean; tool?: string; reason?: string }) ?? { ok: false };
  },

  async demoAnswerMyRequests() {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('demo_answer_my_requests');
    if (error) throw error;
    return (data as { ok: boolean; answered?: number; reason?: string }) ?? { ok: false };
  },

  async deleteAccount() {
    await invoke('delete-account', {});
    await requireSupabase().auth.signOut();
  },
};

const defaultPrefs: NotificationPrefs = {
  borrowRequests: true,
  requestResponses: true,
  messages: true,
  reminders: true,
  nearbyToolRequests: true,
};

const requestSelect = `*, tools(title, tool_photos(storage_path, position)),
  borrower:profiles!borrow_requests_borrower_id_fkey(id, first_name, avatar_url, rating_sum_borrower, rating_count_borrower),
  owner:profiles!borrow_requests_owner_id_fkey(id, first_name, avatar_url, rating_sum_owner, rating_count_owner)`;

async function mapRequests(rows: any[]): Promise<BorrowRequest[]> {
  return rows.filter(Boolean).map((row) => ({
    id: row.id,
    toolId: row.tool_id,
    toolTitle: row.tools?.title ?? '',
    toolPhotoUrl: publicPhotoUrl(row.tools?.tool_photos?.[0]?.storage_path ?? null, 200),
    borrower: {
      id: row.borrower?.id ?? row.borrower_id,
      firstName: row.borrower?.first_name ?? '',
      avatarUrl: row.borrower?.avatar_url ?? null,
      rating: smoothed(row.borrower?.rating_sum_borrower, row.borrower?.rating_count_borrower),
    },
    owner: {
      id: row.owner?.id ?? row.owner_id,
      firstName: row.owner?.first_name ?? '',
      avatarUrl: row.owner?.avatar_url ?? null,
      rating: smoothed(row.owner?.rating_sum_owner, row.owner?.rating_count_owner),
    },
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at,
    message: row.message,
    quotedTotalAgorot: row.quoted_total_agorot,
    paymentMode: row.payment_mode,
    createdAt: row.created_at,
  }));
}

function smoothed(sum?: number, count?: number): number | null {
  if (!count) return null;
  return Number((((sum ?? 0) + 4.6 * 5) / (count + 5)).toFixed(2));
}

async function ownerTools(ownerId: string, statuses: string[]): Promise<ToolSummary[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('tools')
    .select('*, tool_categories(slug), tool_photos(storage_path, position)')
    .eq('owner_id', ownerId)
    .in('status', statuses)
    .is('deleted_at', null);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...mapSearchRow({
      ...row,
      category_slug: row.tool_categories?.slug,
      distance_m: 0,
      lat: 0,
      lng: 0,
      primary_photo: row.tool_photos?.[0]?.storage_path ?? null,
    }),
    status: row.status,
  }));
}

function mapTransaction(row: any, userId: string): Transaction {
  const isOwner = row.owner_id === userId;
  const other = isOwner ? row.borrower : row.owner;
  return {
    id: row.id,
    requestId: row.request_id,
    toolId: row.tool_id,
    toolTitle: row.tools?.title ?? '',
    toolPhotoUrl: publicPhotoUrl(row.tools?.tool_photos?.[0]?.storage_path ?? null, 200),
    ownerId: row.owner_id,
    borrowerId: row.borrower_id,
    counterparty: {
      id: other?.id ?? '',
      firstName: other?.first_name ?? '',
      avatarUrl: other?.avatar_url ?? null,
      rating: isOwner
        ? smoothed(other?.rating_sum_borrower, other?.rating_count_borrower)
        : smoothed(other?.rating_sum_owner, other?.rating_count_owner),
    },
    viewerRole: isOwner ? 'owner' : 'borrower',
    status: row.status,
    agreedTotalAgorot: row.agreed_total_agorot,
    currency: row.currency ?? 'ILS',
    startAt: row.borrow_requests?.start_at ?? null,
    dueAt: row.due_at,
    pickedUpAt: row.picked_up_at,
    returnedAt: row.returned_at,
    ownerConfirmedReturn: row.owner_confirmed_return_at != null,
    completedAt: row.completed_at,
    conversationId: row.conversations?.[0]?.id ?? null,
    hasRated: (row.ratings ?? []).some((r: any) => r.rater_id === userId),
  };
}

async function favoriteIdSet(): Promise<Set<string>> {
  try {
    const supabase = requireSupabase();
    const { data } = await supabase.from('favorites').select('tool_id');
    return new Set((data ?? []).map((row: any) => row.tool_id));
  } catch {
    return new Set();
  }
}
