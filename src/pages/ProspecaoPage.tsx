import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target, Building2, CalendarDays, LineChart, AlertTriangle } from 'lucide-react';
import { useProspecScope } from '@/hooks/useProspecScope';
import { useProspec } from '@/contexts/ProspecContext';
import { AccountsTab } from '@/components/prospecao/AccountsTab';
import { WorkspaceTab } from '@/components/prospecao/WorkspaceTab';
import { ManagementTab } from '@/components/prospecao/ManagementTab';

/* ── Tab Prospeção Comercial (admin) ──────────────────────────────────────────
 * CRM interno para a equipa de vendas: contas empresariais + espaço de trabalho
 * do vendedor + vista de gestão. Domínio isolado (tabelas prospec_* no Supabase).
 * ──────────────────────────────────────────────────────────────────────────── */
export default function ProspecaoPage() {
  const { scope, isDirector, myEmail, myNome } = useProspecScope();
  const { overdue, refresh } = useProspec();

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 rounded-xl border border-border bg-gradient-to-r from-primary/10 via-card to-card px-4 py-3.5 shadow-sm">
        <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Target className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-bold tracking-tight leading-tight">Prospeção Comercial</h1>
          <p className="text-xs text-muted-foreground">Contas empresariais, agenda e pipeline da equipa de vendas.</p>
        </div>
        {overdue > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overdue} em atraso
          </span>
        )}
      </header>

      <Tabs defaultValue="contas">
        <TabsList className="h-10 p-1 bg-muted/60">
          <TabsTrigger value="contas" className="gap-1.5 data-[state=active]:shadow-sm"><Building2 className="h-4 w-4" />Contas</TabsTrigger>
          <TabsTrigger value="dia" className="gap-1.5 data-[state=active]:shadow-sm"><CalendarDays className="h-4 w-4" />O meu dia</TabsTrigger>
          {isDirector && <TabsTrigger value="gestao" className="gap-1.5 data-[state=active]:shadow-sm"><LineChart className="h-4 w-4" />Gestão</TabsTrigger>}
        </TabsList>

        <TabsContent value="contas" className="mt-4">
          <AccountsTab scope={scope} isDirector={isDirector} myEmail={myEmail} myNome={myNome} />
        </TabsContent>
        <TabsContent value="dia" className="mt-4">
          <WorkspaceTab myEmail={myEmail} myNome={myNome} onCountsChanged={refresh} />
        </TabsContent>
        {isDirector && (
          <TabsContent value="gestao" className="mt-4">
            <ManagementTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
