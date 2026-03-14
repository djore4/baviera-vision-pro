import { useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';

export function ExcelUpload() {
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
    <div className="flex items-center gap-3">
      {data && (
        <span className="text-xs text-muted-foreground hidden lg:block">
          {data.control.length} registos · {data.lastUpdated}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Carregar Excel
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
