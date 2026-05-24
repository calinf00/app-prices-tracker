import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Family, FamilyInvite, FamilyMember } from "@/lib/supabase-types";

export type FamilyMemberWithUser = FamilyMember & {
  display_name: string;
  email: string;
};

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function safeSelect<T>(fn: () => PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  try {
    const { data, error } = await fn();
    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export function useFamily() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["family", user?.id ?? "anon"],
    enabled: !!user,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!user) return { family: null, members: [], invites: [], myInvites: [] };

      // 1. find my family_member row
      const myRows = await safeSelect<FamilyMember[]>(() =>
        supabase.from("family_members").select("*").eq("user_id", user.id),
      );
      const mine = myRows?.[0] ?? null;

      // 2. invites addressed to me (for banner / badge)
      let myInvites: (FamilyInvite & { families: { name: string } | null })[] = [];
      if (user.email) {
        const normalizedEmail = user.email.trim().toLowerCase();
        const { data: invRows, error: invErr } = await supabase
          .from("family_invites")
          .select("*, families(name)")
          .eq("email", normalizedEmail)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString());
        if (invErr) {
          console.error("[useFamily] myInvites query error:", invErr);
        } else {
          myInvites = (invRows ?? []) as (FamilyInvite & { families: { name: string } | null })[];
        }
      }

      if (!mine) {
        return { family: null, members: [], invites: [], myInvites };
      }

      const familyRow = await safeSelect<Family>(() =>
        supabase.from("families").select("*").eq("id", mine.family_id).maybeSingle() as any,
      );

      const memberRows = await safeSelect<any[]>(() =>
        supabase.from("family_members").select("*").eq("family_id", mine.family_id),
      );
      const members: FamilyMemberWithUser[] = (memberRows ?? []).map((m) => ({
        ...(m as FamilyMember),
        display_name: m.display_name ?? (m.email ? m.email.split("@")[0] : "Membro"),
        email: m.email ?? "",
      }));

      const inviteRows = await safeSelect<FamilyInvite[]>(() =>
        supabase
          .from("family_invites")
          .select("*")
          .eq("family_id", mine.family_id)
          .eq("status", "pending"),
      );

      return {
        family: familyRow,
        members,
        invites: inviteRows ?? [],
        myInvites,
      };
    },
  });

  const data = query.data ?? { family: null, members: [], invites: [], myInvites: [] };
  const isOwner = !!(data.family && user && data.family.created_by === user.id);
  const memberIds = data.members.map((m) => m.user_id);

  const getMember = (userId: string | null | undefined) => {
    if (!userId) return null;
    return data.members.find((m) => m.user_id === userId) ?? null;
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["family"] });
    qc.invalidateQueries({ queryKey: ["invite-count"] });
  };

  const createFamily = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Non autenticato");
      const { data: fam, error } = await supabase
        .from("families")
        .insert({
          name: name.trim() || "La mia famiglia",
          created_by: user.id,
          invite_code: randomCode(),
        })
        .select()
        .single();
      if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42P01") {
          throw new Error(
            "Tabelle famiglia non trovate. Applica prima la migration Supabase dal file supabase/migrations/20260524200000_family_groups.sql",
          );
        }
        if (code === "42501") {
          throw new Error("Permessi insufficienti. Controlla le policy RLS su Supabase.");
        }
        throw new Error(error.message);
      }
      const { error: memErr } = await supabase.from("family_members").insert({
        family_id: (fam as Family).id,
        user_id: user.id,
        role: "owner",
        display_name:
          (user.user_metadata as { full_name?: string } | null)?.full_name ||
          user.email?.split("@")[0] ||
          "Proprietario",
        email: user.email || "",
      });
      if (memErr)
        throw new Error("Famiglia creata ma errore nell'aggiunta come membro: " + memErr.message);
    },
    onSuccess: invalidate,
  });

  const joinByCode = useMutation({
    mutationFn: async (code: string) => {
      if (!user) throw new Error("Non autenticato");
      const { data: fam, error } = await supabase
        .from("families")
        .select("id")
        .eq("invite_code", code.trim().toUpperCase())
        .maybeSingle();
      if (error) throw error;
      if (!fam) throw new Error("Codice invito non valido");
      const { error: insErr } = await supabase.from("family_members").insert({
        family_id: (fam as { id: string }).id,
        user_id: user.id,
        role: "member",
        display_name:
          (user.user_metadata as { full_name?: string } | null)?.full_name ||
          user.email?.split("@")[0] ||
          "Membro",
        email: user.email || "",
      });
      if (insErr) {
        if ((insErr as { code?: string }).code === "23505") {
          throw new Error("Sei già membro di questa famiglia.");
        }
        throw insErr;
      }
    },
    onSuccess: invalidate,
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      if (!data.family) throw new Error("Nessuna famiglia");
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("family_id", data.family.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const leaveFamily = useMutation({
    mutationFn: async () => {
      if (!user || !data.family) throw new Error("Nessuna famiglia");
      const { error } = await supabase
        .from("family_members")
        .delete()
        .eq("family_id", data.family.id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const regenerateCode = useMutation({
    mutationFn: async () => {
      if (!data.family) throw new Error("Nessuna famiglia");
      const { error } = await supabase
        .from("families")
        .update({ invite_code: randomCode() })
        .eq("id", data.family.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const renameFamily = useMutation({
    mutationFn: async (name: string) => {
      if (!data.family) throw new Error("Nessuna famiglia");
      const { error } = await supabase
        .from("families")
        .update({ name: name.trim() })
        .eq("id", data.family.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const inviteByEmail = useMutation({
    mutationFn: async (email: string) => {
      if (!user || !data.family) throw new Error("Nessuna famiglia");
      const normalized = email.trim().toLowerCase();
      if (!normalized) throw new Error("Inserisci un'email valida.");
      // Blocca se l'email è già membro della famiglia
      const { data: existingMember, error: memCheckErr } = await supabase
        .from("family_members")
        .select("id")
        .eq("family_id", data.family.id)
        .eq("email", normalized)
        .maybeSingle();
      if (memCheckErr && (memCheckErr as { code?: string }).code !== "PGRST116") {
        throw memCheckErr;
      }
      if (existingMember) {
        throw new Error("Questa email è già membro della famiglia.");
      }

      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      // Riusa eventuali inviti precedenti invece di cancellarli: lo schema mantiene lo storico
      // e il vincolo unico su family_id/email altrimenti blocca i nuovi inviti.
      const { data: refreshedInvite, error: refreshErr } = await supabase
        .from("family_invites")
        .update({
          invited_by: user.id,
          status: "pending",
          created_at: nowIso,
          expires_at: expiresAt,
        })
        .eq("family_id", data.family.id)
        .eq("email", normalized)
        .select("id");
      if (refreshErr) throw refreshErr;
      if (refreshedInvite && refreshedInvite.length > 0) return;

      const { error } = await supabase.from("family_invites").insert({
        family_id: data.family.id,
        invited_by: user.id,
        email: normalized,
        status: "pending",
        expires_at: expiresAt,
      });
      if ((error as { code?: string } | null)?.code === "23505") {
        throw new Error("Esiste già un invito per questa email. Riprova tra poco.");
      }
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("family_invites")
        .update({ status: "revoked" })
        .eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const acceptInvite = useMutation({
    mutationFn: async (invite: FamilyInvite) => {
      if (!user) throw new Error("Non autenticato");
      const nowIso = new Date().toISOString();
      const { data: updated, error: updErr } = await supabase
        .from("family_invites")
        .update({ status: "accepted" })
        .eq("id", invite.id)
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .select("id");
      if (updErr) throw updErr;
      if (!updated || updated.length === 0) {
        throw new Error("Invito non valido o scaduto.");
      }
      const { error: insErr } = await supabase.from("family_members").insert({
        family_id: invite.family_id,
        user_id: user.id,
        role: "member",
        display_name:
          (user.user_metadata as { full_name?: string } | null)?.full_name ||
          user.email?.split("@")[0] ||
          "Membro",
        email: user.email || "",
      });
      if (insErr && (insErr as { code?: string }).code !== "23505") throw insErr;
    },
    onSuccess: invalidate,
  });

  const declineInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from("family_invites")
        .update({ status: "declined" })
        .eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteFamily = useMutation({
    mutationFn: async () => {
      if (!data.family) throw new Error("Nessuna famiglia");
      const { error } = await supabase.from("families").delete().eq("id", data.family.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    family: data.family,
    members: data.members,
    invites: data.invites,
    myInvites: data.myInvites,
    memberIds,
    isOwner,
    getMember,
    isLoading: query.isLoading,
    createFamily: (name: string) => createFamily.mutateAsync(name),
    joinByCode: (code: string) => joinByCode.mutateAsync(code),
    removeMember: (userId: string) => removeMember.mutateAsync(userId),
    leaveFamily: () => leaveFamily.mutateAsync(),
    regenerateCode: () => regenerateCode.mutateAsync(),
    renameFamily: (name: string) => renameFamily.mutateAsync(name),
    inviteByEmail: (email: string) => inviteByEmail.mutateAsync(email),
    revokeInvite: (id: string) => revokeInvite.mutateAsync(id),
    acceptInvite: (inv: FamilyInvite) => acceptInvite.mutateAsync(inv),
    declineInvite: (id: string) => declineInvite.mutateAsync(id),
    deleteFamily: () => deleteFamily.mutateAsync(),
  };
}