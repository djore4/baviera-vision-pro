import { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  CATEGORIAS, PRIORIDADES, hojeIso, type Categoria, type OcorrenciaFormValues, type Prioridade,
} from '@/lib/instalacoes';

interface Props {
  initial: OcorrenciaFormValues;
  pisoLabel: string;
  mode: 'new' | 'edit';
  saving: boolean;
  /** Interlocutores e zonas já usados: sugestões ao escrever. */
  interlocutores: string[];
  zonas: string[];
  onSubmit: (v: OcorrenciaFormValues) => void;
  onCancel: () => void;
  /** Só na edição: voltar a escolher o local na planta. */
  onMove?: () => void;
}

export function OcorrenciaForm({ initial, pisoLabel, mode, saving, interlocutores, zonas, onSubmit, onCancel, onMove }: Props) {
  const [v, setV] = useState<OcorrenciaFormValues>(initial);
  const set = <K extends keyof OcorrenciaFormValues>(k: K, val: OcorrenciaFormValues[K]) =>
    setV(prev => ({ ...prev, [k]: val }));

  const valid = v.titulo.trim() !== '' && v.intervencao.trim() !== '' && v.data_ocorrencia !== '';

  return (
    <form
      className="space-y-3"
      onSubmit={e => { e.preventDefault(); if (valid && !saving) onSubmit(v); }}
    >
      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Local marcado na planta · <strong className="text-foreground">{pisoLabel}</strong>
        </span>
        {onMove && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onMove}>
            Mudar local
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="oc-titulo">O que se passa *</Label>
        <Input id="oc-titulo" value={v.titulo} onChange={e => set('titulo', e.target.value)}
          placeholder="Ex.: Infiltração no teto" autoFocus={mode === 'new'} maxLength={140} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="oc-interv">Intervenção necessária *</Label>
        <Textarea id="oc-interv" rows={3} value={v.intervencao} onChange={e => set('intervencao', e.target.value)}
          placeholder="O que é preciso fazer para resolver" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Categoria</Label>
          <Select value={v.categoria} onValueChange={val => set('categoria', val as Categoria)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select value={v.prioridade} onValueChange={val => set('prioridade', val as Prioridade)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORIDADES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="oc-zona">Zona (opcional)</Label>
          <Input id="oc-zona" list="oc-zonas" value={v.zona} onChange={e => set('zona', e.target.value)}
            placeholder="Ex.: Oficina" maxLength={60} />
          <datalist id="oc-zonas">{zonas.map(z => <option key={z} value={z} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oc-data">Data da ocorrência *</Label>
          <Input id="oc-data" type="date" value={v.data_ocorrencia} max={hojeIso()}
            onChange={e => set('data_ocorrencia', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="oc-interl">Reportada a</Label>
          <Input id="oc-interl" list="oc-interls" value={v.interlocutor}
            onChange={e => set('interlocutor', e.target.value)} placeholder="Nome / entidade" maxLength={100} />
          <datalist id="oc-interls">{interlocutores.map(i => <option key={i} value={i} />)}</datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="oc-reporte">Data do reporte</Label>
          <Input id="oc-reporte" type="date" value={v.data_reporte} max={hojeIso()} disabled={!v.interlocutor.trim()}
            onChange={e => set('data_reporte', e.target.value)} />
        </div>
      </div>
      {!v.interlocutor.trim() && (
        <p className="-mt-1.5 text-[11px] text-muted-foreground">
          Sem interlocutor, a ocorrência fica como “por reportar”.
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="oc-obs">Observações</Label>
        <Textarea id="oc-obs" rows={2} value={v.obs} onChange={e => set('obs', e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button type="submit" disabled={!valid || saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'new' ? 'Registar ocorrência' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
