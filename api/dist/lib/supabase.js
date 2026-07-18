"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
let _db;
try {
    _db = (0, supabase_js_1.createClient)(url, key, { auth: { persistSession: false } });
}
catch {
    console.error("[supabase] createClient failed — SUPABASE_URL or key is invalid/missing. DB calls will error.");
    // Create with dummy values so the import doesn't crash the process
    _db = (0, supabase_js_1.createClient)("https://aaaaaaaaaa.supabase.co", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", { auth: { persistSession: false } });
}
exports.db = _db;
