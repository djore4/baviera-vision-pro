import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FunilBoard, type FunilRow, type FunilStatus } from '@/components/funil/FunilBoard';
import { loadControlVuFromDb, isVuFunilStatus, type VuRecord } from '@/lib/control-records-vu';

/* ── Funil de vendas · Viaturas Usadas ─────────────────────────────────────────
 * Mesma mecânica do Funil VN, alimentado pela tabela control_records_vu (ficheiro
 * VU carregado em Dados). Só considera os negócios com STATUS = FRIO | MORNO |
 * QUENTE; quando um negócio fecha, a linha passa a FATURA/CARTEIRA no ficheiro e
 * sai do funil para a WIP.
 * ──────────────────────────────────────────────────────────────────────────── */

const toFunilStatus = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()) as FunilStatus;

export default function FunilVuPage() {
  const [records, setRecords] = useState<VuRecord[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadControlVuFromDb()
      .then(recs => { if (alive) setRecords(recs); })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, []);

  const rows = useMemo<FunilRow[]>(() =>
    (records ?? [])
      .filter(r => isVuFunilStatus(r.status))
      .map(r => ({
        status: toFunilStatus(r.status),
        resp: r.resp,
        // No usado a versão sozinha diz pouco: junta o modelo quando existe.
        version: [r.model, r.version].filter(Boolean).join(' ') || '—',
        cliente: r.cliente,
        obs: r.obs,
      })),
    [records]
  );

  if (records === null) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <FunilBoard records={rows} />;
}
