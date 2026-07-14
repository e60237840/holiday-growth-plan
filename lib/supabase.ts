import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseRuntimeConfig = {
  url?: string | null;
  publishableKey?: string | null;
};

const buildTimeUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const buildTimePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export let isSupabaseConfigured = Boolean(buildTimeUrl && buildTimePublishableKey);

export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(buildTimeUrl!, buildTimePublishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 8 } },
    })
  : null;

let initialization: Promise<boolean> | null = null;

function configureClient(config: SupabaseRuntimeConfig) {
  const url = config.url?.trim();
  const publishableKey = config.publishableKey?.trim();
  if (!url || !publishableKey) return false;

  supabase = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 8 } },
  });
  isSupabaseConfigured = true;
  return true;
}

// Sites environment variables are Worker runtime bindings, so the browser
// requests the public Supabase configuration after the page loads. Local and
// GitHub Pages builds can still use the usual NEXT_PUBLIC_* build variables.
export async function initializeSupabase() {
  if (supabase && isSupabaseConfigured) return true;
  if (initialization) return initialization;
  if (typeof window === "undefined") return false;

  initialization = fetch("/api/supabase-config", {
    cache: "no-store",
    headers: { accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) return false;
      return configureClient(await response.json() as SupabaseRuntimeConfig);
    })
    .catch(() => false);

  return initialization;
}
