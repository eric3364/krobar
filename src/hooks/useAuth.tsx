import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { BYPASS_AUTH, DEV_PROFILE, DEV_USER } from "@/lib/devAuth";

type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  plan: "free" | "basic" | "premium";
  is_active: boolean;
  hide_welcome: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfileAndRole = async (uid: string) => {
    const [{ data: prof }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,plan,is_active,hide_welcome").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
    ]);
    setProfile((prof as Profile) ?? null);
    setIsAdmin(Boolean(roles?.some((r: { role: string }) => r.role === "admin")));
  };

  const syncUserState = async (nextSession: Session | null) => {
    setSession(nextSession);
    const nextUser = nextSession?.user ?? null;
    setUser(nextUser);

    if (!nextUser) {
      setProfile(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await fetchProfileAndRole(nextUser.id);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfileAndRole(user.id);
  };

  useEffect(() => {
    if (BYPASS_AUTH) {
      setSession(null);
      setUser(DEV_USER);
      setProfile(DEV_PROFILE as Profile);
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    // Set up listener FIRST
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      // defer to avoid deadlock
      setTimeout(() => {
        void syncUserState(sess);
      }, 0);
    });
    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      void syncUserState(s);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isAdmin, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
