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
import BenchmarkPage from "./pages/BenchmarkPage.tsx";
import Admin from "./pages/Admin.tsx";
import AdminTemplateCreatePage from "./pages/AdminTemplateCreatePage.tsx";
import AdminDraftsPage from "./pages/AdminDraftsPage.tsx";

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
            <Route path="/workspace" element={<Index />} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/benchmark" element={<AdminRoute><BenchmarkPage /></AdminRoute>} />
            <Route path="/admin/templates/new" element={<AdminRoute><AdminTemplateCreatePage /></AdminRoute>} />
            <Route path="/admin/templates/drafts" element={<AdminRoute><AdminDraftsPage /></AdminRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
