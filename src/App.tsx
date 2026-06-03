import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/contexts/DataContext";
import { AppLayout } from "@/components/AppLayout";
import Index from "./pages/Index";
import RetailsPage from "./pages/RetailsPage";
import ProducaoPage from "./pages/ProducaoPage";
import CarteiraPage from "./pages/CarteiraPage";
import PendentesPage from "./pages/PendentesPage";
import MultasPage from "./pages/MultasPage";
import DadosPage from "./pages/DadosPage";
import EscalaPage from "./pages/EscalaPage";
import NotFound from "./pages/NotFound";
import FunilPage from "./pages/FunilPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/admin/AdminPage";
import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

const ADMIN_EMAIL = "joao4duarte@gmail.com";

const queryClient = new QueryClient();

interface AuthContextValue {
  session: Session | null;
  isAdmin: boolean;
}

export const AuthContext = createContext<AuthContextValue>({ session: null, isAdmin: false });
export const useAuth = () => useContext(AuthContext);

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  if (!session) return <LoginPage />;

  const isAdmin = session.user.email === ADMIN_EMAIL;

  return (
    <AuthContext.Provider value={{ session, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/retails" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthGate>
        <DataProvider>
          <HashRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/retails" element={<AppLayout><RetailsPage /></AppLayout>} />
              <Route path="/producao" element={<AppLayout><ProducaoPage /></AppLayout>} />
              <Route path="/carteira" element={<AppLayout><CarteiraPage /></AppLayout>} />
              <Route path="/pendentes" element={<AppLayout><PendentesPage /></AppLayout>} />
              <Route path="/multas" element={<AppLayout><MultasPage /></AppLayout>} />
              <Route path="/escala" element={<AppLayout><EscalaPage /></AppLayout>} />
              <Route path="/dados" element={<AppLayout><DadosPage /></AppLayout>} />
              <Route path="/funil" element={<AppLayout><FunilPage /></AppLayout>} />
              {/* Admin routes */}
              <Route path="/admin" element={<AdminGate><Navigate to="/admin/database" replace /></AdminGate>} />
              <Route path="/admin/database" element={<AdminGate><AdminPage /></AdminGate>} />
              <Route path="/admin/demos" element={<AdminGate><AdminPage /></AdminGate>} />
              <Route path="/admin/objetivos" element={<AdminGate><AdminPage /></AdminGate>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </DataProvider>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
