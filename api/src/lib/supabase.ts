import { createClient } from "@supabase/supabase-js";

const url  = process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("[supabase] FATAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — set these on Railway");
}

// Service role client — bypasses RLS, server-side only
// Use placeholder URL to avoid synchronous throw from createClient when env var missing
export const db = createClient(url ?? "https://placeholder.supabase.co", key ?? "placeholder", {
  auth: { persistSession: false },
});
