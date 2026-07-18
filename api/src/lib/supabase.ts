import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

let _db: SupabaseClient;
try {
  _db = createClient(url, key, { auth: { persistSession: false } });
} catch {
  console.error("[supabase] createClient failed — SUPABASE_URL or key is invalid/missing. DB calls will error.");
  // Create with dummy values so the import doesn't crash the process
  _db = createClient("https://aaaaaaaaaa.supabase.co", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", { auth: { persistSession: false } });
}

export const db = _db;
