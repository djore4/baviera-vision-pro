import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DataProvider } from "@/contexts/DataContext";
import { RecordEditorProvider } from "@/components/RecordEditor";
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
import DatabasePage from "./pages/DatabasePage";
import FichaMargemPage from "./pages/FichaMargemPage";
import DemosPage from "./pages/DemosPage";
import ObjetivosPage from "./pages/ObjetivosPage";
import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

const ADMIN_EMAIL = "joaocarlos.duarte@caetano.pt";

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
          <RecordEditorProvider>
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
              <Route path="/ficha-margem" element={<AppLayout><FichaMargemPage /></AppLayout>} />
              {/* Admin routes */}
              <Route path="/database" element={<AdminGate><AppLayout><DatabasePage /></AppLayout></AdminGate>} />
              <Route path="/demos" element={<AdminGate><AppLayout><DemosPage /></AppLayout></AdminGate>} />
              <Route path="/objetivos" element={<AdminGate><AppLayout><ObjetivosPage /></AppLayout></AdminGate>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
          </RecordEditorProvider>
        </DataProvider>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
