import { useState, useEffect, useCallback } from 'react';
import {
  HeartHandshake, Contact, CalendarClock, BellRing,
  RefreshCw, ShieldCheck, Wallet, Gift, StickyNote, Trash2, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/App';
import { listNotes, createNote, deleteNote, type CrmNote } from '@/lib/crm';

/* ── Tab Fidelização (admin) ──────────────────────────────────────────────────
 * CRM / acompanhamento de clientes. Segmento 3: Notas funcionais (Supabase).
 * Restantes módulos ainda em construção.
 * ──────────────────────────────────────────────────────────────────────────── */

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
};

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
            Em construção
          </span>
        </div>
        <div className="p-4 text-xs text-muted-foreground leading-relaxed">
          Espaço para acompanhar o seguimento dos clientes: notas de contacto, agenda de lembretes e
          gatilhos de fidelização adaptados ao comércio automóvel. As <strong>Notas</strong> já estão
          ativas; os restantes módulos serão ligados por fases.
        </div>
      </div>

      {/* Notas — funcional */}
      <NotesPanel />

      {/* Restantes módulos (em construção) */}
      <Section title="Em breve — CRM base">
        <FeatureCard icon={Contact} title="Ficha de cliente"
          desc="Dados, veículo(s) e histórico de interações numa timeline única, pré-preenchida a partir da carteira." />
        <FeatureCard icon={CalendarClock} title="Agenda & lembretes"
          desc="Tarefas com data/hora (ligar, follow-up), com vista «para hoje» e «em atraso»." />
        <FeatureCard icon={BellRing} title="Follow-ups"
          desc="Sequências de acompanhamento e alertas de tarefas por fechar." />
      </Section>

      <Section title="Em breve — Fidelização automóvel">
        <FeatureCard icon={RefreshCw} title="Recompra prevista"
          desc="Estimativa de substituição pela idade de posse; oportunidade de upgrade." />
        <FeatureCard icon={ShieldCheck} title="Fim de garantia / revisão"
          desc="Alertas de fim de garantia, revisão e IPO para contacto proativo." />
        <FeatureCard icon={Wallet} title="Fim de financiamento / renting"
          desc="Gatilho de renovação quando o contrato se aproxima do fim." />
        <FeatureCard icon={Gift} title="Aniversários & cortesia"
          desc="Aniversário do cliente e do negócio para contactos de relação." />
      </Section>
    </div>
  );
}

function NotesPanel() {
  const { session } = useAuth();
  const email = session?.user.email ?? null;

  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await listNotes());
    } catch (e) {
      toast.error('Não foi possível carregar as notas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function add() {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const note = await createNote({ body: text, cliente: cliente.trim() || null, created_by: email });
      setNotes(prev => [note, ...prev]);
      setBody('');
      setCliente('');
      toast.success('Nota adicionada.');
    } catch (e) {
      toast.error('Não foi possível adicionar a nota.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Apagar esta nota?')) return;
    try {
      await deleteNote(id);
      setNotes(prev => prev.filter(n => n.id !== id));
      toast.success('Nota apagada.');
    } catch (e) {
      toast.error('Não foi possível apagar a nota.');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-[#002060] dark:text-sky-300" />
        <h2 className="text-xs font-semibold text-foreground uppercase tracking-wide">Notas</h2>
        <span className="ml-auto text-[10px] text-muted-foreground">{notes.length}</span>
      </div>

      <div className="p-3 space-y-3">
        {/* Formulário */}
        <div className="space-y-2">
          <input
            value={cliente}
            onChange={e => setCliente(e.target.value)}
            placeholder="Cliente (opcional)"
            className="w-full px-2 py-1 text-xs rounded bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#002060]"
          />
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
            placeholder="Escreve uma nota…  (Ctrl/⌘ + Enter para guardar)"
            rows={2}
            className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground resize-y focus:outline-none focus:ring-1 focus:ring-[#002060]"
          />
          <div className="flex justify-end">
            <button
              onClick={add}
              disabled={!body.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#002060] text-white font-semibold hover:bg-[#002060]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Adicionar nota
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="space-y-1.5">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> A carregar…
            </div>
          ) : notes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">Ainda sem notas. Adiciona a primeira acima.</p>
          ) : (
            notes.map(note => (
              <div key={note.id} className="rounded border border-border/70 bg-muted/30 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {note.cliente && (
                      <span className="inline-block mb-0.5 text-[10px] font-semibold text-[#002060] dark:text-sky-300 bg-[#002060]/10 dark:bg-sky-500/15 rounded px-1.5 py-0.5">
                        {note.cliente}
                      </span>
                    )}
                    <p className="text-xs text-foreground whitespace-pre-wrap break-words">{note.body}</p>
                  </div>
                  <button
                    onClick={() => remove(note.id)}
                    title="Apagar nota"
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {fmtDateTime(note.created_at)}{note.created_by ? ` · ${note.created_by}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
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
