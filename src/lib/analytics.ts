/**
 * Product analytics.
 *
 * Two rules, enforced by the types below:
 *   1. Event names are a closed set, defined here. No ad-hoc strings.
 *   2. No PII in properties. The user is a UUID. Never an email, a name, a
 *      phone number, or a coordinate — a coarse neighbourhood label at most.
 *
 * PostHog is wired in `identify`/`capture` when a key is present; without one
 * this is a no-op that still logs in development, so instrumentation can be
 * written and reviewed before the account exists.
 */

import { config } from './config';

export type AnalyticsEvent =
  | 'app_opened'
  | 'onboarding_completed'
  | 'location_permission_result'
  | 'signup_started'
  | 'signup_completed'
  | 'signin_completed'
  | 'guest_session_started'
  | 'guest_upgraded'
  | 'search_tool'
  | 'search_no_results'
  | 'search_interpreted'
  | 'view_tool'
  | 'map_opened'
  | 'favorite_added'
  | 'tool_listing_started'
  | 'tool_photo_uploaded'
  | 'ai_tool_identified'
  | 'ai_identification_failed'
  | 'ai_result_accepted'
  | 'ai_result_corrected'
  | 'ai_result_rejected'
  | 'tool_listing_created'
  | 'borrow_requested'
  | 'borrow_accepted'
  | 'borrow_declined'
  | 'message_sent'
  | 'pickup_confirmed'
  | 'return_confirmed'
  | 'transaction_completed'
  | 'rating_submitted'
  | 'issue_reported'
  | 'tool_request_created'
  | 'tool_request_offer_made';

type Primitive = string | number | boolean | null | undefined;
export type EventProps = Record<string, Primitive>;

/** Keys we refuse to send, whatever the caller passes. */
const BANNED_KEYS = new Set([
  'email',
  'name',
  'first_name',
  'firstName',
  'phone',
  'phone_number',
  'lat',
  'latitude',
  'lng',
  'longitude',
  'address',
  'password',
  'token',
  'body',
  'message',
]);

function scrub(props?: EventProps): EventProps {
  if (!props) return {};
  const out: EventProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (BANNED_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

type PostHogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  identify: (id: string, props?: Record<string, unknown>) => void;
  reset: () => void;
};

let client: PostHogLike | null = null;

export function registerAnalyticsClient(instance: PostHogLike | null): void {
  client = instance;
}

export function capture(event: AnalyticsEvent, props?: EventProps): void {
  const safe = scrub(props);
  if (client) {
    client.capture(event, safe);
    return;
  }
  if (__DEV__ && !config.posthogKey) {
    // Visible during development so instrumentation can be reviewed early.
    console.log(`[analytics] ${event}`, safe);
  }
}

export function identify(userId: string, props?: EventProps): void {
  client?.identify(userId, scrub(props));
}

export function resetAnalytics(): void {
  client?.reset();
}
