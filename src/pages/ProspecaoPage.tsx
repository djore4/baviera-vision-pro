import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target, Building2, CalendarDays, LineChart } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-bmw-blue" />
        <h1 className="text-lg font-semibold">Prospeção Comercial</h1>
        {overdue > 0 && (
          <span className="rounded-full bg-destructive text-destructive-foreground text-xs px-2 py-0.5 font-semibold">
            {overdue} atrasado{overdue === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <Tabs defaultValue="contas">
        <TabsList>
          <TabsTrigger value="contas"><Building2 className="h-4 w-4 mr-1" />Contas</TabsTrigger>
          <TabsTrigger value="dia"><CalendarDays className="h-4 w-4 mr-1" />O meu dia</TabsTrigger>
          {isDirector && <TabsTrigger value="gestao"><LineChart className="h-4 w-4 mr-1" />Gestão</TabsTrigger>}
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
