import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { client } from '@/clients';
import { forcedSeason, seasonalFlags } from '@/lib/seasonal';

/* ── Época festiva ────────────────────────────────────────────────────────────
 * Fonte única para a decoração de Natal. Põe `data-season="xmas"` no <html> quando a
 * época está ativa, o cliente não a desativou (`client.seasonal === false`) e a pessoa
 * não a desligou nas Definições. Só decoração: nunca altera cores da marca nem as
 * semânticas (verde/vermelho = objetivo). A preferência é por utilizador, em localStorage.
 * ──────────────────────────────────────────────────────────────────────────── */

const STORAGE_KEY = 'season.effects';

interface SeasonCtx {
  /** Época de Natal em curso (datas ou ?season=xmas), independentemente da preferência. */
  xmasWindow: boolean;
  /** Decoração efetivamente ligada: janela + cliente + preferência da pessoa. */
  xmas: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

const Ctx = createContext<SeasonCtx>({ xmasWindow: false, xmas: false, enabled: true, setEnabled: () => {} });

const readEnabled = () => {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
};

export function SeasonProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabledState] = useState(readEnabled);
  const xmasWindow = useMemo(
    () => client.seasonal !== false && seasonalFlags(new Date(), forcedSeason()).xmas,
    [],
  );
  const xmas = xmasWindow && enabled;

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(STORAGE_KEY, v ? 'on' : 'off'); } catch { /* ignora */ }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (xmas) root.dataset.season = 'xmas'; else delete root.dataset.season;
    return () => { delete root.dataset.season; };
  }, [xmas]);

  const value = useMemo(() => ({ xmasWindow, xmas, enabled, setEnabled }), [xmasWindow, xmas, enabled, setEnabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSeason = () => useContext(Ctx);
