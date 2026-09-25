import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { FunilBoard, FUNIL_STATUSES, type FunilRow } from '@/components/funil/FunilBoard';

export default function FunilPage() {
  const { data } = useData();

  const records = useMemo<FunilRow[]>(() =>
    (data?.control ?? [])
      .filter(r => (FUNIL_STATUSES as string[]).includes(r.status))
      .map(r => ({ status: r.status as FunilRow['status'], resp: r.resp, version: r.version, cliente: r.cliente, obs: r.obs })),
    [data]
  );

  return <FunilBoard records={records} />;
}
