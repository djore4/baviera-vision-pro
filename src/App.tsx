import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DataProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/retails" element={<AppLayout><RetailsPage /></AppLayout>} />
            <Route path="/producao" element={<AppLayout><ProducaoPage /></AppLayout>} />
            <Route path="/carteira" element={<AppLayout><CarteiraPage /></AppLayout>} />
            <Route path="/pendentes" element={<AppLayout><PendentesPage /></AppLayout>} />
            <Route path="/dados" element={<AppLayout><DadosPage /></AppLayout>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
