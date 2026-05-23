import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/check-migration")({
  server: {
    handlers: {
      GET: async () => {
        const tables = ["products", "purchases", "shopping_list"];
        const results: Record<string, { hasUserId: boolean; rlsEnabled: boolean }> = {};

        for (const table of tables) {
          const { data: columns } = await supabaseAdmin
            .from("information_schema.columns")
            .select("column_name")
            .eq("table_name", table)
            .eq("column_name", "user_id")
            .eq("table_schema", "public");

          const { data: rlsRows } = await supabaseAdmin
            .from("pg_class")
            .select("relrowsecurity")
            .eq("relname", table)
            .single();

          results[table] = {
            hasUserId: (columns ?? []).length > 0,
            rlsEnabled: !!rlsRows?.relrowsecurity,
          };
        }

        const allDone = Object.values(results).every((r) => r.hasUserId && r.rlsEnabled);

        return new Response(
          JSON.stringify({ allDone, tables: results }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
