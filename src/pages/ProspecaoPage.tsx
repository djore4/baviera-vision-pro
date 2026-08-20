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
      <header className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <Target className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-bold tracking-tight leading-tight truncate">Prospeção Comercial</h1>
          <p className="text-xs text-muted-foreground leading-snug line-clamp-1">Contas, agenda e pipeline da equipa de vendas.</p>
        </div>
        {overdue > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive text-[11px] sm:text-xs font-semibold px-2.5 py-1.5 whitespace-nowrap">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {overdue} em atraso
          </span>
        )}
      </header>

      <Tabs defaultValue="contas">
        <TabsList className="h-10 p-1 bg-muted/60 w-full sm:w-auto">
          <TabsTrigger value="contas" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm"><Building2 className="h-4 w-4" />Contas</TabsTrigger>
          <TabsTrigger value="dia" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm"><CalendarDays className="h-4 w-4" /><span className="whitespace-nowrap">O meu dia</span></TabsTrigger>
          {isDirector && <TabsTrigger value="gestao" className="flex-1 sm:flex-none gap-1.5 data-[state=active]:shadow-sm"><LineChart className="h-4 w-4" />Gestão</TabsTrigger>}
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
