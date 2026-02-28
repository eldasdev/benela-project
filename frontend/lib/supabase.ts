import { createBrowserClient } from "@supabase/ssr";

export const getSupabase = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

// Keep default export for convenience
export const supabase = typeof window !== "undefined"
  ? getSupabase()
  : null as any;