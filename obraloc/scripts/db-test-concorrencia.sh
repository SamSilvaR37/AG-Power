#!/usr/bin/env bash
# Testes de concorrência com conexões simultâneas de verdade.
# Chamado por db-test.sh (PSQL_CMD vem de lá). Altera o banco de teste: rode por último.
set -euo pipefail

read -r -a PSQL <<< "$PSQL_CMD"
SAIDA="$(mktemp -d "${TMPDIR:-/tmp}/obraloc-conc.XXXXXX")"
trap 'rm -rf "$SAIDA"' EXIT
N=12

q() { "${PSQL[@]}" -c "$1"; }
ok() { printf "  ok  %s\n" "$1"; }
falha() { printf "  FALHOU: %s\n" "$1"; exit 1; }

# ------------------------------------------------------------------ 1) última unidade
# 12 clientes, 12 orçamentos diferentes, a mesma cortadora (1 unidade), o mesmo período.
for i in $(seq 1 $N); do
  q "select public.salvar_orcamento_interno('00000000-0000-4000-a000-000000000301', null,
       '[{\"equipamento_id\":\"00000000-0000-4000-a000-000000000210\",\"quantidade\":1}]',
       test.dia(10, 8), test.dia(12, 8), 'retirada', null, 'conc-orc-$i', 'sistema')" >/dev/null
done

for i in $(seq 1 $N); do
  ( q "select public.criar_pre_reserva_interno((select id from public.orcamentos where chave_idempotencia = 'conc-orc-$i'), 'conc-pre-$i', 'bot')" \
      > "$SAIDA/pre-$i.out" 2>&1 || true ) &
done
wait

SUCESSOS=$(grep -l '"ok": true' "$SAIDA"/pre-*.out | wc -l)
RECUSAS=$(grep -l 'indisponivel' "$SAIDA"/pre-*.out | wc -l)
ATIVAS=$(q "select count(*) from public.alocacoes a join public.unidades u on u.id = a.unidade_id
            where u.codigo = 'CTP-001' and a.ativo and a.periodo && tstzrange(test.dia(10, 8), test.dia(12, 8))")
[ "$SUCESSOS" = "1" ] || falha "esperava 1 pré-reserva da última unidade, houve $SUCESSOS"
[ "$RECUSAS" = "$((N - 1))" ] || falha "esperava $((N - 1)) recusas 'indisponivel', houve $RECUSAS"
[ "$ATIVAS" = "1" ] || falha "esperava 1 alocação ativa da CTP-001, há $ATIVAS"
ok "$N pedidos simultâneos pela última unidade: 1 pré-reserva, $((N - 1)) recusados como indisponível"

# ------------------------------------------------------------------ 2) barreira final (EXCLUDE)
# Mesmo sem as travas da função, o banco impede duas alocações sobrepostas da mesma unidade.
UNID=$(q "select id from public.unidades where codigo = 'LAV-002'")
( q "begin;
     insert into public.alocacoes (unidade_id, tipo, periodo, motivo) values ('$UNID', 'manutencao', tstzrange(test.dia(20, 8), test.dia(22, 8)), 'A');
     select pg_sleep(1);
     commit;" > "$SAIDA/ex-a.out" 2>&1 || true ) &
sleep 0.3
( q "insert into public.alocacoes (unidade_id, tipo, periodo, motivo) values ('$UNID', 'manutencao', tstzrange(test.dia(21, 8), test.dia(23, 8)), 'B')" \
    > "$SAIDA/ex-b.out" 2>&1 || true ) &
wait
grep -q 'alocacoes_sem_sobreposicao' "$SAIDA/ex-b.out" || falha "segunda alocação sobreposta deveria violar a restrição: $(cat "$SAIDA/ex-b.out")"
ok "restrição EXCLUDE barra alocação sobreposta feita em paralelo"

# ------------------------------------------------------------------ 3) webhook duplicado em paralelo
for i in $(seq 1 $N); do
  ( q "select public.registrar_mensagem_recebida(test.evento('conc-ev', 'conc-msg', '5511977779999', 'Oi'))" \
      > "$SAIDA/wh-$i.out" 2>&1 || true ) &
done
wait
NOVOS=$(grep -l '"duplicado": false' "$SAIDA"/wh-*.out | wc -l)
MSGS=$(q "select count(*) from public.mensagens where id_externo = 'conc-msg'")
CONVS=$(q "select count(*) from public.conversas where telefone = '5511977779999'")
[ "$NOVOS" = "1" ] && [ "$MSGS" = "1" ] && [ "$CONVS" = "1" ] || falha "webhook paralelo: novos=$NOVOS mensagens=$MSGS conversas=$CONVS"
ok "$N entregas simultâneas do mesmo webhook: 1 mensagem, 1 conversa"

# ------------------------------------------------------------------ 4) reenvio simultâneo do bot
CONV=$(q "select id from public.conversas where telefone = '5511977779999'")
for i in $(seq 1 $N); do
  ( "${PSQL[@]}" -c "set role obraloc_bot; select public.bot_salvar_orcamento('$CONV', 0,
       '[{\"equipamento_id\":\"00000000-0000-4000-a000-000000000209\",\"quantidade\":1}]',
       test.dia(8, 8), test.dia(9, 8), 'retirada', null, 'conc-bot-orc')" > "$SAIDA/bo-$i.out" 2>&1 || true ) &
done
wait
ORCS=$(q "select count(*) from public.orcamentos where chave_idempotencia = 'conc-bot-orc'")
CLIS=$(q "select count(*) from public.cliente_contatos where telefone = '5511977779999'")
[ "$ORCS" = "1" ] && [ "$CLIS" = "1" ] || falha "orçamento do bot em paralelo: orçamentos=$ORCS contatos=$CLIS"
ok "$N gravações simultâneas do mesmo orçamento pelo bot: 1 orçamento, 1 cliente"

ORC=$(q "select id from public.orcamentos where chave_idempotencia = 'conc-bot-orc'")
for i in $(seq 1 $N); do
  ( "${PSQL[@]}" -c "set role obraloc_bot; select public.bot_criar_pre_reserva('$CONV', 0, '$ORC', 'conc-bot-pre-$i')" \
      > "$SAIDA/bp-$i.out" 2>&1 || true ) &
done
wait
LOCS=$(q "select count(*) from public.locacoes where orcamento_id = '$ORC'")
ALOCS=$(q "select count(*) from public.alocacoes a join public.locacoes l on l.id = a.locacao_id where l.orcamento_id = '$ORC' and a.ativo")
[ "$LOCS" = "1" ] && [ "$ALOCS" = "1" ] || falha "aceite em paralelo: locações=$LOCS alocações=$ALOCS"
ok "$N aceites simultâneos do mesmo orçamento (chaves diferentes): 1 pré-reserva, 1 unidade"
