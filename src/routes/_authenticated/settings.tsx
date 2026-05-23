import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/theme-provider";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error(error.message);
    else {
      toast.success("Disconnesso");
      navigate({ to: "/auth" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="text-xs text-muted-foreground">Account</div>
        <div className="mt-1 font-medium break-all">{user?.email}</div>
      </Card>

      <Card className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          <div>
            <Label htmlFor="theme-switch" className="font-medium">
              Tema scuro
            </Label>
            <div className="text-xs text-muted-foreground">Cambia aspetto dell'app</div>
          </div>
        </div>
        <Switch
          id="theme-switch"
          checked={theme === "dark"}
          onCheckedChange={(c) => setTheme(c ? "dark" : "light")}
        />
      </Card>

      <Button variant="destructive" onClick={handleLogout} className="w-full">
        <LogOut className="h-4 w-4 mr-2" />
        Esci
      </Button>
    </div>
  );
}