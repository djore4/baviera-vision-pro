import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useProspecScope } from '@/hooks/useProspecScope';
import { countOverdue } from '@/lib/prospec';

/* Contador de atrasados da Prospeção — alimenta o badge permanente no separador,
 * para não depender de o utilizador ir à secção "Atrasados" ver. */
interface ProspecValue {
  overdue: number;
  refresh: () => void;
}

const ProspecContext = createContext<ProspecValue>({ overdue: 0, refresh: () => {} });
export const useProspec = () => useContext(ProspecContext);

const REFRESH_MS = 5 * 60 * 1000; // reavalia periodicamente (datas passam sozinhas)

export function ProspecProvider({ children }: { children: React.ReactNode }) {
  const { canView } = usePermissions();
  const { scope } = useProspecScope();
  const hasAccess = canView('prospecao');
  const [overdue, setOverdue] = useState(0);

  const refresh = useCallback(async () => {
    if (!hasAccess) { setOverdue(0); return; }
    try { setOverdue(await countOverdue(scope)); } catch { /* silencioso */ }
  }, [hasAccess, scope]);

  useEffect(() => {
    refresh();
    if (!hasAccess) return;
    const id = window.setInterval(refresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh, hasAccess]);

  return <ProspecContext.Provider value={{ overdue, refresh }}>{children}</ProspecContext.Provider>;
}
