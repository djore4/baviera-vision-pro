import { useRef, useState } from 'react';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, Database, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { QualityManager } from '@/components/QualityManager';

export default function DadosPage() {
  const { uploadFile, loading, data } = useData();
  const inputRef = useRef<HTMLInputElement>(null);

  // Importação do Excel -> tabela control_records (tab "database")
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCount, setImportCount] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    // Pede confirmação antes de substituir os registos da base de dados.
    setImportError(null);
    setImportCount(null);
    setPendingFile(file);
  };

  const confirmImport = async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    setImporting(true);
    setImportError(null);
    setImportCount(null);
    try {
      // Importa control + objetivos do Excel para o Supabase ("gravar por cima").
      const n = await uploadFile(file);
      setImportCount(n);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erro ao importar dados');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-8 animate-fade-in">
      <div className="text-center space-y-2">
        <FileSpreadsheet className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-xl font-bold text-foreground">Gestão de Dados</h1>
        <p className="text-sm text-muted-foreground">Carregue e mantenha os dados que alimentam o dashboard.</p>
      </div>

      {/* Excel */}
      <div className="max-w-lg mx-auto bg-card border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Dados de Negócio</h2>
        <p className="text-xs text-muted-foreground">
          Os dados vivem no Supabase: o tab <strong>database</strong> (registos) e o tab <strong>Objetivos</strong> (metas).
          O upload de Excel é apenas um <strong>recurso</strong> — importa a sheet <strong>CONTROL</strong> e os <strong>objetivos</strong>,
          gravando por cima dos dados atuais.
        </p>
        <Button size="lg" className="w-full gap-2" onClick={() => inputRef.current?.click()} disabled={loading || importing}>
          {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {importing ? 'A importar...' : 'Carregar Excel'}
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />

        {importError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-xs text-destructive">{importError}</p>
          </div>
        )}
        {importCount !== null && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <Database className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{importCount} registos importados para o tab database</p>
              <p className="text-xs text-muted-foreground">Podes agora consultar e editar em database.</p>
            </div>
          </div>
        )}
        {data && importCount === null && (
          <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">{data.control.length} registos carregados</p>
              <p className="text-xs text-muted-foreground">Última atualização: {data.lastUpdated}</p>
            </div>
          </div>
        )}
      </div>

      {/* Qualidade do Serviço — entrada de dados (migrado do antigo tab Qualidade). */}
      <div className="border-t border-border pt-6">
        <QualityManager />
      </div>

      {/* Confirmação da importação (substitui os registos da base de dados) */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Importar para o tab database?</p>
                <p className="text-xs text-muted-foreground">
                  Vais importar de <span className="font-medium">{pendingFile.name}</span> a sheet <strong>CONTROL</strong> (registos)
                  e os <strong>objetivos</strong>. Isto <strong>grava por cima</strong> dos dados atuais no tab database e no tab Objetivos.
                  Esta ação não pode ser anulada.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingFile(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={confirmImport} className="px-4 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors">Importar e substituir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
