import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRecordEditor } from '@/components/RecordEditor';
import { FunilBoard, FUNIL_STATUSES, type FunilRow } from '@/components/funil/FunilBoard';

export default function FunilPage() {
  const { data } = useData();
  const { openEditor, openNew, deleteRecord } = useRecordEditor();
  // Espelha a política RLS de control_records: escreve quem edita Dados ou Database.
  const { canEdit } = usePermissions();
  const canEditRecords = canEdit('dados') || canEdit('database');

  const records = useMemo<FunilRow[]>(() =>
    (data?.control ?? [])
      .filter(r => (FUNIL_STATUSES as string[]).includes(r.status))
      .map(r => ({ id: r.id, status: r.status as FunilRow['status'], resp: r.resp, version: r.version, cliente: r.cliente, obs: r.obs })),
    [data]
  );

  // Negócio novo entra no funil como Frio (do responsável filtrado, se houver) e segue o fluxo normal.
  const novoNegocio = (resp: string | null) => openNew({ status: 'Frio', type: 'VN', ...(resp ? { resp } : {}) });

  return (
    <FunilBoard
      records={records}
      onEdit={canEditRecords ? openEditor : undefined}
      onNew={canEditRecords ? novoNegocio : undefined}
      onDelete={canEditRecords ? deleteRecord : undefined}
    />
  );
}
