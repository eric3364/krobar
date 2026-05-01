import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, History, LogIn, LogOut, Shield, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuota } from "@/hooks/useQuota";

const planLabels = { free: "Gratuit", basic: "Basique", premium: "Premium" } as const;

export default function AccountMenu() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { used, limit } = useQuota();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Button size="sm" variant="outline" onClick={() => navigate("/auth")}>
        <LogIn className="w-4 h-4" /> Connexion
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {profile && (
        <Badge variant="secondary" className="hidden sm:inline-flex">
          {planLabels[profile.plan]} · {used}/{limit}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost"><UserIcon className="w-4 h-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-popover">
          <DropdownMenuLabel className="truncate">{profile?.email ?? user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/welcome"><Home className="w-4 h-4" /> Accueil</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/historique"><History className="w-4 h-4" /> Historique</Link>
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link to="/admin"><Shield className="w-4 h-4" /> Back-office</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={async () => { await signOut(); navigate("/auth"); }}>
            <LogOut className="w-4 h-4" /> Se déconnecter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
