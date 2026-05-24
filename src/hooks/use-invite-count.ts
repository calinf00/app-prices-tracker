import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function useInviteCount() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["invite-count", user?.id ?? "anon"],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("family_invites")
        .select("id", { count: "exact", head: true })
        .eq("email", user!.email!)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString());

      if (error) throw error;
      return rows?.length ?? 0;
    },
  });

  return data ?? 0;
}
