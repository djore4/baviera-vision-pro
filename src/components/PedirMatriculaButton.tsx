import { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Check } from 'lucide-react';
import { buildMatriculaRequest, type MatriculaFields } from '@/lib/matricula';

interface Props {
  record: MatriculaFields;
  /** Estilo compacto (só ícone) para caber numa célula de tabela. */
  compact?: boolean;
  className?: string;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai no fallback abaixo */
  }
  // Fallback para contextos sem clipboard API.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function PedirMatriculaButton({ record, compact, className }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    // Evita disparar o onClick da linha (ex: abrir editor) na Database page.
    e.stopPropagation();
    const text = buildMatriculaRequest(record);
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      toast('Pedido de matrícula copiado', {
        description: 'Cola o texto no email / mensagem.',
      });
      setTimeout(() => setCopied(false), 1500);
    } else {
      toast('Não foi possível copiar', { description: 'Copia o texto manualmente.' });
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title="Copiar pedido de matrícula"
      className={`inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px] font-medium whitespace-nowrap transition-colors hover:border-amber-400 hover:text-amber-500 ${
        copied ? 'text-green-600 border-green-500/50' : 'text-muted-foreground'
      } ${className ?? ''}`}
    >
      {copied ? <Check className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
      {!compact && (copied ? 'Copiado' : 'Pedir Matrícula')}
    </button>
  );
}
