#!/usr/bin/env bash
# Testa as migrações RLS num Postgres temporário (sem Supabase, sem rede).
#   supabase/tests/run.sh
# Aplica stubs -> migrations/*.sql -> seeds/new_client_defaults.sql -> rls.test.sql.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$PGBIN" ] || PGBIN="$(dirname "$(command -v postgres)")"

RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="su postgres -c"; fi
run() { if [ -n "$RUN_AS" ]; then $RUN_AS "$*"; else bash -c "$*"; fi; }

DIR="$(mktemp -d)"
[ -z "$RUN_AS" ] || chown postgres "$DIR"
SOCK="$DIR"
PORT=54329
cleanup() { run "$PGBIN/pg_ctl -D $DIR/data stop -m immediate >/dev/null 2>&1" || true; rm -rf "$DIR"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
run "$PGBIN/pg_ctl -D $DIR/data -o \"-p $PORT -k $SOCK -c listen_addresses=''\" -l $DIR/log -w start >/dev/null"
psqlq() { run "$PGBIN/psql -h $SOCK -p $PORT -U postgres -v ON_ERROR_STOP=1 -q $*"; }

psqlq "-d postgres -c 'create database t'"
psqlq "-d t -f $HERE/stubs.sql"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  echo "→ $(basename "$f")"
  psqlq "-d t -f $f"
done
psqlq "-d t -f $ROOT/supabase/seeds/new_client_defaults.sql"
psqlq "-d t -o /dev/null -f $HERE/rls.test.sql"
psqlq "-d t -o /dev/null -f $HERE/import.test.sql"
psqlq "-d t -o /dev/null -v ROOT=$ROOT -f $HERE/lavagem.test.sql"
psqlq "-d t -o /dev/null -v ROOT=$ROOT -f $HERE/eot.test.sql"
