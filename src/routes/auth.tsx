import { createFileRoute, Navigate } from "@tanstack/react-router";
import { toUserMessage } from "@/lib/user-errors";
import { useState, type FormEvent } from "react";
import { ShoppingBasket, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && session) return <Navigate to="/" />;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) toast.error(toUserMessage(error));
    else toast.success("Accesso effettuato");
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setSubmitting(false);
    if (error) toast.error(toUserMessage(error));
    else toast.success("Controlla la tua email per confermare la registrazione");
  };

  const handleReset = async () => {
    if (!email.trim()) {
      toast.error("Inserisci la tua email per ricevere il reset");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) toast.error(toUserMessage(error));
    else toast.success("Ti abbiamo inviato un'email per reimpostare la password");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-xl shadow-primary/25">
            <ShoppingBasket className="h-8 w-8" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">App Prezzi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tieni traccia di quanto spendi davvero
            </p>
          </div>
        </div>

        <Card className="p-6 shadow-lg border-border/50">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4 h-11">
              <TabsTrigger value="login" className="h-9 text-sm font-medium">Accedi</TabsTrigger>
              <TabsTrigger value="signup" className="h-9 text-sm font-medium">Registrati</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <Field id="email-login" label="Email" type="email" value={email} onChange={setEmail} />
                <PasswordField
                  id="pwd-login"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
                <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accedi"}
                </Button>
                <div className="text-center">
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleReset}
                    className="text-muted-foreground"
                  >
                    Password dimenticata?
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <Field id="email-signup" label="Email" type="email" value={email} onChange={setEmail} />
                <PasswordField
                  id="pwd-signup"
                  value={password}
                  onChange={setPassword}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                />
                <Button type="submit" size="lg" className="w-full mt-2" disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crea account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={type === "password" ? "current-password" : "email"}
      />
    </div>
  );
}

function PasswordField({
  id,
  value,
  onChange,
  show,
  onToggle,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Password</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          autoComplete="current-password"
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label={show ? "Nascondi password" : "Mostra password"}
          tabIndex={-1}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}