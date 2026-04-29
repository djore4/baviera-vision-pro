import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const ESCALA_BUCKET = 'excel-files';
const ESCALA_PATH = 'escala.pdf';

export default function EscalaPage() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPdf = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from(ESCALA_BUCKET)
        .createSignedUrl(ESCALA_PATH, 3600);
      if (error || !data?.signedUrl) {
        setPdfUrl(null);
      } else {
        setPdfUrl(data.signedUrl);
      }
    } catch {
      setPdfUrl(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPdf(); }, []);

  useEffect(() => {
    const handler = () => loadPdf();
    window.addEventListener('escala_updated', handler);
    return () => window.removeEventListener('escala_updated', handler);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">A carregar escala...</p>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-3">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Nenhuma escala carregada</p>
        <p className="text-xs text-muted-foreground">Aceda a <strong>Dados</strong> para carregar o PDF da escala mensal.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <object
        data={pdfUrl}
        type="application/pdf"
        className="flex-1 w-full rounded-lg border border-border hidden md:block"
      >
        <p className="text-sm text-muted-foreground p-4">O teu browser não suporta visualização de PDF.</p>
      </object>
      <div className="flex flex-col items-center justify-center flex-1 gap-4 md:hidden">
        <FileText className="h-12 w-12 text-primary" />
        <p className="text-sm text-muted-foreground">Visualização não disponível em mobile.</p>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
          className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg">
          Abrir PDF
        </a>
      </div>
    </div>
  );
}
