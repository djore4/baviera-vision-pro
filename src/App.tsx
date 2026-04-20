import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
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
import DadosPage from "./pages/DadosPage";
import EscalaPage from "./pages/EscalaPage";
import NotFound from "./pages/NotFound";
import FunilPage from "./pages/FunilPage";
import LoginPage from "./pages/LoginPage";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);
  if (session === undefined) return null;
  if (!session) return <LoginPage />;
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
              <Route path="/escala" element={<AppLayout><EscalaPage /></AppLayout>} />
              <Route path="/dados" element={<AppLayout><DadosPage /></AppLayout>} />
              <Route path="/funil" element={<AppLayout><FunilPage /></AppLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
        </DataProvider>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
