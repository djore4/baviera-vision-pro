import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { HashRouter, Route, Routes } from "react-router-dom";
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
import EmprestimosPage from "./pages/EmprestimosPage";
import ObjetivosPage from "./pages/ObjetivosPage";
import VendedoresPage from "./pages/VendedoresPage";
import FidelizacaoPage from "./pages/FidelizacaoPage";
import LavagemPage from "./pages/LavagemPage";
import UtilizadoresPage from "./pages/UtilizadoresPage";
import ArquivoPage from "./pages/ArquivoPage";
import DefinicoesPage from "./pages/DefinicoesPage";
import QualidadePage from "./pages/QualidadePage";
import { EasterEggs } from "@/components/EasterEggs";
import { PermissionsProvider, RequireTab } from "@/contexts/PermissionsContext";
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

/* Rota protegida: exige acesso (consulta ou edição) ao tab correspondente. */
const tab = (key: string, node: React.ReactNode) => (
  <RequireTab tab={key}><AppLayout>{node}</AppLayout></RequireTab>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthGate>
        <DataProvider>
          <RecordEditorProvider>
          <PermissionsProvider>
          <EasterEggs />
          <HashRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/retails" element={tab('retails', <RetailsPage />)} />
              <Route path="/producao" element={tab('producao', <ProducaoPage />)} />
              <Route path="/carteira" element={tab('carteira', <CarteiraPage />)} />
              <Route path="/pendentes" element={tab('pendentes', <PendentesPage />)} />
              <Route path="/escala" element={tab('escala', <EscalaPage />)} />
              <Route path="/funil" element={tab('funil', <FunilPage />)} />
              <Route path="/ficha-margem" element={tab('ficha-margem', <FichaMargemPage />)} />
              <Route path="/emprestimos" element={tab('emprestimos', <EmprestimosPage />)} />
              <Route path="/multas" element={tab('multas', <MultasPage />)} />
              <Route path="/dados" element={tab('dados', <DadosPage />)} />
              <Route path="/database" element={tab('database', <DatabasePage />)} />
              <Route path="/demos" element={tab('demos', <DemosPage />)} />
              <Route path="/objetivos" element={tab('objetivos', <ObjetivosPage />)} />
              <Route path="/vendedores" element={tab('vendedores', <VendedoresPage />)} />
              <Route path="/fidelizacao" element={tab('fidelizacao', <FidelizacaoPage />)} />
              <Route path="/lavagem" element={tab('lavagem', <LavagemPage />)} />
              <Route path="/arquivo" element={tab('arquivo', <ArquivoPage />)} />
              <Route path="/qualidade" element={tab('qualidade', <QualidadePage />)} />
              <Route path="/utilizadores" element={tab('utilizadores', <UtilizadoresPage />)} />
              {/* Definições — pessoal, acessível a qualquer utilizador (fora da matriz de permissões). */}
              <Route path="/definicoes" element={<AppLayout><DefinicoesPage /></AppLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </HashRouter>
          </PermissionsProvider>
          </RecordEditorProvider>
        </DataProvider>
      </AuthGate>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
