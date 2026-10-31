import { useState } from 'react';
import { usePermissions } from '@/contexts/PermissionsContext';
import ObjetivosVnPanel from '@/components/objetivos/ObjetivosVnPanel';
import ObjetivosVuPanel from '@/components/objetivos/ObjetivosVuPanel';

/* ── Objetivos (transversal) ───────────────────────────────────────────────────
 * Um só tab para os objetivos de Vendas VN e de Vendas VU. Quem tem edição no tab
 * 'objetivos' altera ambos; os restantes só consultam.
 * ──────────────────────────────────────────────────────────────────────────── */

const AREAS = [
  { key: 'vn', label: 'Vendas VN' },
  { key: 'vu', label: 'Vendas VU' },
] as const;

export default function ObjetivosPage() {
  const { canEdit } = usePermissions();
  const editable = canEdit('objetivos');
  const [area, setArea] = useState<(typeof AREAS)[number]['key']>('vn');

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Área dos objetivos" className="inline-grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
        {AREAS.map(a => (
          <button
            key={a.key}
            role="tab"
            aria-selected={area === a.key}
            onClick={() => setArea(a.key)}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
              area === a.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {area === 'vn' ? <ObjetivosVnPanel editable={editable} /> : <ObjetivosVuPanel editable={editable} />}
    </div>
  );
}
