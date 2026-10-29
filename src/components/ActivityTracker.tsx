import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { registarAtividade } from '@/lib/atividade';

/* Regista a sessão (uma vez por separador do browser) e cada página aberta, para os
 * logs da administração. Não desenha nada. */
const SESSAO_KEY = 'atividade:sessao';

export function ActivityTracker() {
  const { pathname } = useLocation();
  const ultima = useRef<string | null>(null);

  useEffect(() => {
    if (ultima.current === pathname) return;   // StrictMode e re-renders
    ultima.current = pathname;
    try {
      if (!sessionStorage.getItem(SESSAO_KEY)) {
        sessionStorage.setItem(SESSAO_KEY, '1');
        void registarAtividade('sessao', pathname);
      }
    } catch { /* sessionStorage indisponível: regista só a página */ }
    void registarAtividade('pagina', pathname);
  }, [pathname]);

  return null;
}
