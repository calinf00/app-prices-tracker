import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/check-migration")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const { data } = await supabaseAdmin.rpc("check_migration_status");
          const rows = (data ?? []) as Array<{
            table_name: string;
            has_user_id: boolean;
            rls_enabled: boolean;
          }>;

          const results: Record<string, { hasUserId: boolean; rlsEnabled: boolean }> = {};
          for (const r of rows) {
            results[r.table_name] = {
              hasUserId: r.has_user_id,
              rlsEnabled: r.rls_enabled,
            };
          }

          const allDone = Object.values(results).every(
            (r) => r.hasUserId && r.rlsEnabled
          );

          return new Response(
            JSON.stringify({ allDone, tables: results }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: e?.message ?? "Errore verifica migration" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
