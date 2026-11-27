import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Shuffle, Square, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { BimbyBoneco } from './BimbyBoneco';
import { MAX_CHARS, textoParaFala } from '@/lib/bimby';

const EXEMPLOS = [
  'Bom dia a todos, hoje vamos bater o objetivo do mês',
  'Quem é que se esqueceu de fechar a reserva do cliente',
  'A reunião de equipa começa dentro de cinco minutos',
];

type Modo = 'fiel' | 'maluco';

function escolherVoz(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const vozes = window.speechSynthesis.getVoices();
  return vozes.find(v => v.lang.toLowerCase() === 'pt-pt') ?? vozes.find(v => v.lang.toLowerCase().startsWith('pt')) ?? null;
}

export function Bimby() {
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<Modo>('maluco');
  const [fala, setFala] = useState('');
  const [falando, setFalando] = useState(false);
  const [boca, setBoca] = useState(false);
  const suportado = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const temporizador = useRef<number | null>(null);

  const pararBoca = useCallback(() => {
    if (temporizador.current !== null) window.clearInterval(temporizador.current);
    temporizador.current = null;
    setBoca(false);
  }, []);

  const calar = useCallback(() => {
    if (suportado) window.speechSynthesis.cancel();
    pararBoca();
    setFalando(false);
  }, [suportado, pararBoca]);

  // Vozes carregam de forma assíncrona em alguns browsers; desliga a fala ao sair do tab.
  useEffect(() => {
    if (!suportado) return;
    const s = window.speechSynthesis;
    s.getVoices();
    return () => { s.cancel(); pararBoca(); };
  }, [suportado, pararBoca]);

  const falar = () => {
    const dita = textoParaFala(texto, modo);
    if (!dita) return;
    setFala(dita);
    if (!suportado) return; // sem síntese de voz: fica só o balão
    calar();
    const u = new SpeechSynthesisUtterance(dita);
    const voz = escolherVoz();
    if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = 'pt-PT';
    u.pitch = 2; // voz de desenho animado
    u.rate = 1.2;
    u.onstart = () => {
      setFalando(true);
      temporizador.current = window.setInterval(() => setBoca(b => !b), 140);
    };
    const fim = () => { pararBoca(); setFalando(false); };
    u.onend = fim;
    u.onerror = fim;
    window.speechSynthesis.speak(u);
  };

  const exemplo = () => setTexto(EXEMPLOS[Math.floor(Math.random() * EXEMPLOS.length)]);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1fr_1fr] animate-fade-in">
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-gradient-to-b from-amber-50 to-orange-100 p-4 dark:from-amber-950/40 dark:to-orange-950/30">
        <div
          className="relative max-w-xs rounded-2xl border-2 border-amber-900/60 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-md min-h-[4rem]"
          aria-live="polite"
        >
          {fala || 'Escreve-me qualquer coisa… eu repito, mas à minha maneira!'}
          <span className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b-2 border-r-2 border-amber-900/60 bg-white" />
        </div>
        <BimbyBoneco falando={falando} aberta={boca} />
        <p className="text-xs font-semibold tracking-widest text-amber-900/70 dark:text-amber-200/70">BIMBY · 100% CARTÃO</p>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fala com o Bimby</h2>
          <p className="text-sm text-muted-foreground">
            Escreve uma frase e o Bimby repete-a em voz alta, mas em versão maluca.
          </p>
        </div>
        <Textarea
          value={texto}
          onChange={e => setTexto(e.target.value.slice(0, MAX_CHARS))}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); falar(); } }}
          placeholder="O que é que o Bimby deve dizer?"
          rows={5}
          aria-label="Texto para o Bimby dizer"
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{texto.length}/{MAX_CHARS} · Ctrl+Enter para falar</span>
          <button type="button" onClick={exemplo} className="underline underline-offset-2 hover:text-foreground">Dá-me uma ideia</button>
        </div>

        <div className="inline-flex rounded-md border p-0.5 text-sm" role="group" aria-label="Modo do Bimby">
          {(['maluco', 'fiel'] as Modo[]).map(m => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 transition-colors ${modo === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            >
              {m === 'maluco' ? <Shuffle className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {m === 'maluco' ? 'Maluco' : 'Fiel'}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Button onClick={falar} disabled={!texto.trim()} className="flex-1 gap-2">
            <Megaphone className="h-4 w-4" />Fala, Bimby!
          </Button>
          <Button variant="outline" onClick={calar} disabled={!falando} aria-label="Calar o Bimby">
            <Square className="h-4 w-4" />
          </Button>
        </div>
        {!suportado && (
          <p className="text-xs text-amber-700">Este browser não tem síntese de voz: o Bimby só consegue falar por escrito.</p>
        )}
      </div>
    </div>
  );
}
