-- Expiração de pré-reserva, atraso comprometendo a próxima reserva, manutenção e avaria.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

-- cortadora de piso: uma única unidade
insert into t values ('o1', public.salvar_orcamento_interno('00000000-0000-4000-a000-000000000301', null,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000210","quantidade":1}]', test.dia(3, 8), test.dia(5, 8), 'retirada', null, 'o1', 'sistema'));
insert into t values ('o2', public.salvar_orcamento_interno('00000000-0000-4000-a000-000000000302', null,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000210","quantidade":1}]', test.dia(4, 8), test.dia(6, 8), 'retirada', null, 'o2', 'sistema'));
insert into t values ('p1', public.criar_pre_reserva_interno((select (valor->>'orcamento_id')::uuid from t where chave = 'o1'), 'p1', 'sistema'));

select test.ok(test.erro_de(format('select public.criar_pre_reserva_interno(%L, %L, %L)',
  (select valor->>'orcamento_id' from t where chave = 'o2'), 'p2', 'sistema')) = 'indisponivel',
  'segundo cliente não reserva a última unidade em período sobreposto');

-- ------------------------------------------------ expiração
update public.locacoes set expira_em = now() - interval '1 minute' where id = (select (valor->>'locacao_id')::uuid from t where chave = 'p1');
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000210', test.dia(3, 8), test.dia(5, 8), 1)->>'disponiveis')::int = 1,
  'pré-reserva vencida deixa de bloquear a unidade');

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('aprov-venc', public.aprovar_pre_reserva((select (valor->>'locacao_id')::uuid from t where chave = 'p1')));
reset role;
select test.ok((select valor->>'codigo' from t where chave = 'aprov-venc') = 'pre_reserva_expirada', 'aprovação de pré-reserva vencida é recusada');
select test.ok((select status from public.locacoes where id = (select (valor->>'locacao_id')::uuid from t where chave = 'p1')) = 'expirada', 'pré-reserva marcada como expirada');
select test.ok(not exists (select 1 from public.alocacoes where locacao_id = (select (valor->>'locacao_id')::uuid from t where chave = 'p1') and ativo), 'unidade liberada');

insert into t values ('p2', public.criar_pre_reserva_interno((select (valor->>'orcamento_id')::uuid from t where chave = 'o2'), 'p2', 'sistema'));
select test.ok((select valor->>'status' from t where chave = 'p2') = 'pre_reserva', 'outro cliente consegue reservar depois da expiração');
select test.ok(test.erro_de(format('select public.criar_pre_reserva_interno(%L, %L, %L)',
  (select valor->>'orcamento_id' from t where chave = 'o1'), 'p1-de-novo', 'sistema')) = 'orcamento_ja_utilizado',
  'orçamento cuja pré-reserva expirou exige novo orçamento');

-- expiração em lote (rotina agendada)
update public.locacoes set expira_em = now() - interval '1 minute' where id = (select (valor->>'locacao_id')::uuid from t where chave = 'p2');
select test.ok(public.expirar_pre_reservas() >= 1, 'rotina de expiração marca pré-reservas vencidas');
select test.ok((select status from public.locacoes where id = (select (valor->>'locacao_id')::uuid from t where chave = 'p2')) = 'expirada', 'p2 expirada pela rotina');

-- ------------------------------------------------ atraso compromete a próxima reserva
-- 502 (compactador, atrasada) segura a única unidade; 503 começa amanhã com essa unidade.
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000205', now() + interval '2 hours', now() + interval '10 hours', 1)->>'disponiveis')::int = 0,
  'equipamento atrasado continua bloqueado mesmo após a data prevista');
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
select test.ok(test.erro_de('update public.locacoes set status = $$cancelada$$ where numero = 503') = '42501',
  'equipe não altera status direto na tabela (só pelas funções)');
select test.ok(test.erro_de(format($q$select public.registrar_retirada(%L, '[{"item":"Motor","ok":true}]')$q$,
  (select id from public.locacoes where numero = 503))) = 'unidade_ocupada', 'retirada bloqueada: unidade ainda com o cliente atrasado');
select test.ok(test.erro_de(format('select public.realocar_unidade(%L, %L)', (select id from public.locacoes where numero = 503),
  (select id from public.unidades where codigo = 'CPS-001'))) = 'indisponivel', 'sem outra unidade para realocar');
-- cliente atrasado devolve
insert into t values ('dev502', public.registrar_devolucao((select id from public.locacoes where numero = 502), '[{"item":"Motor","ok":true}]'));
insert into t values ('ret503', public.registrar_retirada((select id from public.locacoes where numero = 503), '[{"item":"Motor","ok":true}]'));
reset role;
select test.ok((select (valor->>'atrasada')::boolean and valor->>'cobranca_atraso' = 'a definir pela equipe' from t where chave = 'dev502'),
  'devolução atrasada é sinalizada; cobrança de atraso fica com a equipe');
select test.ok((select valor->>'status' from t where chave = 'ret503') = 'em_andamento', 'após a devolução, a próxima retirada é liberada');
select test.ok(not exists (select 1 from public.v_reservas_em_risco where numero = 503), '503 sai da lista de risco');

-- ------------------------------------------------ manutenção
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
-- 506 tem FUR-001 e FUR-002 a partir de amanhã
select test.ok(test.erro_de(format('select public.agendar_manutencao(%L, %L, %L, %L)', (select id from public.unidades where codigo = 'FUR-001'),
  test.dia(2, 8), test.dia(3, 8), 'Revisão')) = 'conflito', 'manutenção não pode cobrir período já reservado');
insert into t values ('man', public.agendar_manutencao((select id from public.unidades where codigo = 'FUR-003'), test.dia(2, 8), test.dia(3, 8), 'Revisão'));
reset role;
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000202', test.dia(2, 9), test.dia(2, 17), 1)->>'disponiveis')::int = 1,
  'furadeiras: 4 − 2 reservadas − 1 em manutenção = 1 livre');

-- ------------------------------------------------ devolução com avaria
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('dev501', public.registrar_devolucao((select id from public.locacoes where numero = 501),
  '[{"item":"Betoneira gira","ok":false}]', 'Coroa quebrada', array[(select id from public.unidades where codigo = 'BET-001')]));
reset role;
select test.ok((select condicao from public.unidades where codigo = 'BET-001') = 'manutencao', 'unidade com avaria vai para manutenção');
select test.ok((select situacao from public.v_unidades_situacao where codigo = 'AND-001') = 'disponivel', 'andaimes da mesma locação ficam disponíveis');
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000203', test.dia(5, 8), test.dia(6, 8), 1)->>'disponiveis')::int = 1,
  'betoneira avariada não entra na disponibilidade');
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
select test.ok((public.alterar_condicao_unidade((select id from public.unidades where codigo = 'BET-001'), 'ativa', 'Coroa trocada')->>'ok')::boolean, 'equipe libera a unidade após o reparo');
reset role;
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000203', test.dia(5, 8), test.dia(6, 8), 1)->>'disponiveis')::int = 2,
  'betoneira volta para a disponibilidade');

rollback;
