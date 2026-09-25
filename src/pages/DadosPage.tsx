import { useRef, useState } from 'react';
import { Upload, Loader2, FileSpreadsheet, CheckCircle2, Database, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { QualityManager } from '@/components/QualityManager';
import { parseVuControl, replaceControlRecordsVu } from '@/lib/control-records-vu';
import { parseEotFile, importEotContracts } from '@/lib/eot';

export default function DadosPage() {
  const { uploadFile, loading, data } = useData();
  const inputRef = useRef<HTMLInputElement>(null);

  // Importação do Excel -> tabela control_records (tab "database")
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importCount, setImportCount] = useState<number | null>(null);

  // Importação do Excel VU -> tabela control_records_vu (sheet CONTROL)
  const inputRefVu = useRef<HTMLInputElement>(null);
  const [pendingFileVu, setPendingFileVu] = useState<File | null>(null);
  const [importingVu, setImportingVu] = useState(false);
  const [importErrorVu, setImportErrorVu] = useState<string | null>(null);
  const [importCountVu, setImportCountVu] = useState<number | null>(null);

  // Importação do mapa de terminações -> tabela eot_contracts (tab End-of-Term)
  const inputRefEot = useRef<HTMLInputElement>(null);
  const [pendingFileEot, setPendingFileEot] = useState<File | null>(null);
  const [importingEot, setImportingEot] = useState(false);
  const [importErrorEot, setImportErrorEot] = useState<string | null>(null);
  const [importCountEot, setImportCountEot] = useState<number | null>(null);

  const handleChangeEot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRefEot.current) inputRefEot.current.value = '';
    if (!file) return;
    setImportErrorEot(null);
    setImportCountEot(null);
    setPendingFileEot(file);
  };

  const confirmImportEot = async () => {
    if (!pendingFileEot) return;
    const file = pendingFileEot;
    setPendingFileEot(null);
    setImportingEot(true);
    setImportErrorEot(null);
    setImportCountEot(null);
    try {
      const rows = parseEotFile(await file.arrayBuffer());
      const n = await importEotContracts(rows);
      setImportCountEot(n);
    } catch (err) {
      setImportErrorEot(err instanceof Error ? err.message : 'Erro ao importar terminações');
    } finally {
      setImportingEot(false);
    }
  };

  const handleChangeVu = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRefVu.current) inputRefVu.current.value = '';
    if (!file) return;
    setImportErrorVu(null);
    setImportCountVu(null);
    setPendingFileVu(file);
  };

  const confirmImportVu = async () => {
    if (!pendingFileVu) return;
    const file = pendingFileVu;
    setPendingFileVu(null);
    setImportingVu(true);
    setImportErrorVu(null);
    setImportCountVu(null);
    try {
      const records = parseVuControl(await file.arrayBuffer());
      const n = await replaceControlRecordsVu(records);
      setImportCountVu(n);
    } catch (err) {
      setImportErrorVu(err instanceof Error ? err.message : 'Erro ao importar dados VU');
    } finally {
      setImportingVu(false);
    }
  };

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

      {/* Upload de dados — VN, VU e mapa de terminações (End-of-Term) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Gestão de Dados VN */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Gestão de Dados VN</h2>
          <p className="text-xs text-muted-foreground">
            Os dados vivem no Supabase: o tab <strong>database</strong> (registos) e o tab <strong>Objetivos</strong> (metas).
            O upload de Excel é apenas um <strong>recurso</strong> — importa a sheet <strong>CONTROL</strong> e os <strong>objetivos</strong>,
            gravando por cima dos dados atuais.
          </p>
          <Button size="lg" className="w-full gap-2" onClick={() => inputRef.current?.click()} disabled={loading || importing}>
            {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {importing ? 'A importar...' : 'Carregar Excel VN'}
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

        {/* Gestão de Dados VU */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Gestão de Dados VU</h2>
          <p className="text-xs text-muted-foreground">
            Carrega o ficheiro de <strong>Viaturas Usadas</strong>. Importa a sheet <strong>CONTROL</strong>,
            gravando por cima dos dados VU atuais. Alimenta o <strong>WIP</strong> (FATURA/CARTEIRA), o <strong>Funil</strong> (FRIO/MORNO/QUENTE) e a <strong>Angariação</strong> (ANGARIAÇÃO) da secção VU.
          </p>
          <Button size="lg" className="w-full gap-2" onClick={() => inputRefVu.current?.click()} disabled={loading || importingVu}>
            {importingVu ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {importingVu ? 'A importar...' : 'Carregar Excel VU'}
          </Button>
          <input ref={inputRefVu} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChangeVu} />

          {importErrorVu && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-xs text-destructive">{importErrorVu}</p>
            </div>
          )}
          {importCountVu !== null && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Database className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{importCountVu} registos VU importados</p>
                <p className="text-xs text-muted-foreground">Já podes consultar o WIP, o Funil e a Angariação da secção VU.</p>
              </div>
            </div>
          )}
        </div>

        {/* Mapa de Terminações (End-of-Term) */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Terminações (End-of-Term)</h2>
          <p className="text-xs text-muted-foreground">
            Carrega o <strong>Mapa de Contratos a Terminar</strong> (BMW FS). Importa a sheet <strong>EOT</strong> por
            número de contrato, <strong>sem apagar</strong> o acompanhamento já feito. Alimenta o tab <strong>End-of-Term</strong>.
          </p>
          <Button size="lg" className="w-full gap-2" onClick={() => inputRefEot.current?.click()} disabled={loading || importingEot}>
            {importingEot ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {importingEot ? 'A importar...' : 'Carregar Mapa EoT'}
          </Button>
          <input ref={inputRefEot} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChangeEot} />

          {importErrorEot && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-xs text-destructive">{importErrorEot}</p>
            </div>
          )}
          {importCountEot !== null && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Database className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{importCountEot} contratos importados/atualizados</p>
                <p className="text-xs text-muted-foreground">Já podes fazer o controlo no tab End-of-Term.</p>
              </div>
            </div>
          )}
        </div>
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

      {/* Confirmação da importação VU */}
      {pendingFileVu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Importar dados VU?</p>
                <p className="text-xs text-muted-foreground">
                  Vais importar de <span className="font-medium">{pendingFileVu.name}</span> a sheet <strong>CONTROL</strong>, que
                  <strong> grava por cima</strong> dos dados VU atuais. Não afeta os dados VN. Esta ação não pode ser anulada.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingFileVu(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={confirmImportVu} className="px-4 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors">Importar e substituir</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação da importação do mapa de terminações (EoT) */}
      {pendingFileEot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Importar mapa de terminações?</p>
                <p className="text-xs text-muted-foreground">
                  Vais importar de <span className="font-medium">{pendingFileEot.name}</span> a sheet <strong>EOT</strong>.
                  Os contratos são <strong>atualizados por número de contrato</strong> — os novos são adicionados e os
                  existentes são atualizados, <strong>sem perder</strong> o acompanhamento (fases, chamadas, propostas e agendamentos).
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingFileEot(null)} className="px-4 py-1.5 text-xs border border-border rounded hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={confirmImportEot} className="px-4 py-1.5 text-xs bg-amber-500 text-black font-semibold rounded hover:bg-amber-400 transition-colors">Importar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
