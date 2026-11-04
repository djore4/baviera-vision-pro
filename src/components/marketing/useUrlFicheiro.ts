import { useEffect, useState } from 'react';
import { urlFicheiro } from '@/lib/marketing-data';

/** URL assinado de um ficheiro do bucket (null enquanto carrega ou se falhar). */
export function useUrlFicheiro(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let vivo = true;
    urlFicheiro(path).then(u => { if (vivo) setUrl(u); }).catch(() => { if (vivo) setUrl(null); });
    return () => { vivo = false; };
  }, [path]);
  return url;
}
