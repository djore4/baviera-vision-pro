import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import { fmtDataHora, haQuanto } from '@/lib/atividade';
import { TABELAS_IMPORTACAO, ultimosCarimbos, type Carimbo } from '@/lib/importacoes';

/* "Dados de há 2 h": quando foi a última importação do control VN, para toda a gente
 * saber se o que vê está atualizado. O tooltip tem as três tabelas. */
const REFRESCO_MS = 5 * 60 * 1000;

export function ImportStamp() {
  const [carimbos, setCarimbos] = useState<Carimbo[]>([]);

  useEffect(() => {
    let vivo = true;
    const carregar = () => { void ultimosCarimbos().then(c => { if (vivo) setCarimbos(c); }); };
    carregar();
    const id = window.setInterval(carregar, REFRESCO_MS);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  const vn = carimbos.find(c => c.tabela === 'control_records');
  if (!vn) return null;

  const detalhe = carimbos
    .map(c => `${TABELAS_IMPORTACAO[c.tabela]}: ${fmtDataHora(c.created_at)} (${c.linhas} registos)`)
    .join('\n');

  return (
    <span
      className="hidden md:inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      title={detalhe}
      data-testid="import-stamp"
    >
      <Database className="h-3 w-3" />
      Dados {haQuanto(vn.created_at)}
    </span>
  );
}
