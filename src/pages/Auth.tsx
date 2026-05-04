import { useEffect, useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import PasswordInput from "@/components/PasswordInput";

const emailSchema = z.string().trim().email("Email invalide").max(255);
const passwordSchema = z.string().min(8, "Mot de passe : 8 caractères minimum").max(72);

export default function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup" | "magic">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    // If user just arrived from a magic link (no password set yet), send to reset-password
    const hash = window.location.hash;
    const fromMagicLink = hash.includes("type=magiclink") || hash.includes("type=signup");
    navigate(fromMagicLink ? "/reset-password" : "/workspace", { replace: true });
  }, [user, authLoading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.errors[0].message);
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("invalid")) toast.error("Email ou mot de passe incorrect");
      else toast.error(error.message);
      return;
    }
    toast.success("Connecté");
    navigate("/workspace", { replace: true });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email);
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.errors[0].message);
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName || undefined },
      },
    });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("already")) toast.error("Cet email est déjà inscrit");
      else toast.error(error.message);
      return;
    }
    toast.success("Compte créé");
    navigate("/workspace", { replace: true });
  };

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(email);
    } catch (err) {
      if (err instanceof z.ZodError) return toast.error(err.errors[0].message);
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Lien envoyé. Consultez votre boîte mail.");
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error(`Échec connexion ${provider}`);
      return;
    }
    if (result.redirected) return; // browser redirect
    navigate("/workspace", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">Bienvenue</h1>
          <p className="text-sm text-muted-foreground">Connectez-vous pour générer vos visuels</p>
        </div>

        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => handleOAuth("google")} disabled={busy}>
            Continuer avec Google
          </Button>
          <Button variant="outline" className="w-full" onClick={() => handleOAuth("apple")} disabled={busy}>
            Continuer avec Apple
          </Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="signin">Connexion</TabsTrigger>
            <TabsTrigger value="signup">Inscription</TabsTrigger>
            <TabsTrigger value="magic">Magic link</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-3 pt-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Mot de passe</Label><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : "Se connecter"}
              </Button>
              <div className="text-center text-sm">
                <Link to="/reset-password" className="text-muted-foreground hover:underline">Mot de passe oublié ?</Link>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-3 pt-3">
              <div><Label>Nom (optionnel)</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div><Label>Mot de passe</Label><PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} /></div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : "Créer un compte"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="magic">
            <form onSubmit={handleMagic} className="space-y-3 pt-3">
              <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : (<><Mail className="w-4 h-4" /> Envoyer le lien</>)}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
