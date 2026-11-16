import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FunilBoard, type FunilRow, type FunilStatus } from '@/components/funil/FunilBoard';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useVuRecordEditor } from '@/components/VuRecordEditor';
import { loadControlVuFromDb, isVuFunilStatus, VU_RECORDS_CHANGED_EVENT, type VuRecord } from '@/lib/control-records-vu';

/* ── Funil de vendas · Viaturas Usadas ─────────────────────────────────────────
 * Mesma mecânica do Funil VN, alimentado pela tabela control_records_vu. Só
 * considera os negócios com STATUS = FRIO | MORNO | QUENTE; quando um negócio fecha
 * passa a FATURA/CARTEIRA (editado aqui ou na WIP) e sai do funil para a WIP.
 * Os negócios criam-se, editam-se e eliminam-se diretamente na plataforma por quem
 * tem edição em Dados (igual à RLS de control_records_vu).
 * ──────────────────────────────────────────────────────────────────────────── */

const toFunilStatus = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()) as FunilStatus;

export default function FunilVuPage() {
  const [records, setRecords] = useState<VuRecord[] | null>(null);
  const { openEditor, openNew, deleteRecord } = useVuRecordEditor();
  const { canEdit } = usePermissions();
  const canEditRecords = canEdit('dados');

  const load = useCallback(() => {
    let alive = true;
    loadControlVuFromDb()
      .then(recs => { if (alive) setRecords(recs); })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let cancel = load();
    const onChanged = () => { cancel(); cancel = load(); };
    window.addEventListener(VU_RECORDS_CHANGED_EVENT, onChanged);
    return () => { cancel(); window.removeEventListener(VU_RECORDS_CHANGED_EVENT, onChanged); };
  }, [load]);

  const rows = useMemo<FunilRow[]>(() =>
    (records ?? [])
      .filter(r => isVuFunilStatus(r.status))
      .map(r => ({
        id: r.id,
        status: toFunilStatus(r.status),
        resp: r.resp,
        // No usado a versão sozinha diz pouco: junta o modelo quando existe.
        version: [r.model, r.version].filter(Boolean).join(' ') || '—',
        cliente: r.cliente,
        obs: r.obs,
      })),
    [records]
  );

  // Negócio novo entra no funil como Frio (do responsável filtrado, se houver).
  const novoNegocio = (resp: string | null) => openNew({ status: 'FRIO', type: 'VU', ...(resp ? { resp } : {}) });

  if (records === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <FunilBoard
      records={rows}
      onEdit={canEditRecords ? openEditor : undefined}
      onNew={canEditRecords ? novoNegocio : undefined}
      onDelete={canEditRecords ? deleteRecord : undefined}
    />
  );
}
