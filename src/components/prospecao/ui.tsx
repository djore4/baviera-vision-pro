import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/* ── Helpers visuais partilhados do módulo Prospeção ─────────────────────────── */

/* Cartão de secção com cabeçalho (ícone tintado + título + contador + ações). */
export function SectionCard({
  icon: Icon, title, count, tone = 'default', actions, className, children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  tone?: 'default' | 'danger';
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const danger = tone === 'danger';
  return (
    <section className={cn(
      'rounded-xl border bg-card shadow-sm animate-fade-in',
      danger && (count ?? 0) > 0 ? 'border-destructive/30 ring-1 ring-destructive/10' : 'border-border',
      className,
    )}>
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
        <span className={cn(
          'grid place-items-center h-8 w-8 rounded-lg shrink-0',
          danger ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
        )}>
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="font-semibold text-sm tracking-tight">{title}</h3>
        {count !== undefined && count > 0 && (
          <span className={cn(
            'rounded-full text-[11px] font-bold px-2 py-0.5 leading-none tabular-nums',
            danger ? 'bg-destructive text-destructive-foreground' : 'bg-primary/10 text-primary',
          )}>
            {count}
          </span>
        )}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* Avatar de iniciais com cor derivada do nome (empresa ou pessoa). */
const AVATAR_TONES = [
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300',
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function toneFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ name, size = 'md', rounded = 'lg' }: {
  name: string | null;
  size?: 'sm' | 'md';
  rounded?: 'lg' | 'full';
}) {
  const label = name?.trim() || '—';
  return (
    <span className={cn(
      'grid place-items-center font-semibold shrink-0 select-none',
      size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs',
      rounded === 'full' ? 'rounded-full' : 'rounded-lg',
      toneFor(label),
    )}>
      {initials(label)}
    </span>
  );
}

/* Distintivo do score, com cor por escalão. */
export function ScoreBadge({ score }: { score: number | null }) {
  const v = score ?? 0;
  const tone =
    v >= 4 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
    : v >= 3 ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300'
    : v >= 2 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center justify-center min-w-[2.75rem] rounded-md px-2 py-1 text-sm font-bold tabular-nums', tone)}>
      {score === null ? '—' : score.toFixed(1)}
    </span>
  );
}

/* Data amigável e relativa, com tom (atrasado a vermelho). */
export function relativeLabel(iso: string | null, done = false): { text: string; overdue: boolean } {
  if (!iso) return { text: 'sem data', overdue: false };
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => { const y = new Date(x); y.setHours(0, 0, 0, 0); return y; };
  const diffDays = Math.round((startOf(d).getTime() - startOf(now).getTime()) / 86400000);
  const time = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const overdue = !done && d.getTime() < now.getTime();
  let text: string;
  if (diffDays === 0) text = `Hoje · ${time}`;
  else if (diffDays === 1) text = `Amanhã · ${time}`;
  else if (diffDays === -1) text = `Ontem · ${time}`;
  else if (diffDays < -1 && diffDays >= -7) text = `Há ${Math.abs(diffDays)} dias`;
  else if (diffDays > 1 && diffDays <= 7) text = d.toLocaleDateString('pt-PT', { weekday: 'long' }).replace(/^./, c => c.toUpperCase()) + ` · ${time}`;
  else text = d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { text, overdue };
}

/* Estado vazio amigável. */
export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <span className="grid place-items-center h-11 w-11 rounded-full bg-muted text-muted-foreground mb-1">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="text-xs text-muted-foreground max-w-xs">{hint}</p>}
    </div>
  );
}
