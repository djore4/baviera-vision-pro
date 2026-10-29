import { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Validacao } from '@/lib/importacoes';

/* Confirmação de uma importação que substitui dados: mostra quantos registos há agora
 * e quantos traz o ficheiro, os avisos da validação e, se a base de dados achar o
 * ficheiro suspeito (ex.: menos de metade dos registos), só deixa avançar depois de
 * "importar mesmo assim". Quem monta o diálogo põe `key` com o ficheiro, para o
 * "mesmo assim" voltar a desligado a cada ficheiro. */

export interface ImportacaoPendente {
  file: File;
  linhas: number;
  /** null: a base de dados ainda não valida (migração por aplicar). */
  validacao: Validacao | null;
}

interface Props {
  pendente: ImportacaoPendente;
  titulo: string;
  /** O que vai ser importado e o que acontece aos dados atuais. */
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: (force: boolean) => void;
}

export function ImportConfirm({ pendente, titulo, children, onCancel, onConfirm }: Props) {
  const [mesmoAssim, setMesmoAssim] = useState(false);
  const v = pendente.validacao;
  const bloqueado = !!v && v.bloqueios.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label={titulo}>
      <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{titulo}</p>
            <p className="text-xs text-muted-foreground">{children}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs flex items-center justify-between" data-testid="import-contagem">
          <span className="text-muted-foreground">{pendente.file.name}</span>
          <span className="font-medium tabular-nums">
            {v ? `${v.anteriores} → ${pendente.linhas} registos` : `${pendente.linhas} registos`}
          </span>
        </div>

        {v?.avisos.map(a => (
          <p key={a} className="text-xs text-amber-700 dark:text-amber-300 flex gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{a}
          </p>
        ))}

        {bloqueado && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            {v!.bloqueios.map(b => (
              <p key={b} className="text-xs text-destructive flex gap-2">
                <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{b}
              </p>
            ))}
            <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={mesmoAssim} onChange={e => setMesmoAssim(e.target.checked)} />
              Sei o que estou a fazer: importar mesmo assim (fica guardada uma cópia dos dados atuais para voltar atrás).
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
          <button
            onClick={() => onConfirm(bloqueado && mesmoAssim)}
            disabled={bloqueado && !mesmoAssim}
            className="px-4 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Importar e substituir
          </button>
        </div>
      </div>
    </div>
  );
}
