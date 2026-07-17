import { createClient } from "@supabase/supabase-js";

const url  = process.env.SUPABASE_URL ?? "";
// Accept either name so Railway env var mismatches don't crash startup
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

if (!url || !key) {
  console.error("[supabase] WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — DB calls will fail but app will still start");
}

// Service role client — bypasses RLS, server-side only
export const db = createClient(url, key, {
  auth: { persistSession: false },
});
