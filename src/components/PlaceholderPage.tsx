import { Construction, type LucideIcon } from 'lucide-react';

/* ── Página-esqueleto ─────────────────────────────────────────────────────────
 * Placeholder para tabs anunciados mas ainda por desenvolver (ex.: área Vendas
 * VU). Mantém a moldura visual das restantes páginas e sinaliza o estado. A
 * funcionalidade real substitui este componente tab a tab.
 * ──────────────────────────────────────────────────────────────────────────── */
export function PlaceholderPage({
  title, icon: Icon, description,
}: { title: string; icon: LucideIcon; description?: string }) {
  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <header className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 shadow-sm">
        <span className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground shadow-sm shrink-0">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-base font-semibold leading-tight">{title}</h1>
          <p className="text-xs text-muted-foreground">Vendas VU · em desenvolvimento</p>
        </div>
      </header>

      <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
        <Construction className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h2 className="mt-4 text-sm font-medium">Em desenvolvimento</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {description ?? 'Este separador ainda não tem funcionalidade. O conteúdo será adicionado em breve.'}
        </p>
      </div>
    </div>
  );
}
