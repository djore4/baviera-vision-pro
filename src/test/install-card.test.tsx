import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { capturarPedidoInstalacao, guardarEstado, lerEstado } from '@/lib/install-prompt';
import { InstallCard } from '@/components/InstallCard';

const ua = (s: string) => Object.defineProperty(navigator, 'userAgent', { value: s, configurable: true });
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';

let capturado = false;
beforeEach(() => {
  localStorage.clear();
  if (!capturado) { capturarPedidoInstalacao(); capturado = true; }
});

describe('Instalar a app (Definições)', () => {
  it('iPhone: mostra as instruções', () => {
    ua(IOS);
    render(<InstallCard />);
    expect(screen.getByText(/Adicionar ao ecrã principal/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Instalar$/ })).toBeNull();
  });

  it('sem evento do browser: instruções manuais', () => {
    ua(ANDROID);
    render(<InstallCard />);
    expect(screen.getByText(/Instalar aplicação/)).toBeTruthy();
  });

  it('com o evento do browser aparece o botão que abre o diálogo nativo', async () => {
    ua(ANDROID);
    render(<InstallCard />);
    let abriu = false;
    act(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
      e.prompt = async () => { abriu = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    fireEvent.click(await screen.findByRole('button', { name: /Instalar/ }));
    await act(async () => { await Promise.resolve(); });
    expect(abriu).toBe(true);
    expect(lerEstado().instalada).toBe(true);
  });

  it('se a sugestão do topo foi dispensada, dá para a repor', () => {
    ua(ANDROID);
    guardarEstado({ instalada: true });
    render(<InstallCard />);
    fireEvent.click(screen.getByText('Voltar a mostrar a sugestão no topo'));
    expect(lerEstado()).toEqual({});
    expect(screen.queryByText('Voltar a mostrar a sugestão no topo')).toBeNull();
  });
});
