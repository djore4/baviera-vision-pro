import { useEffect, useState } from 'react';
import { client } from '@/clients';
import {
  appJaInstalada, dispensar, faixaDevida, instalar, lerEstado, plataformaMovel, subscrever, temPedido,
} from '@/lib/install-prompt';

/* Faixa "Instalar a app" (telemóvel, depois do login). Regras em lib/install-prompt. */
export function InstallBanner() {
  const [, forcar] = useState(0);
  const [escondida, setEscondida] = useState(false);

  useEffect(() => subscrever(() => forcar(n => n + 1)), []);

  const plat = plataformaMovel(navigator.userAgent, navigator.maxTouchPoints);
  if (escondida || !plat || appJaInstalada() || !faixaDevida(lerEstado())) return null;
  if (plat === 'android' && !temPedido()) return null; // sem evento do browser não há o que oferecer

  const fechar = () => { dispensar(); setEscondida(true); };
  const instalarApp = async () => { await instalar(); setEscondida(true); };

  return (
    <div
      role="region"
      aria-label="Instalar a app"
      className="fixed inset-x-2 z-[60] flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm leading-tight shadow-xl"
      style={{ bottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={36} height={36} className="shrink-0 rounded-lg" />
      <p className="min-w-0 flex-1">
        {plat === 'ios'
          ? <>Instala a app no iPhone: toca em <b>Partilhar</b> e depois em <b>Adicionar ao ecrã principal</b>.</>
          : <>Instala o {client.title} no teu telemóvel para abrires com um toque.</>}
      </p>
      {plat === 'android' && (
        <button type="button" onClick={instalarApp} className="shrink-0 rounded-lg bg-primary px-3.5 py-2 font-bold text-primary-foreground">Instalar</button>
      )}
      <button type="button" onClick={fechar} aria-label="Agora não" className="shrink-0 px-2 py-2 text-[13px] text-muted-foreground">
        {plat === 'android' ? 'Agora não' : 'OK'}
      </button>
    </div>
  );
}
