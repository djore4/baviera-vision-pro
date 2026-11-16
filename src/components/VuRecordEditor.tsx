import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ChoiceOrTypeField, MonthPicker, ResponsavelField, hojeIso } from '@/components/RecordEditor';
import { vendedorInitials } from '@/lib/team';
import { modelOptions, versionOptions } from '@/lib/vehicle-options';
import {
  EMPTY_VU_FORM, VU_FIN_OPTS, VU_GAR_OPTS, VU_PROV_OPTS, VU_RECORDS_CHANGED_EVENT, VU_STATUS_OPTS, VU_TYPE_OPTS,
  applyVuDfatChange, applyVuStatusChange, deleteControlVu, getControlVuForm, isVuFaturado, loadControlVuFromDb, saveControlVu, validateVuForm,
  type VuForm, type VuRecord,
} from '@/lib/control-records-vu';

/* Editor dos negócios das Viaturas Usadas (tabela control_records_vu): criar, editar
 * e eliminar diretamente na plataforma, à imagem do editor de registos VN. Quem pode
 * abrir o editor decide-se nas páginas (canEdit('dados'), igual à RLS da tabela). */

const FIELD_CLS = 'w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary';
const LABEL_CLS = 'block text-[10px] font-medium text-muted-foreground mb-1';
const H3_CLS = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3';
const STATUS_LABEL: Record<string, string> = {
  FRIO: 'Frio', MORNO: 'Morno', QUENTE: 'Quente', CARTEIRA: 'Carteira', RETAIL: 'Retail', FATURA: 'Fatura (antigo)',
};

interface VuEditorValue {
  openEditor: (id: string) => void;
  /** `preset` pré-preenche campos do novo negócio (ex.: estado, tipo e responsável). */
  openNew: (preset?: Partial<VuForm>, onCreated?: () => void) => void;
  /** Elimina um negócio (botões de eliminar das tabelas). Devolve se correu bem. */
  deleteRecord: (id: string) => Promise<boolean>;
}
const VuEditorContext = createContext<VuEditorValue | null>(null);

export function useVuRecordEditor() {
  const ctx = useContext(VuEditorContext);
  if (!ctx) throw new Error('useVuRecordEditor must be used within VuRecordEditorProvider');
  return ctx;
}

const notifyChanged = () => window.dispatchEvent(new CustomEvent(VU_RECORDS_CHANGED_EVENT));

/* Datas de garantia: o Excel antigo trazia por vezes texto livre em vez de data. Enquanto
 * o valor não for uma data ISO mostra-se como texto (para não o perder ao editar). */
const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function VuRecordEditorProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<VuForm>(EMPTY_VU_FORM);
  const [saving, setSaving] = useState(false);
  const [loadingRow, setLoadingRow] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Negócios existentes: dão as listas de responsáveis, modelos e versões (evita duas grafias).
  const [existing, setExisting] = useState<VuRecord[]>([]);
  const onCreatedRef = useRef<(() => void) | undefined>(undefined);

  const loadExisting = useCallback(() => {
    loadControlVuFromDb().then(setExisting).catch(() => setExisting([]));
  }, []);

  const openNew = useCallback((preset?: Partial<VuForm>, onCreated?: () => void) => {
    onCreatedRef.current = onCreated;
    setForm({ ...EMPTY_VU_FORM, ...preset }); setEditId(null); setConfirmDelete(false); setOpen(true);
    loadExisting();
  }, [loadExisting]);

  const openEditor = useCallback(async (id: string) => {
    onCreatedRef.current = undefined;
    setEditId(id); setForm(EMPTY_VU_FORM); setConfirmDelete(false); setOpen(true); setLoadingRow(true);
    loadExisting();
    const row = await getControlVuForm(id);
    if (row) setForm(row);
    else toast.error('Não foi possível carregar o negócio.');
    setLoadingRow(false);
  }, [loadExisting]);

  const setField = <K extends keyof VuForm>(key: K, val: VuForm[K]) => setForm(f => ({ ...f, [key]: val }));

  async function save() {
    const problema = validateVuForm(form);
    if (problema) { toast.error(problema); return; }
    setSaving(true);
    try {
      await saveControlVu(form, editId);
    } catch (e) {
      setSaving(false);
      toast.error(`Não foi possível gravar o negócio: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
      return;
    }
    setSaving(false);
    setOpen(false);
    const criado = !editId ? onCreatedRef.current : undefined;
    onCreatedRef.current = undefined;
    notifyChanged();
    criado?.();
  }

  const deleteRecord = useCallback(async (id: string): Promise<boolean> => {
    try {
      await deleteControlVu(id);
    } catch (e) {
      toast.error(`Não foi possível eliminar o negócio: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
      return false;
    }
    notifyChanged();
    return true;
  }, []);

  async function remove() {
    if (!editId) return;
    const id = editId;
    setConfirmDelete(false);
    if (await deleteRecord(id)) setOpen(false);
  }

  const select = (k: keyof VuForm, label: string, opts: readonly string[], fmt: (o: string) => string = o => o) => (
    <div>
      <label className={LABEL_CLS} htmlFor={`vu-${k}`}>{label}</label>
      <select id={`vu-${k}`} value={String(form[k] ?? '')} onChange={e => setField(k, e.target.value as never)} className={FIELD_CLS}>
        <option value="">— seleccionar —</option>
        {opts.map(o => <option key={o} value={o}>{fmt(o)}</option>)}
      </select>
    </div>
  );
  const text = (k: keyof VuForm, label: string, type = 'text') => (
    <div>
      <label className={LABEL_CLS} htmlFor={`vu-${k}`}>{label}</label>
      <input id={`vu-${k}`} type={type} value={String(form[k] ?? '')} onChange={e => setField(k, e.target.value as never)} className={FIELD_CLS} />
    </div>
  );
  const flag = (k: 'ret' | 'a360' | 'recond', label: string) => {
    const active = !!form[k];
    return (
      <button key={k} type="button" aria-pressed={active} onClick={() => setField(k, active ? 0 : 1)}
        className={`px-3 py-1.5 text-xs rounded-full font-semibold border transition-colors ${
          active ? 'bg-amber-500 text-black border-amber-500'
                 : 'bg-background text-muted-foreground border-border hover:border-amber-400 hover:text-amber-400'
        }`}>
        {label}
      </button>
    );
  };
  const garantia = (k: 'dgarant' | 'garant3s', label: string) => text(k, label, isIso(form[k]) || !form[k] ? 'date' : 'text');

  return (
    <VuEditorContext.Provider value={{ openEditor, openNew, deleteRecord }}>
      {children}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label={editId ? 'Editar negócio VU' : 'Novo negócio VU'}>
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-semibold">{editId ? 'Editar negócio VU' : 'Novo negócio VU'}</h2>
              <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-4 w-4 text-muted-foreground" /></button>
            </div>

            <div className="p-5 space-y-6">
              {loadingRow && <p className="text-xs text-muted-foreground">A carregar negócio...</p>}

              <div>
                <h3 className={H3_CLS}>Geral</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS} htmlFor="vu-status">STATUS</label>
                    <select id="vu-status" value={form.status} onChange={e => setForm(f => applyVuStatusChange(f, e.target.value, new Date()))} className={FIELD_CLS}>
                      <option value="">— seleccionar —</option>
                      {(form.status === 'FATURA' ? [...VU_STATUS_OPTS, 'FATURA'] : [...VU_STATUS_OPTS]).map(o => <option key={o} value={o}>{STATUS_LABEL[o]}</option>)}
                    </select>
                  </div>
                  {text('dt_fecho', 'DT FECHO — Data de fecho', 'date')}
                  <ResponsavelField key={editId ?? 'novo'} value={form.resp} options={vendedorInitials(existing, form.resp)} onChange={v => setField('resp', v)} />
                  {text('cliente', 'CLIENTE')}
                  {text('biz', 'BIZ — Bizagi')}
                  <div className="col-span-2">
                    <label className={LABEL_CLS}>MÊS — Entrega (opcional)</label>
                    <MonthPicker value={form.mes1} onChange={v => setField('mes1', v)} />
                  </div>
                </div>
              </div>

              <div>
                <h3 className={H3_CLS}>Veículo</h3>
                <div className="grid grid-cols-2 gap-3">
                  {select('type', 'TYPE', VU_TYPE_OPTS)}
                  {select('gar', 'GAR — Garantia', VU_GAR_OPTS)}
                  <ChoiceOrTypeField key={`model-${editId ?? 'novo'}`} label="MODEL" inputLabel="Novo modelo" placeholder="Modelo"
                    value={form.model} options={modelOptions(existing, form.model)} onChange={v => setField('model', v)} />
                  <ChoiceOrTypeField key={`version-${editId ?? 'novo'}`} label="VERSION" inputLabel="Nova versão" placeholder="Versão"
                    value={form.version} options={versionOptions(existing, form.model, form.version)} onChange={v => setField('version', v)} />
                  {text('mat', 'MAT — Matrícula')}
                  {text('chas', 'CHAS — Chassis')}
                  {select('prov', 'PROV — Proveniência', VU_PROV_OPTS)}
                </div>
              </div>

              <div>
                <h3 className={H3_CLS}>Pagamento</h3>
                <div className="grid grid-cols-2 gap-3">
                  {select('fin', 'FIN — Forma de pagamento', VU_FIN_OPTS)}
                </div>
              </div>

              <div>
                <h3 className={H3_CLS}>Classificação</h3>
                <div className="flex flex-wrap gap-2">
                  {flag('ret', 'Retoma')}
                  {flag('a360', '360º')}
                  {flag('recond', 'Recondicionada')}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Podes seleccionar várias em simultâneo</p>
              </div>

              <div>
                <h3 className={H3_CLS}>Datas</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS} htmlFor="vu-dfat">DFAT — Data da fatura</label>
                    <input id="vu-dfat" type="date" value={form.dfat} onChange={e => setForm(f => applyVuDfatChange(f, e.target.value))} className={FIELD_CLS} />
                  </div>
                  {garantia('dgarant', 'DGARANT — Data de garantia')}
                  {garantia('garant3s', 'GARANT 3S — Garantia 3 anos')}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  No VU o retail coincide com a fatura: ao preencher a DFAT o estado passa automaticamente a Retail (e a data de fecho fica a de hoje, se vazia);
                  ao escolher Retail sem DFAT, esta fica a de hoje. Se apagares a DFAT de um retail, volta à Carteira.
                </p>
                {form.status === 'RETAIL' && !form.dfat && (
                  <button type="button" onClick={() => setForm(f => applyVuDfatChange(f, hojeIso()))} className="mt-1.5 text-[11px] text-primary hover:underline">Usar a data de hoje</button>
                )}
              </div>

              <div>
                <h3 className={H3_CLS}>Observações</h3>
                <textarea value={form.obs} onChange={e => setField('obs', e.target.value)} rows={3} aria-label="Observações"
                  className="w-full px-2.5 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  placeholder="Notas adicionais..." />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border sticky bottom-0 bg-card">
              <div>
                {editId && (
                  confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">Eliminar?</span>
                      <button onClick={remove} className="px-2.5 py-1.5 text-xs bg-destructive text-white rounded hover:bg-destructive/90">Sim, eliminar</button>
                      <button onClick={() => setConfirmDelete(false)} className="px-2.5 py-1.5 text-xs border border-border rounded hover:bg-muted">Não</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded hover:bg-destructive/10 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" /> Eliminar
                    </button>
                  )
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
                <button onClick={save} disabled={saving || loadingRow} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 disabled:opacity-50 transition-colors">
                  <Check className="h-3.5 w-3.5" />{saving ? 'A guardar...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </VuEditorContext.Provider>
  );
}
