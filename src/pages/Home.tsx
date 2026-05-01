import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

/** Routeur d'entrée : envoie vers /welcome ou /workspace selon la préférence. */
export default function Home() {
  const { profile, loading } = useAuth();
  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  return <Navigate to={profile.hide_welcome ? "/workspace" : "/welcome"} replace />;
}
