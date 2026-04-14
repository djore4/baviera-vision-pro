import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';

export default function EscalaPage() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('escala_pdf');
    if (stored) setPdfUrl(stored);
  }, []);

  // Listen for updates from DadosPage
  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem('escala_pdf');
      if (stored) setPdfUrl(stored);
    };
    window.addEventListener('escala_updated', handler);
    return () => window.removeEventListener('escala_updated', handler);
  }, []);

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {pdfUrl ? (
<object
  data={pdfUrl}
  type="application/pdf"
  className="flex-1 w-full rounded-lg border border-border"
>
  <p className="text-sm text-muted-foreground">O teu browser não suporta visualização de PDF.</p>
</object>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-center space-y-3">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Nenhuma escala carregada</p>
          <p className="text-xs text-muted-foreground">
            Aceda a <strong>Dados</strong> para carregar o PDF da escala mensal.
          </p>
        </div>
      )}
    </div>
  );
}
