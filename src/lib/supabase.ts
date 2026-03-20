import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type SupabaseStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const isBrowser = typeof window !== 'undefined';

const noopStorage: SupabaseStorage = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const browserStorage: SupabaseStorage = {
  getItem: async (key) => window.localStorage.getItem(key),
  setItem: async (key, value) => {
    window.localStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    window.localStorage.removeItem(key);
  },
};

const createNativeStorage = (): SupabaseStorage => {
  const { default: AsyncStorage } = require('@react-native-async-storage/async-storage') as {
    default: SupabaseStorage;
  };

  return AsyncStorage;
};

const resolveSupabaseStorage = (): SupabaseStorage => {
  if (!isBrowser) {
    return noopStorage;
  }

  if (window.localStorage) {
    return browserStorage;
  }

  return createNativeStorage();
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: resolveSupabaseStorage(),
    autoRefreshToken: isBrowser,
    persistSession: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});