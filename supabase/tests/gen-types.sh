#!/usr/bin/env bash
# Regenera src/integrations/supabase/types.ts a partir do esquema do repositório
# (todas as migrações aplicadas num Postgres temporário), não da produção — assim
# os tipos incluem as migrações por aplicar e não incluem as tabelas de outras
# aplicações que partilham o projeto.
#   supabase/tests/gen-types.sh
# Precisa de Postgres local (como run.sh) e de `npx` (instala a CLI do Supabase e
# o prettier numa pasta temporária).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/src/integrations/supabase/types.ts"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] || PGBIN="$(dirname "$(command -v postgres)")"

RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="su postgres -c"; fi
run() { if [ -n "$RUN_AS" ]; then $RUN_AS "$*"; else bash -c "$*"; fi; }

DIR="$(mktemp -d)"
[ -z "$RUN_AS" ] || chown postgres "$DIR"
PORT=54331
cleanup() { run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$PGBIN/pg_ctl -D $DIR/data -o \"-p $PORT -k $DIR -c listen_addresses=127.0.0.1\" -l $DIR/log -w start >/dev/null"
psqlq() { run "$PGBIN/psql -h $DIR -p $PORT -U postgres -q -v ON_ERROR_STOP=1 $*"; }

psqlq "-d postgres -c 'create database t'"
psqlq "-d t -f $HERE/stubs.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do psqlq "-d t -f $f" 2>/dev/null; done

TOOLS="$DIR/tools"; mkdir -p "$TOOLS"
(cd "$TOOLS" && npm install --no-audit --no-fund --silent supabase prettier@3 >/dev/null)
GEN="$DIR/types.gen.ts"
(cd "$TOOLS" && ./node_modules/.bin/supabase gen types typescript \
  --db-url "postgresql://postgres@127.0.0.1:$PORT/t?sslmode=disable" --schema public > "$GEN")
grep -q "export type Database" "$GEN" || { echo "Falha a gerar tipos:"; head -c 400 "$GEN"; exit 1; }

# Cabeçalho que o cliente espera (versão do PostgREST) e formatação do projeto.
python3 - "$GEN" <<'PY'
import sys
p = sys.argv[1]
g = open(p).read()
g = g.replace("export type Database = {\n  \n",
  "export type Database = {\n  // Allows to automatically instantiate createClient with right options\n"
  "  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)\n"
  "  __InternalSupabase: {\n    PostgrestVersion: \"14.4\"\n  }\n", 1)
open(p, "w").write(g)
PY
"$TOOLS/node_modules/.bin/prettier" --parser typescript --no-semi --trailing-comma none --print-width 100 "$GEN" > "$OUT"
echo "Escrito $OUT ($(wc -l < "$OUT") linhas)"
