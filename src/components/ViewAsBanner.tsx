import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePermissions } from '@/contexts/PermissionsContext';
import { locaisDoPerfil } from '@/lib/locations';

/* Faixa do modo "ver como". Aparece em todas as páginas enquanto o administrador
 * simula outro utilizador — mesmo que esse utilizador não tenha acesso ao tab
 * Utilizadores, é daqui que se volta atrás ou se muda de utilizador. */
export function ViewAsBanner() {
  const { viewingAs, allUsers, setViewAs, roleName } = usePermissions();
  const navigate = useNavigate();

  const outros = useMemo(
    () => allUsers
      .filter(u => !!u.email)
      .sort((a, b) => (a.nome || a.email || '').localeCompare(b.nome || b.email || '', 'pt', { sensitivity: 'base' })),
    [allUsers],
  );

  if (!viewingAs) return null;

  const locais = locaisDoPerfil(viewingAs.local);
  const sair = () => { setViewAs(null); navigate('/'); };
  const mudar = (email: string) => { setViewAs(email); navigate('/'); };

  return (
    <div role="status" className="shrink-0 border-b border-amber-500/40 bg-amber-100 px-3 py-2 text-amber-950 dark:bg-amber-500/15 dark:text-amber-100 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <Eye className="h-4 w-4" /> A ver como
        </span>
        <Select value={(viewingAs.email ?? '').toLowerCase()} onValueChange={mudar}>
          <SelectTrigger aria-label="Utilizador simulado" className="h-8 w-full max-w-[260px] border-amber-500/50 bg-background/70 text-foreground sm:w-[260px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {outros.map(u => (
              <SelectItem key={u.id} value={(u.email ?? '').toLowerCase()}>
                {u.nome || u.email}{u.perfil ? ` · ${u.perfil}` : ' · sem função'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs">
          {roleName ?? 'Sem função'}{locais.length > 0 && ` · ${locais.join(', ')}`}
        </span>
        <Button size="sm" variant="outline" onClick={sair} className="ml-auto h-8 gap-1.5 border-amber-500/50 bg-background/70 text-foreground">
          <X className="h-3.5 w-3.5" /> Sair do modo
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] leading-snug opacity-80">
        Simula o que este utilizador vê e pode editar (separadores, permissões, filtros iniciais). Os dados e as
        gravações continuam a ser os do administrador, e as exceções de acesso por email não se simulam.
      </p>
    </div>
  );
}
