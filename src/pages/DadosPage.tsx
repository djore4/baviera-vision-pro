import { useRef, useState } from 'react';
import { Upload, Download, Loader2, FileSpreadsheet, Database, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { QualityManager } from '@/components/QualityManager';
import { FaturasControl } from '@/components/FaturasControl';
import { loadControlVuFromDb } from '@/lib/control-records-vu';
import { exportControlVuExcel } from '@/lib/control-export';
import { parseVuAngariacao, replaceAngariacoesVu } from '@/lib/angariacao-vu';
import { parseEotFile, importEotContracts } from '@/lib/eot';

export default function DadosPage() {
  const { loading } = useData();

  // Importação do Excel de angariações VU -> tabela angariacoes_vu (sheet ANGARIAÇÃO).
  // Os negócios VU (control_records_vu) já não vêm do Excel: gerem-se na WIP e no Funil VU.
  const inputRefVu = useRef<HTMLInputElement>(null);
  const [pendingFileVu, setPendingFileVu] = useState<File | null>(null);
  const [importingVu, setImportingVu] = useState(false);
  const [importErrorVu, setImportErrorVu] = useState<string | null>(null);
  const [importCountAng, setImportCountAng] = useState<number | null>(null);
  const [exportingVu, setExportingVu] = useState(false);
  const [exportErrorVu, setExportErrorVu] = useState<string | null>(null);

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
    setImportCountAng(null);
    setPendingFileVu(file);
  };

  const confirmImportVu = async () => {
    if (!pendingFileVu) return;
    const file = pendingFileVu;
    setPendingFileVu(null);
    setImportingVu(true);
    setImportErrorVu(null);
    setImportCountAng(null);
    try {
      const angariacoes = parseVuAngariacao(await file.arrayBuffer());
      if (!angariacoes) throw new Error('O ficheiro não tem a sheet ANGARIAÇÃO — importação cancelada.');
      setImportCountAng(await replaceAngariacoesVu(angariacoes));
    } catch (err) {
      setImportErrorVu(err instanceof Error ? err.message : 'Erro ao importar angariações VU');
    } finally {
      setImportingVu(false);
    }
  };

  const exportVu = async () => {
    setExportingVu(true);
    setExportErrorVu(null);
    try {
      const recs = await loadControlVuFromDb();
      if (recs.length === 0) throw new Error('Ainda não há negócios VU para descarregar.');
      exportControlVuExcel(recs);
    } catch (err) {
      setExportErrorVu(err instanceof Error ? err.message : 'Erro ao descarregar o Excel VU');
    } finally {
      setExportingVu(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-8 animate-fade-in">
      <div className="text-center space-y-2">
        <FileSpreadsheet className="h-12 w-12 mx-auto text-primary" />
        <h1 className="text-xl font-bold text-foreground">Gestão de Dados</h1>
        <p className="text-sm text-muted-foreground">Carregue e mantenha os dados que alimentam o dashboard.</p>
      </div>

      {/* Controlo de faturas (VN), angariações VU e mapa de terminações (End-of-Term) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <FaturasControl />

        {/* Gestão de Dados VU */}
        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Gestão de Dados VU</h2>
          <p className="text-xs text-muted-foreground">
            Os <strong>negócios VU</strong> já não vêm do Excel: criam-se, alteram-se e eliminam-se diretamente na <strong>WIP</strong> e
            no <strong>Funil</strong> da secção VU. Aqui carrega-se apenas a sheet <strong>ANGARIAÇÃO</strong> do ficheiro de Viaturas Usadas,
            gravando por cima das angariações atuais — alimenta o tab <strong>Angariação</strong>.
          </p>
          <Button size="lg" className="w-full gap-2" onClick={() => inputRefVu.current?.click()} disabled={loading || importingVu}>
            {importingVu ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            {importingVu ? 'A importar...' : 'Carregar angariações VU'}
          </Button>
          <input ref={inputRefVu} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChangeVu} />
          <Button variant="outline" size="lg" className="w-full gap-2" onClick={exportVu} disabled={loading || exportingVu}>
            {exportingVu ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            Descarregar Excel VU
          </Button>
          <p className="text-[11px] text-muted-foreground">Cópia dos negócios VU atuais, só para consulta.</p>

          {(importErrorVu || exportErrorVu) && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-xs text-destructive">{importErrorVu ?? exportErrorVu}</p>
            </div>
          )}
          {importCountAng !== null && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <Database className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{importCountAng} angariações importadas</p>
                <p className="text-xs text-muted-foreground">Já podes consultar o tab Angariação da secção VU.</p>
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

      {/* Confirmação da importação VU */}
      {pendingFileVu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Importar angariações VU?</p>
                <p className="text-xs text-muted-foreground">
                  Vais importar de <span className="font-medium">{pendingFileVu.name}</span> a sheet <strong>ANGARIAÇÃO</strong>, que
                  <strong> grava por cima</strong> das angariações atuais. Não afeta os negócios VU (WIP e Funil) nem os dados VN. Esta ação não pode ser anulada.
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
