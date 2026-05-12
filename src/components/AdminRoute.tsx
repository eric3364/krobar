import { ReactNode } from "react";
import { Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LogOut, LayoutDashboard, FlaskConical, FolderOpen, Plus, Wand2, Palette, ListChecks, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BYPASS_AUTH } from "@/lib/devAuth";
import { Helmet } from "react-helmet-async";

const navItems = [
  { label: "Back-office", path: "/admin", icon: LayoutDashboard },
  { label: "Nouveau template", path: "/admin/templates/new", icon: Plus },
  { label: "Atelier IA", path: "/admin/templates/atelier", icon: Wand2 },
  { label: "Studio", path: "/admin/studio", icon: Palette },
  { label: "Drafts", path: "/admin/templates/drafts", icon: FolderOpen },
  { label: "Suite de tests", path: "/admin/test-suite", icon: ListChecks },
  { label: "Benchmark", path: "/admin/benchmark", icon: FlaskConical },
];

function AdminLayoutInner({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="p-4 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mode administration</p>
          </div>
          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map((item) => {
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border space-y-2">
            <Link to="/workspace" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <LogOut className="h-4 w-4" /> Retour à l'éditeur
            </Link>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (BYPASS_AUTH) {
    return <AdminLayoutInner>{children}</AdminLayoutInner>;
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  if (!user || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <AdminLayoutInner>{children}</AdminLayoutInner>;
}
