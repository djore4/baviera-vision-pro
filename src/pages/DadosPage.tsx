import { useRef } from 'react';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';

export default function DadosPage() {
  const { uploadFile, loading, data } = useData();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-lg mx-auto py-12 space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <FileSpreadsheet className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-xl font-bold text-foreground">Gestão de Dados</h1>
        <p className="text-sm text-muted-foreground">Carregue o ficheiro Excel com os dados de negócio.</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <Button
          size="lg"
          className="w-full gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {loading ? 'A carregar...' : 'Carregar Excel'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleChange}
        />

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
    </div>
  );
}
