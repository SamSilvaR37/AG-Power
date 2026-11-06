-- Consultas agregadas usadas pelo app.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('painel', public.painel_resumo());
insert into t values ('disp', public.disponibilidade_periodo(test.dia(1, 9), test.dia(2, 17)));
select test.ok(test.erro_de($q$select public.disponibilidade_periodo(test.dia(2, 8), test.dia(1, 8))$q$) = 'periodo_invalido', 'período invertido é rejeitado');
select test.ok((select count(*) from public.ocupacao_equipamento('00000000-0000-4000-a000-000000000205', now() - interval '7 days', now() + interval '7 days')) = 2,
  'ocupação do compactador mostra a locação atrasada e a reserva seguinte');
select test.ok((select bool_or(atrasada) from public.ocupacao_equipamento('00000000-0000-4000-a000-000000000205', now() - interval '7 days', now() + interval '7 days')),
  'locação atrasada aparece marcada na ocupação');
reset role;

select test.ok((select (valor->>'locacoes_ativas')::int from t where chave = 'painel') = 2, 'painel: 2 locações em andamento');
select test.ok((select jsonb_array_length(valor->'atrasadas') from t where chave = 'painel') = 1, 'painel: 1 atrasada');
select test.ok((select valor->'atrasadas'->0->>'numero' from t where chave = 'painel') = '502', 'painel: a atrasada é a 502');
select test.ok((select jsonb_array_length(valor->'pre_reservas') from t where chave = 'painel') = 1, 'painel: 1 pré-reserva aguardando aprovação');
select test.ok((select jsonb_array_length(valor->'em_risco') from t where chave = 'painel') = 1, 'painel: 1 reserva em risco');
select test.ok((select (valor->'a_receber'->>'total')::numeric from t where chave = 'painel') > 0, 'painel: valores a receber');
select test.ok((select (valor->>'conversas_aguardando')::int from t where chave = 'painel') = 1, 'painel: 1 conversa aguardando equipe');
select test.ok((select (x->>'manutencao')::int from t, jsonb_array_elements(valor->'disponibilidade_agora') x
  where chave = 'painel' and x->>'equipamento' = 'Gerador 6,5 kVA') = 1, 'painel: gerador com 1 unidade em manutenção');

select test.ok((select (x->>'livres')::int from t, jsonb_array_elements(valor) x
  where chave = 'disp' and x->>'equipamento' = 'Compactador de solo (sapo)') = 0, 'disponibilidade: compactador sem unidade amanhã');
select test.ok((select (x->>'livres')::int from t, jsonb_array_elements(valor) x
  where chave = 'disp' and x->>'equipamento' = 'Furadeira de impacto') = 2, 'disponibilidade: 2 furadeiras livres (2 reservadas)');

select test.claims('10000000-0000-4000-a000-000000000003');
set local role authenticated;
select test.ok(test.erro_de($q$select public.disponibilidade_periodo(test.dia(1, 8), test.dia(2, 8))$q$) = 'sem_permissao', 'sem perfil não consulta disponibilidade');
select test.ok((select (public.painel_resumo()->>'locacoes_ativas')::int) = 0, 'painel vazio para quem não é da equipe (RLS)');
reset role;

rollback;
