import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

export function SicaiPlaceholder({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>
      <Card className="p-10 flex items-center gap-4">
        <Construction className="w-8 h-8 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium">Fonction SICAI en cours de construction</p>
          <p className="text-sm text-muted-foreground">
            Sémantique — Intensité — Cardinalité — Affordance Iconique
          </p>
        </div>
      </Card>
      {children}
    </div>
  );
}

export default function SicaiHome() {
  return (
    <SicaiPlaceholder
      title="SICAI"
      description="Sémantique — Intensité — Cardinalité — Affordance Iconique. Point d'entrée de la nouvelle fonction d'analyse."
    />
  );
}
