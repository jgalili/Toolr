import { IS_DEMO } from '../config';
import { demoSource } from './demo';
import { liveSource } from './live';
import type { DataSource } from './types';

/**
 * The one place the app decides where its data comes from.
 *
 * Demo mode is chosen by the absence of Supabase env vars, not by a flag a
 * screen can flip — so there is exactly one code path per feature and demo mode
 * cannot silently leak into a configured build.
 */
export const api: DataSource = IS_DEMO ? demoSource : liveSource;

export type { DataSource, IdentifyOutcome, SearchParams } from './types';
