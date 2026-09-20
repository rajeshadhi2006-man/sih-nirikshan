import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve config from localStorage if user configured via Settings UI, or fallback to .env
export function getSupabaseConfig(): { url: string; anonKey: string; isCustom: boolean } {
  const customUrl = localStorage.getItem('gov_supabase_url');
  const customKey = localStorage.getItem('gov_supabase_key');

  if (customUrl && customKey) {
    return { url: customUrl, anonKey: customKey, isCustom: true };
  }

  const envUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ctmkpwwbdexwkakuqpat.supabase.co';
  const envKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0bWtwd3diZGV4d2tha3VxcGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDk4MDAsImV4cCI6MjEwNDE4NTgwMH0.ilxOvgsxXQoD3Rh6pZgmfiEMET5u3RtS-B0W_kOEhLU';

  return {
    url: envUrl,
    anonKey: envKey,
    isCustom: false,
  };
}

const config = getSupabaseConfig();

export const IS_DEMO_MODE =
  import.meta.env.VITE_DEMO_MODE === 'true' &&
  !config.isCustom &&
  (!config.url || config.url.includes('sample-gov-demo'));

let clientInstance: SupabaseClient = createClient(
  config.url || 'https://ctmkpwwbdexwkakuqpat.supabase.co',
  config.anonKey ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0bWtwd3diZGV4d2tha3VxcGF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2MDk4MDAsImV4cCI6MjEwNDE4NTgwMH0.ilxOvgsxXQoD3Rh6pZgmfiEMET5u3RtS-B0W_kOEhLU',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  }
);

export function getSupabaseClient(): SupabaseClient {
  return clientInstance;
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  const trimmedUrl = url.trim();
  const trimmedKey = anonKey.trim();
  localStorage.setItem('gov_supabase_url', trimmedUrl);
  localStorage.setItem('gov_supabase_key', trimmedKey);
  clientInstance = createClient(trimmedUrl, trimmedKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
}

export function clearCustomSupabaseConfig() {
  localStorage.removeItem('gov_supabase_url');
  localStorage.removeItem('gov_supabase_key');
  const freshConfig = getSupabaseConfig();
  clientInstance = createClient(freshConfig.url, freshConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 20,
      },
    },
  });
}

// Proxy export so that callers always interact with the currently active clientInstance
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

/**
 * Checks connectivity to Supabase backend
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  message: string;
}> {
  const currentConfig = getSupabaseConfig();
  if (!currentConfig.url || !currentConfig.anonKey) {
    return {
      connected: false,
      latencyMs: 0,
      message: 'Supabase URL or Anon Key is missing',
    };
  }

  const startTime = performance.now();
  try {
    // Check direct authentication with the anon key via /auth/v1/settings
    const response = await fetch(`${currentConfig.url}/auth/v1/settings`, {
      method: 'GET',
      headers: {
        apikey: currentConfig.anonKey,
      },
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (response.ok || response.status === 200) {
      return {
        connected: true,
        latencyMs,
        message: `Connected to Supabase Project (${latencyMs}ms roundtrip)`,
      };
    }

    // Even if 404 or 401, check error response
    if (response.status === 401) {
      return {
        connected: false,
        latencyMs,
        message: 'Invalid Anon API Key (HTTP 401 Unauthorized)',
      };
    }

    return {
      connected: true,
      latencyMs,
      message: `Connected to Supabase (${latencyMs}ms roundtrip, HTTP ${response.status})`,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - startTime),
      message: err.message || 'Supabase host unreachable',
    };
  }
}
