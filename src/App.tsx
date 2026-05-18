import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { AdminRoute } from "@/components/AdminRoute";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Landing from "./pages/Landing.tsx";
import NotFound from "./pages/NotFound.tsx";
import Admin from "./pages/Admin.tsx";
import AdminStudioPage from "./pages/AdminStudioPage.tsx";
import AdminFamiliesPage from "./pages/AdminFamiliesPage.tsx";
import AdminMatricePage from "./pages/AdminMatricePage.tsx";
import AdminFeatureFlagsPage from "./pages/AdminFeatureFlagsPage.tsx";
import AdminLibraryPage from "./pages/AdminLibraryPage.tsx";
import AdminLibraryTemplatePage from "./pages/AdminLibraryTemplatePage.tsx";
import AuthPage from "./pages/Auth.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import SicaiHome from "./pages/sicai/SicaiPlaceholder.tsx";
import SicaiLibraryPage from "./pages/sicai/SicaiLibraryPage.tsx";
import SicaiNewPage from "./pages/sicai/SicaiNewPage.tsx";
import SicaiAnalysesPage from "./pages/sicai/SicaiAnalysesPage.tsx";
import SicaiArchetypesPage from "./pages/sicai/SicaiArchetypesPage.tsx";
import SicaiSettingsPage from "./pages/sicai/SicaiSettingsPage.tsx";
import SicaiDocumentPage from "./pages/sicai/SicaiDocumentPage.tsx";
import SicaiAnalysisEditPage from "./pages/sicai/SicaiAnalysisEditPage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/workspace" element={<ProtectedRoute><Index /></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/studio" element={<AdminRoute><AdminStudioPage /></AdminRoute>} />
            <Route path="/admin/library" element={<AdminRoute><AdminLibraryPage /></AdminRoute>} />
            <Route path="/admin/library/:templateId" element={<AdminRoute><AdminLibraryTemplatePage /></AdminRoute>} />
            <Route path="/admin/familles" element={<AdminRoute><AdminFamiliesPage /></AdminRoute>} />
            <Route path="/admin/feature-flags" element={<AdminRoute><AdminFeatureFlagsPage /></AdminRoute>} />
            <Route path="/admin/matrice" element={<AdminRoute><AdminMatricePage /></AdminRoute>} />

            {/* SICAI */}
            <Route path="/admin/sicai" element={<AdminRoute><SicaiHome /></AdminRoute>} />
            <Route path="/admin/sicai/library" element={<AdminRoute><SicaiLibraryPage /></AdminRoute>} />
            <Route path="/admin/sicai/new" element={<AdminRoute><SicaiNewPage /></AdminRoute>} />
            <Route path="/admin/sicai/documents/:id" element={<AdminRoute><SicaiDocumentPage /></AdminRoute>} />
            <Route path="/admin/sicai/analyses" element={<AdminRoute><SicaiAnalysesPage /></AdminRoute>} />
            <Route path="/admin/sicai/archetypes" element={<AdminRoute><SicaiArchetypesPage /></AdminRoute>} />
            <Route path="/admin/sicai/settings" element={<AdminRoute><SicaiSettingsPage /></AdminRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
