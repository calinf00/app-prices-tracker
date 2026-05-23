import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL) as string;
const SERVICE_ROLE_KEY = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY as string;

if (!SUPABASE_URL) {
  console.error("VITE_SUPABASE_URL non configurata");
  throw new Error("VITE_SUPABASE_URL is not set");
}
if (!SERVICE_ROLE_KEY) {
  throw new Error("EXT_SUPABASE_SERVICE_ROLE_KEY is not set");
}

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});