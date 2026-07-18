import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

let _db: SupabaseClient;
try {
  // Pass ws explicitly so this works on Node < 22 (no native WebSocket)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require("ws");
  _db = createClient(url || "https://placeholder.supabase.co", key || "placeholder_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", {
    auth: { persistSession: false },
    realtime: { transport: ws },
  });
  if (!url || !key) console.error("[supabase] WARNING: SUPABASE_URL or key missing — set on Railway");
} catch (e: any) {
  console.error("[supabase] FATAL createClient error:", e.message);
  process.exit(1);
}

export const db = _db!;
