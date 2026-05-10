import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import TestSuiteView from "@/components/TestSuiteView";

type Manifest = { templates: any[] };

export default function AdminTestSuitePage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/templates/manifest.json")
      .then((r) => {
        if (!r.ok) throw new Error("Impossible de charger le manifest");
        return r.json();
      })
      .then(setManifest)
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur de chargement"));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-destructive">
        {error} — <Link to="/admin" className="underline ml-1">retour</Link>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Chargement du manifest…
      </div>
    );
  }

  return <TestSuiteView manifest={manifest} onBack={() => navigate("/admin")} />;
}
