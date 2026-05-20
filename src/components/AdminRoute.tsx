import { ReactNode, useEffect, useRef } from "react";
import { Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, LayoutDashboard, Palette, Users, Pencil, Grid3x3, Flag, BookOpen, Brain, Library, FilePlus2, BarChart3, Shapes, Settings, FileText, FileImage } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BYPASS_AUTH } from "@/lib/devAuth";
import { Helmet } from "react-helmet-async";

const navItems = [
  { label: "Back-office", path: "/admin", icon: LayoutDashboard },
  { label: "Studio", path: "/admin/studio", icon: Palette },
  { label: "Bibliothèque", path: "/admin/library", icon: BookOpen },
  { label: "Familles", path: "/admin/familles", icon: Users },
  { label: "Feature flags", path: "/admin/feature-flags", icon: Flag },
  { label: "Matrice", path: "/admin/matrice", icon: Grid3x3 },
];

const sicaiNav = {
  label: "SICAI",
  path: "/admin/sicai",
  icon: Brain,
  children: [
    { label: "Bibliothèque", path: "/admin/sicai/library", icon: Library },
    { label: "Documents", path: "/admin/sicai/documents", icon: FileText },
    { label: "Nouveau texte", path: "/admin/sicai/new", icon: FilePlus2 },
    { label: "Analyses", path: "/admin/sicai/analyses", icon: BarChart3 },
    { label: "Archétypes graphiques", path: "/admin/sicai/archetypes", icon: Shapes },
    { label: "Paramètres SICAI", path: "/admin/sicai/settings", icon: Settings },
  ],
};

function AdminLayoutInner({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (mainRef.current) {
        mainRef.current.scrollLeft = 0;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

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
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
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

            {/* SICAI section */}
            <div className="pt-3 mt-2 border-t border-border">
              <Link
                to={sicaiNav.path}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${pathname === sicaiNav.path ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                <sicaiNav.icon className="h-4 w-4" />
                {sicaiNav.label}
              </Link>
              <div className="ml-3 mt-0.5 border-l border-border pl-2 space-y-0.5">
                {sicaiNav.children.map((c) => {
                  const active = pathname === c.path;
                  return (
                    <Link
                      key={c.path}
                      to={c.path}
                      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      <c.icon className="h-3.5 w-3.5" />
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
          <div className="p-3 border-t border-border">
            <Button asChild className="w-full" size="sm">
              <Link to="/workspace">
                <Pencil className="h-4 w-4" /> Passer en mode éditeur
              </Link>
            </Button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6">
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
