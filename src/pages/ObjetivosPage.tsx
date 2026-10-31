import { useState } from 'react';
import { Construction } from 'lucide-react';
import { usePermissions } from '@/contexts/PermissionsContext';
import ObjetivosVnPanel from '@/components/objetivos/ObjetivosVnPanel';
import ObjetivosVuPanel from '@/components/objetivos/ObjetivosVuPanel';

/* ── Objetivos (transversal) ───────────────────────────────────────────────────
 * Um só tab para os objetivos de todas as áreas. Quem tem edição no tab 'objetivos'
 * altera os que estão ativos (VN e VU); os restantes só consultam. As áreas ainda sem
 * lógica definida aparecem como "em desenvolvimento".
 * ──────────────────────────────────────────────────────────────────────────── */

export const OBJETIVOS_AREAS = [
  { key: 'vn', label: 'Vendas VN', emDesenvolvimento: false },
  { key: 'vu', label: 'Vendas VU', emDesenvolvimento: false },
  { key: 'motorrad-vn', label: 'Vendas Motorrad VN', emDesenvolvimento: true },
  { key: 'motorrad-vu', label: 'Vendas Motorrad VU', emDesenvolvimento: true },
  { key: 'finance', label: 'Finance', emDesenvolvimento: true },
  { key: 'apv', label: 'APV', emDesenvolvimento: true },
] as const;

type AreaKey = (typeof OBJETIVOS_AREAS)[number]['key'];

function EmDesenvolvimento({ area }: { area: string }) {
  return (
    <div role="status" className="max-w-xl rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-2">
      <Construction className="h-8 w-8 mx-auto text-amber-500" aria-hidden />
      <h2 className="text-sm font-semibold">{area}</h2>
      <p className="text-xs text-muted-foreground">
        Objetivos <strong>em desenvolvimento</strong>. Esta área ainda não tem objetivos definidos na plataforma.
      </p>
    </div>
  );
}

export default function ObjetivosPage() {
  const { canEdit } = usePermissions();
  const editable = canEdit('objetivos');
  const [areaKey, setAreaKey] = useState<AreaKey>('vn');
  const area = OBJETIVOS_AREAS.find(a => a.key === areaKey)!;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Área dos objetivos" className="flex flex-wrap gap-1 rounded-lg bg-muted p-0.5 w-fit max-w-full">
        {OBJETIVOS_AREAS.map(a => (
          <button
            key={a.key}
            role="tab"
            aria-selected={areaKey === a.key}
            onClick={() => setAreaKey(a.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              areaKey === a.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.label}
            {a.emDesenvolvimento && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
                em desenvolvimento
              </span>
            )}
          </button>
        ))}
      </div>

      {areaKey === 'vn' && <ObjetivosVnPanel editable={editable} />}
      {areaKey === 'vu' && <ObjetivosVuPanel editable={editable} />}
      {area.emDesenvolvimento && <EmDesenvolvimento area={area.label} />}
    </div>
  );
}
