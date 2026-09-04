import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { config, IS_DEMO } from './config';

/**
 * Session storage.
 *
 * Refresh tokens are long-lived credentials, so they go in SecureStore
 * (Android Keystore backed), not AsyncStorage. SecureStore has a 2 KB value
 * limit and no web implementation, so we chunk large values and fall back to
 * AsyncStorage on web (where the app is a dev/preview surface only).
 */
const CHUNK_SIZE = 1800;

const secureAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;
    if (!head.startsWith('__chunks__:')) return head;

    const count = Number.parseInt(head.slice('__chunks__:'.length), 10);
    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK_SIZE);
    await SecureStore.setItemAsync(key, `__chunks__:${count}`);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    if (head?.startsWith('__chunks__:')) {
      const count = Number.parseInt(head.slice('__chunks__:'.length), 10);
      for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

const storage = Platform.OS === 'web' ? AsyncStorage : secureAdapter;

/**
 * `null` in demo mode. Every call site goes through the api layer, which checks
 * IS_DEMO first — so this is never dereferenced without a backend.
 */
export const supabase: SupabaseClient | null = IS_DEMO
  ? null
  : createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        storage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL session detection on native; deep links are handled explicitly.
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
      global: {
        headers: { 'x-client-info': 'nailedit-mobile' },
      },
    });

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env, or run in demo mode.',
    );
  }
  return supabase;
}
