-- Modelo, dados fictícios, situação das unidades e regra de cobrança.
begin;

select test.ok((select count(*) from public.equipamentos) = 11, 'catálogo fictício com 11 equipamentos');
select test.ok((select count(*) from public.unidades) = 80, '80 unidades físicas identificadas');
select test.ok((select count(*) from public.unidades where codigo = 'CPS-001') = 1, 'compactador tem uma única unidade (CPS-001)');

-- estados de equipamento
select test.ok((select situacao from public.v_unidades_situacao where codigo = 'CPS-001') = 'alugado', 'CPS-001 aparece como alugado');
select test.ok((select situacao from public.v_unidades_situacao where codigo = 'GER-002') = 'manutencao', 'GER-002 aparece em manutenção');
select test.ok((select situacao from public.v_unidades_situacao where codigo = 'GER-001') = 'disponivel', 'GER-001 aparece disponível');
select test.ok((select atrasada from public.v_locacoes_resumo where numero = 502), 'locação 502 aparece atrasada');
select test.ok((select saldo from public.v_locacoes_resumo where numero = 505) = 0, 'locação 505 quitada (saldo zero)');
select test.ok(exists (select 1 from public.v_reservas_em_risco where numero = 503 and motivo = 'unidade_com_outro_cliente'),
  'reserva 503 em risco: o compactador atrasado ainda não voltou');

-- regra padrão: pacotes de menor custo, 24 h
select test.ok((public.regra_padrao()).codigo = 'pacotes-24h-demo', 'regra padrão é a de pacotes (demonstrativa)');

select test.ok(
  (select valor from public.calcular_preco_unidade('00000000-0000-4000-a000-000000000201', 3, public.regra_padrao())) = 270,
  'martelete 3 dias = 3 diárias de R$ 90 = R$ 270');
select test.ok(
  (select valor from public.calcular_preco_unidade('00000000-0000-4000-a000-000000000201', 6, public.regra_padrao())) = 380,
  'martelete 6 dias cobra a semana (R$ 380), mais barata que 6 diárias');
select test.ok(
  (select explicacao from public.calcular_preco_unidade('00000000-0000-4000-a000-000000000201', 6, public.regra_padrao())) like '%cobre 7 dias%',
  'explicação avisa que a semana cobre 7 dias');
select test.ok(
  (select valor from public.calcular_preco_unidade('00000000-0000-4000-a000-000000000201', 9, public.regra_padrao())) = 560,
  'martelete 9 dias = semana + 2 diárias = R$ 560');
select test.ok(
  (select explicacao from public.calcular_preco_unidade('00000000-0000-4000-a000-000000000201', 9, public.regra_padrao()))
    = '1 × semana (R$ 380,00) + 2 × diária (R$ 90,00)',
  'explicação lista a combinação usada');

-- contagem de dias
select test.ok(public.contar_dias(test.dia(1, 8), test.dia(2, 8), public.regra_padrao()) = 1, '24 h exatas = 1 dia (regra 24 h)');
select test.ok(public.contar_dias(test.dia(1, 8), test.dia(2, 9), public.regra_padrao()) = 2, '25 h = 2 dias (regra 24 h)');
select test.ok(public.contar_dias(test.dia(1, 8), test.dia(2, 8),
  (select r from public.regras_cobranca r where codigo = 'diaria-calendario-demo')) = 2, 'segunda 8h → terça 8h = 2 dias de calendário');

-- trocar a regra muda o cálculo e o orçamento mostra a regra usada
update public.configuracoes set regra_cobranca_id = '00000000-0000-4000-a000-000000000002';
select test.ok(
  (public.calcular_orcamento_interno('[{"equipamento_id":"00000000-0000-4000-a000-000000000201","quantidade":1}]',
    test.dia(1, 8), test.dia(7, 17), 'retirada')->>'valor_total')::numeric = 630,
  'regra de diária por calendário: 7 dias × R$ 90 = R$ 630');
select test.ok(
  public.calcular_orcamento_interno('[{"equipamento_id":"00000000-0000-4000-a000-000000000201","quantidade":1}]',
    test.dia(1, 8), test.dia(7, 17), 'retirada')->'regra'->>'codigo' = 'diaria-calendario-demo',
  'orçamento informa a regra utilizada');
update public.configuracoes set regra_cobranca_id = '00000000-0000-4000-a000-000000000001';

-- orçamento com vários itens, quantidade e entrega sem frete inventado
select test.ok(
  (public.calcular_orcamento_interno(
    '[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1},{"equipamento_id":"00000000-0000-4000-a000-000000000207","quantidade":20}]',
    test.dia(1, 8), test.dia(3, 8), 'entrega')->>'valor_total')::numeric = 260,
  'betoneira 2 dias (R$ 140) + 20 escoras × 2 dias (R$ 120) = R$ 260');
select test.ok(
  public.calcular_orcamento_interno('[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]',
    test.dia(1, 8), test.dia(3, 8), 'entrega')->'valor_frete' = 'null'::jsonb,
  'frete de entrega não é calculado (fica a definir pela equipe)');

-- sem preço cadastrado: erro, nunca valor inventado
insert into public.equipamentos (id, categoria_id, nome) values ('00000000-0000-4000-a000-000000000299', '00000000-0000-4000-a000-000000000101', 'Equipamento sem preço');
insert into public.unidades (equipamento_id, codigo) values ('00000000-0000-4000-a000-000000000299', 'SP-001');
select test.ok(test.erro_de($q$select public.calcular_orcamento_interno('[{"equipamento_id":"00000000-0000-4000-a000-000000000299","quantidade":1}]', test.dia(1), test.dia(2), 'retirada')$q$) = 'sem_preco',
  'equipamento sem preço gera erro sem_preco');

rollback;
