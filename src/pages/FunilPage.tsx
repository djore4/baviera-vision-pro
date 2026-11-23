import { useEffect, useMemo, useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useRecordEditor } from '@/components/RecordEditor';
import { FunilBoard, FUNIL_STATUSES, type FunilRow } from '@/components/funil/FunilBoard';
import { getMinhasIniciais, negocioMeu } from '@/lib/funil-escopo';

export default function FunilPage() {
  const { data } = useData();
  const { openEditor, openNew, deleteRecord } = useRecordEditor();
  // Espelha a política RLS de control_records: escreve tudo quem edita Dados ou Database; quem só
  // edita o Funil (vendedor) escreve apenas os seus negócios (RESP = as suas iniciais).
  const { canEdit } = usePermissions();
  const editaTudo = canEdit('dados') || canEdit('database');
  const editaOsSeus = !editaTudo && canEdit('funil');

  const [minhas, setMinhas] = useState<string[]>([]);
  useEffect(() => {
    if (!editaOsSeus) return;
    let alive = true;
    getMinhasIniciais().then(i => { if (alive) setMinhas(i); }).catch(() => { /* sem iniciais: só consulta */ });
    return () => { alive = false; };
  }, [editaOsSeus]);

  const records = useMemo<FunilRow[]>(() =>
    (data?.control ?? [])
      .filter(r => (FUNIL_STATUSES as string[]).includes(r.status))
      .map(r => ({ id: r.id, status: r.status as FunilRow['status'], resp: r.resp, version: r.version, cliente: r.cliente, obs: r.obs })),
    [data]
  );

  const podeEscrever = editaTudo || (editaOsSeus && minhas.length > 0);
  const podeNoNegocio = (r: FunilRow) => editaTudo || (editaOsSeus && negocioMeu(r.resp, minhas));

  // Negócio novo entra no funil como Frio (do responsável filtrado, se houver) e segue o fluxo normal.
  // O vendedor só cria negócios seus: o responsável é sempre uma das suas iniciais.
  const novoNegocio = (resp: string | null) => {
    const r = editaOsSeus ? (resp && negocioMeu(resp, minhas) ? resp : minhas[0]) : resp;
    openNew({ status: 'Frio', type: 'VN', ...(r ? { resp: r } : {}) });
  };

  return (
    <FunilBoard
      records={records}
      onEdit={podeEscrever ? openEditor : undefined}
      onNew={podeEscrever ? novoNegocio : undefined}
      onDelete={podeEscrever ? deleteRecord : undefined}
      canWriteRow={podeNoNegocio}
    />
  );
}
