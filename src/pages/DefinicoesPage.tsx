import { useState } from 'react';
import { Settings, KeyRound, Sun, Moon, Monitor, Loader2, CheckCircle2, LogOut, User, Eye, EyeOff } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/App';
import { usePermissions } from '@/contexts/PermissionsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/* ── Tab Definições ────────────────────────────────────────────────────────────
 * Área pessoal, acessível a qualquer utilizador autenticado (fora da matriz de
 * permissões). Permite alterar a própria palavra-passe, escolher o tema
 * (claro/escuro/sistema) e ver os dados da conta.
 * ──────────────────────────────────────────────────────────────────────────── */

const MIN_PASSWORD = 8;

/* Opções de tema (next-themes controla a classe `dark` no <html>). */
const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

export default function DefinicoesPage() {
  const { session } = useAuth();
  const { roleName, isAdmin } = usePermissions();
  const { theme, setTheme } = useTheme();

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < MIN_PASSWORD) {
      toast.error(`A palavra-passe deve ter pelo menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    if (pw !== pw2) {
      toast.error('As palavras-passe não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success('Palavra-passe alterada com sucesso.');
      setPw('');
      setPw2('');
    } catch (err) {
      toast.error('Não foi possível alterar a palavra-passe.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold tracking-tight">Definições</h1>
        <span className="text-xs text-muted-foreground">· Conta e preferências</span>
      </div>

      {/* ── Conta ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" /> Conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium truncate">{session?.user.email ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Perfil</span>
            <span className="font-medium">{isAdmin ? 'Administrador' : (roleName ?? '—')}</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Palavra-passe ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Alterar palavra-passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Nova palavra-passe</Label>
              <div className="relative">
                <Input
                  id="pw"
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                  title={showPw ? 'Ocultar' : 'Mostrar'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw2">Confirmar palavra-passe</Label>
              <Input
                id="pw2"
                type={showPw ? 'text' : 'password'}
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Mínimo {MIN_PASSWORD} caracteres. Após alterar, use a nova palavra-passe no próximo início de sessão.
            </p>
            <Button type="submit" disabled={saving || !pw || !pw2}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Guardar palavra-passe
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Aparência ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sun className="h-4 w-4" /> Aparência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-muted-foreground">Tema da página</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {THEME_OPTIONS.map(opt => {
              const active = (theme ?? 'system') === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={`flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <opt.icon className="h-5 w-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            "Sistema" segue o modo diurno/nocturno do dispositivo.
          </p>
        </CardContent>
      </Card>

      {/* ── Sessão ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Sessão
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" /> Terminar sessão
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
