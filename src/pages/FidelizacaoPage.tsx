import {
  HeartHandshake, Contact, CalendarClock, StickyNote, BellRing,
  RefreshCw, ShieldCheck, Wallet, Gift,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ── Tab Fidelização (admin) ──────────────────────────────────────────────────
 * Área de CRM / acompanhamento de clientes por vendedor.
 * Primeira fase: estrutura e proposta. Persistência (lembretes/notas) e gatilhos
 * automáticos a partir das datas da carteira chegam nas fases seguintes.
 * ──────────────────────────────────────────────────────────────────────────── */

export default function FidelizacaoPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-[#002060] text-white px-4 py-3 flex items-center gap-3">
          <HeartHandshake className="h-6 w-6 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Fidelização</h1>
            <p className="text-[11px] text-white/70">CRM e acompanhamento de clientes</p>
          </div>
          <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide bg-amber-400 text-black px-2 py-1 rounded whitespace-nowrap">
            Primeira fase
          </span>
        </div>
        <div className="p-4 text-xs text-muted-foreground leading-relaxed">
          Espaço para cada vendedor gerir o seguimento dos seus clientes: agenda de lembretes,
          notas de contacto e gatilhos automáticos de fidelização adaptados ao comércio automóvel.
          As funcionalidades abaixo são a proposta inicial — vamos complementá-las ao longo do tempo.
        </div>
      </div>

      {/* CRM base */}
      <Section title="CRM base">
        <FeatureCard icon={Contact} title="Ficha de cliente"
          desc="Dados, veículo(s) e histórico de interações numa timeline única, pré-preenchida a partir da carteira." />
        <FeatureCard icon={CalendarClock} title="Agenda & lembretes"
          desc="Tarefas com data/hora (ligar, follow-up), com vista «para hoje» e «em atraso»." />
        <FeatureCard icon={StickyNote} title="Notas"
          desc="Anotações livres por cliente e por interação." />
        <FeatureCard icon={BellRing} title="Follow-ups"
          desc="Sequências de acompanhamento e alertas de tarefas por fechar." />
      </Section>

      {/* Fidelização automóvel */}
      <Section title="Fidelização — ajustado ao automóvel">
        <FeatureCard icon={RefreshCw} title="Recompra prevista"
          desc="Estimativa de substituição pela idade de posse; oportunidade de upgrade." />
        <FeatureCard icon={ShieldCheck} title="Fim de garantia / revisão"
          desc="Alertas de fim de garantia, revisão e IPO para contacto proativo." />
        <FeatureCard icon={Wallet} title="Fim de financiamento / renting"
          desc="Gatilho de renovação quando o contrato se aproxima do fim." />
        <FeatureCard icon={Gift} title="Aniversários & cortesia"
          desc="Aniversário do cliente e do negócio para contactos de relação." />
      </Section>

      <p className="text-[11px] text-muted-foreground text-center pt-1">
        Próxima fase: persistência de lembretes e notas, e ligação automática à carteira/retails já existentes.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-0.5">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: LucideIcon; title: string; desc: string }) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-3 flex gap-3">
      <div className="flex-shrink-0 h-9 w-9 rounded-md bg-[#002060]/10 text-[#002060] dark:bg-sky-500/15 dark:text-sky-300 flex items-center justify-center">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-foreground">{title}</h3>
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
            Em breve
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
      </div>
    </div>
  );
}
