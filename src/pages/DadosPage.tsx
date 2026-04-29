import { useRef, useState } from 'react';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { supabase } from '@/integrations/supabase/client';

const ESCALA_BUCKET = 'excel-files';
const ESCALA_PATH = 'escala.pdf';

export default function DadosPage() {
  const { uploadFile, loading, data } = useData();
  const inputRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfName, setPdfName] = useState<string | null>(() => localStorage.getItem('escala_pdf_name'));
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handlePdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const { error } = await supabase.storage
        .from(ESCALA_BUCKET)
        .upload(ESCALA_PATH, file, { upsert: true, contentType: 'application/pdf' });

      if (error) throw new Error(error.message);

      localStorage.setItem('escala_pdf_name', file.name);
      setPdfName(file.name);
      // Remove cached base64 so EscalaPage fetches fresh from Supabase
      localStorage.removeItem('escala_pdf');
      window.dispatchEvent(new Event('escala_updated'));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Erro ao carregar PDF');
    } finally {
      setPdfLoading(false);
      if (pdfRef.current) pdfRef.current.value = '';
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <FileSpreadsheet className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-xl font-bold text-foreground">Gestão de Dados</h1>
        <p className="text-sm text-muted-foreground">Carregue os ficheiros necessários para o dashboard.</p>
      </div>

      {/* Excel */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dados de Negócio</h2>
        <Button size="lg" className="w-full gap-2" onClick={() => inputRef.current?.click()} disabled={loading}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {loading ? 'A carregar...' : 'Carregar Excel'}
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
        {data && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{data.control.length} registos carregados</p>
              <p className="text-xs text-muted-foreground">Última atualização: {data.lastUpdated}</p>
            </div>
          </div>
        )}
      </div>

      {/* PDF Escala */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Escala de Serviço</h2>
        <Button size="lg" variant="outline" className="w-full gap-2" onClick={() => pdfRef.current?.click()} disabled={pdfLoading}>
          {pdfLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
          {pdfLoading ? 'A carregar...' : 'Carregar PDF da Escala'}
        </Button>
        <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfChange} />
        {pdfError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">{pdfError}</p>
          </div>
        )}
        {pdfName && !pdfError && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{pdfName}</p>
              <p className="text-xs text-muted-foreground">Disponível em Escala (todos os dispositivos)</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
