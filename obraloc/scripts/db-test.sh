#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, aplica as migrações + dados fictícios e roda os testes.
# Não usa nenhum projeto Supabase real: o arquivo tests/00_supabase_shim.sql imita
# o mínimo do Supabase (papéis e auth.uid()).
#
# Uso: scripts/db-test.sh            (roda tudo)
#      KEEP=1 scripts/db-test.sh     (mantém o banco no ar ao final, para inspeção)
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
SUPA="$RAIZ/supabase"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORTA="${PORTA:-54329}"
DADOS="$(mktemp -d "${TMPDIR:-/tmp}/obraloc-pg.XXXXXX")"
chmod 755 "$DADOS"

# initdb/postgres não rodam como root
COMO=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$DADOS"
  COMO=(runuser -u postgres --)
fi

pg() { "${COMO[@]}" "$@"; }

parar() {
  if [ "${KEEP:-0}" != "1" ]; then
    pg "$PGBIN/pg_ctl" -D "$DADOS/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "$DADOS"
  else
    echo "Banco mantido: psql -h $DADOS -p $PORTA -U postgres obraloc"
  fi
}
trap parar EXIT

pg "$PGBIN/initdb" -D "$DADOS/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
pg "$PGBIN/pg_ctl" -D "$DADOS/data" -o "-k $DADOS -p $PORTA -c listen_addresses='' -c timezone=UTC" -l "$DADOS/log" -w start >/dev/null

PSQL=(psql -X -q -t -A -v ON_ERROR_STOP=1 -h "$DADOS" -p "$PORTA" -U postgres)
"${PSQL[@]}" -d postgres -c "create database obraloc" >/dev/null

rodar() {
  local arq="$1"
  if ! out="$("${PSQL[@]}" -d obraloc -f "$arq" 2>&1)"; then
    echo "$out"
    echo "ERRO em $(basename "$arq")"
    exit 1
  fi
  if [ -n "${VERBOSE:-}" ]; then echo "$out"; fi
  local n; n="$(echo "$out" | grep -c "NOTICE:  ok " || true)"
  if [ "$n" -gt 0 ]; then printf "  %-40s %3s verificações ok\n" "$(basename "$arq")" "$n"; else printf "  %s\n" "$(basename "$arq")"; fi
}

echo "== migrações"
rodar "$SUPA/tests/00_supabase_shim.sql"
for f in "$SUPA"/migrations/*.sql; do rodar "$f"; done
echo "== dados fictícios"
rodar "$SUPA/seed.sql"
rodar "$SUPA/tests/01_fixtures.sql"

echo "== testes"
for f in "$SUPA"/tests/[1-9]*.sql; do rodar "$f"; done

if [ -x "$RAIZ/scripts/db-test-concorrencia.sh" ]; then
  echo "== concorrência"
  PSQL_CMD="${PSQL[*]} -d obraloc" "$RAIZ/scripts/db-test-concorrencia.sh"
fi

echo "== tudo certo"
