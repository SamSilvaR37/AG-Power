-- Fluxo do MVP: mensagem → orçamento → aceite → pré-reserva → aprovação → retirada → devolução.
-- Mais: webhook duplicado, reenvio sem duplicar registros, datas inválidas e indisponibilidade.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

-- ------------------------------------------------ mensagem recebida (contato novo)
set local role obraloc_integracao;
insert into t values ('in1', public.registrar_mensagem_recebida(test.evento('ev-1', 'msg-1', '5511977770001', 'Oi, preciso de uma betoneira')));
insert into t values ('in1-dup', public.registrar_mensagem_recebida(test.evento('ev-1', 'msg-1', '5511977770001', 'Oi, preciso de uma betoneira')));
insert into t values ('in1-dup2', public.registrar_mensagem_recebida(test.evento('ev-1b', 'msg-1', '5511977770001', 'Oi, preciso de uma betoneira')));
reset role;

select test.ok((select valor->>'duplicado' from t where chave = 'in1') = 'false', 'primeira entrega do webhook é processada');
select test.ok((select (valor->>'acionar_bot')::boolean from t where chave = 'in1'), 'conversa nova começa com o bot ativo');
select test.ok((select valor->>'duplicado' from t where chave = 'in1-dup') = 'true', 'mesmo evento reenviado é ignorado');
select test.ok((select valor->>'motivo' from t where chave = 'in1-dup2') = 'mensagem_repetida', 'mesma mensagem com outro id de evento é ignorada');
select test.ok((select count(*) from public.mensagens where id_externo = 'msg-1') = 1, 'só uma mensagem gravada');

-- ------------------------------------------------ assistente consulta o backend
set local role obraloc_bot;
insert into t values ('busca', public.bot_buscar_equipamentos('betoneira', 5));
insert into t values ('busca-vazia', public.bot_buscar_equipamentos('?', 5));
insert into t values ('disp', public.bot_consultar_disponibilidade('00000000-0000-4000-a000-000000000203', test.dia(2, 8), test.dia(4, 17), 1));

-- datas inválidas e equipamento inexistente: resposta de erro, sem valores
insert into t values ('d-inv', public.bot_consultar_disponibilidade('00000000-0000-4000-a000-000000000203', test.dia(4, 8), test.dia(2, 8), 1));
insert into t values ('d-pass', public.bot_calcular_orcamento('[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]', test.dia(-3, 8), test.dia(-1, 8), 'retirada'));
insert into t values ('eq-inex', public.bot_consultar_disponibilidade('00000000-0000-4000-a000-000000009999', test.dia(2, 8), test.dia(4, 8), 1));
insert into t values ('qtd0', public.bot_calcular_orcamento('[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":0}]', test.dia(2, 8), test.dia(4, 8), 'retirada'));
insert into t values ('mod', public.bot_calcular_orcamento('[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]', test.dia(2, 8), test.dia(4, 8), 'drone'));
insert into t values ('lixo', public.bot_calcular_orcamento('[{"equipamento_id":"isso nao e uuid","quantidade":1}]', test.dia(2, 8), test.dia(4, 8), 'retirada'));
-- indisponível: o compactador está atrasado e já reservado para amanhã
insert into t values ('indisp', public.bot_consultar_disponibilidade('00000000-0000-4000-a000-000000000205', test.dia(1, 9), test.dia(2, 17), 1));
reset role;

select test.ok((select valor->'resultados'->0->>'nome' from t where chave = 'busca') = 'Betoneira 400 L', 'busca encontra a betoneira');
select test.ok((select valor->>'codigo' from t where chave = 'busca-vazia') = 'busca_vazia', 'busca sem termo pede esclarecimento');
select test.ok((select (valor->>'disponiveis')::int from t where chave = 'disp') = 2, 'duas betoneiras livres no período');
select test.ok((select valor->>'codigo' from t where chave = 'd-inv') = 'periodo_invalido', 'devolução antes da retirada é rejeitada');
select test.ok((select valor->>'codigo' from t where chave = 'd-pass') = 'periodo_invalido', 'data no passado é rejeitada');
select test.ok((select valor ? 'valor_total' from t where chave = 'd-pass') = false, 'erro não traz valor algum');
select test.ok((select valor->>'codigo' from t where chave = 'eq-inex') = 'equipamento_nao_encontrado', 'equipamento inexistente é rejeitado');
select test.ok((select valor->>'codigo' from t where chave = 'qtd0') = 'quantidade_invalida', 'quantidade zero é rejeitada');
select test.ok((select valor->>'codigo' from t where chave = 'mod') = 'modalidade_invalida', 'modalidade desconhecida é rejeitada');
select test.ok((select valor->>'codigo' from t where chave = 'lixo') = 'itens_invalidos', 'item malformado é rejeitado');
select test.ok((select (valor->>'suficiente')::boolean from t where chave = 'indisp') = false, 'compactador indisponível (atraso + reserva existente)');

-- ------------------------------------------------ orçamento salvo (com reenvio)
set local role obraloc_bot;
insert into t values ('orc', public.bot_salvar_orcamento((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]', test.dia(2, 8), test.dia(4, 17), 'retirada', null, 'orc:msg-1'));
insert into t values ('orc-dup', public.bot_salvar_orcamento((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]', test.dia(2, 8), test.dia(4, 17), 'retirada', null, 'orc:msg-1'));
insert into t values ('orc-entrega-sem-end', public.bot_salvar_orcamento((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000203","quantidade":1}]', test.dia(2, 8), test.dia(4, 17), 'entrega', '  ', 'orc:msg-x'));
reset role;

select test.ok((select (valor->>'ok')::boolean from t where chave = 'orc'), 'assistente salva o orçamento');
select test.ok((select (valor->'resumo'->>'valor_total')::numeric from t where chave = 'orc') = 210, 'betoneira 2 dias e 9 h = 3 diárias = R$ 210');
select test.ok((select valor->>'duplicado' from t where chave = 'orc-dup') = 'true', 'reenvio do mesmo pedido não cria outro orçamento');
select test.ok((select count(*) from public.orcamentos where chave_idempotencia = 'orc:msg-1') = 1, 'um único orçamento gravado');
select test.ok((select valor->>'codigo' from t where chave = 'orc-entrega-sem-end') = 'endereco_obrigatorio', 'entrega sem endereço é rejeitada');
select test.ok((select cadastro_incompleto and origem = 'whatsapp' from public.clientes c join public.conversas v on v.cliente_id = c.id
  where v.id = (select (valor->>'conversa_id')::uuid from t where chave = 'in1')), 'contato novo vira cliente marcado para conferência');

-- ------------------------------------------------ aceite → pré-reserva (com reenvio)
insert into t select 'orc-alheio', to_jsonb(id) from public.orcamentos
  where conversa_id <> (select (valor->>'conversa_id')::uuid from t where chave = 'in1') limit 1;
set local role obraloc_bot;
insert into t values ('pre', public.bot_criar_pre_reserva((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  (select (valor->>'orcamento_id')::uuid from t where chave = 'orc'), 'pre:msg-2'));
insert into t values ('pre-dup', public.bot_criar_pre_reserva((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  (select (valor->>'orcamento_id')::uuid from t where chave = 'orc'), 'pre:msg-2'));
insert into t values ('pre-dup-outra-chave', public.bot_criar_pre_reserva((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  (select (valor->>'orcamento_id')::uuid from t where chave = 'orc'), 'pre:msg-3'));
-- orçamento de outra conversa não pode ser usado
insert into t values ('pre-alheio', public.bot_criar_pre_reserva((select (valor->>'conversa_id')::uuid from t where chave = 'in1'), 0,
  (select (valor #>> '{}')::uuid from t where chave = 'orc-alheio'), 'pre:msg-4'));
reset role;

select test.ok((select valor->>'status' from t where chave = 'pre') = 'pre_reserva', 'aceite cria pré-reserva');
select test.ok((select (valor->>'expira_em')::timestamptz from t where chave = 'pre') between now() + interval '119 minutes' and now() + interval '121 minutes',
  'pré-reserva expira no prazo configurado (120 min)');
select test.ok((select valor->>'duplicado' from t where chave = 'pre-dup') = 'true', 'reenvio do aceite não cria outra pré-reserva');
select test.ok((select valor->>'duplicado' from t where chave = 'pre-dup-outra-chave') = 'true', 'mesmo orçamento com outra chave devolve a mesma pré-reserva');
select test.ok((select count(*) from public.locacoes where orcamento_id = (select (valor->>'orcamento_id')::uuid from t where chave = 'orc')) = 1, 'uma única locação para o orçamento');
select test.ok((select valor->>'codigo' from t where chave = 'pre-alheio') = 'orcamento_nao_encontrado', 'assistente não usa orçamento de outra conversa');
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000203', test.dia(2, 8), test.dia(4, 17), 1)->>'disponiveis')::int = 1,
  'pré-reserva já segura uma betoneira');

-- ------------------------------------------------ aprovação humana
select test.claims('10000000-0000-4000-a000-000000000003');
set local role authenticated;
select test.ok(test.erro_de(format('select public.aprovar_pre_reserva(%L)', (select valor->>'locacao_id' from t where chave = 'pre'))) = 'sem_permissao',
  'usuário sem perfil não aprova');
reset role;

set local role obraloc_bot;
select test.ok(test.erro_de(format('select public.aprovar_pre_reserva(%L)', (select valor->>'locacao_id' from t where chave = 'pre'))) = '42501',
  'assistente não tem acesso à aprovação');
reset role;

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('aprov', public.aprovar_pre_reserva((select (valor->>'locacao_id')::uuid from t where chave = 'pre')));
insert into t values ('aprov-dup', public.aprovar_pre_reserva((select (valor->>'locacao_id')::uuid from t where chave = 'pre')));
reset role;

select test.ok((select valor->>'status' from t where chave = 'aprov') = 'confirmada', 'atendente aprova: vira locação confirmada');
select test.ok((select valor->>'locacao_id' from t where chave = 'aprov') = (select valor->>'locacao_id' from t where chave = 'pre'),
  'a locação é o mesmo registro da pré-reserva');
select test.ok((select count(*) from public.alocacoes where locacao_id = (select (valor->>'locacao_id')::uuid from t where chave = 'pre') and ativo) = 1,
  'aprovação não duplica a alocação nem conflita consigo mesma');
select test.ok((select valor->>'duplicado' from t where chave = 'aprov-dup') = 'true', 'aprovar de novo é idempotente');
select test.ok((select status from public.orcamentos where id = (select (valor->>'orcamento_id')::uuid from t where chave = 'orc')) = 'convertido',
  'orçamento marcado como convertido');

-- ------------------------------------------------ retirada e devolução
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
select test.ok(test.erro_de(format($q$select public.registrar_retirada(%L, '[]')$q$, (select valor->>'locacao_id' from t where chave = 'pre'))) = 'checklist_obrigatorio',
  'retirada exige checklist');
insert into t values ('ret', public.registrar_retirada((select (valor->>'locacao_id')::uuid from t where chave = 'pre'),
  '[{"item":"Motor liga","ok":true},{"item":"Cabo sem emendas","ok":true}]', 'Cliente retirou na loja'));
reset role;

select test.ok((select valor->>'status' from t where chave = 'ret') = 'em_andamento', 'retirada registrada: em andamento');
select test.ok((select situacao from public.v_unidades_situacao v join public.alocacoes a on a.unidade_id = v.unidade_id
  where a.locacao_id = (select (valor->>'locacao_id')::uuid from t where chave = 'pre')) = 'alugado', 'unidade aparece como alugada');

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('dev', public.registrar_devolucao((select (valor->>'locacao_id')::uuid from t where chave = 'pre'),
  '[{"item":"Motor liga","ok":true},{"item":"Limpa","ok":false}]', 'Devolvida suja'));
insert into t values ('dev-dup', public.registrar_devolucao((select (valor->>'locacao_id')::uuid from t where chave = 'pre'),
  '[{"item":"Motor liga","ok":true}]', null));
reset role;

select test.ok((select valor->>'status' from t where chave = 'dev') = 'devolvida', 'devolução registrada');
select test.ok((select valor->>'duplicado' from t where chave = 'dev-dup') = 'true', 'devolução repetida não gera novo registro');
select test.ok((select count(*) from public.vistorias where locacao_id = (select (valor->>'locacao_id')::uuid from t where chave = 'pre')) = 2,
  'checklists de retirada e devolução gravados');
select test.ok((public.consultar_disponibilidade_interno('00000000-0000-4000-a000-000000000203', test.dia(2, 8), test.dia(4, 17), 1)->>'disponiveis')::int = 2,
  'devolução libera a betoneira para o período');
select test.ok((select count(*) from public.historico where entidade_id = (select (valor->>'locacao_id')::uuid from t where chave = 'pre')) >= 4,
  'histórico registra pré-reserva, aprovação, retirada e devolução');

-- ------------------------------------------------ recebimento manual
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
select test.ok(test.erro_de(format('select public.registrar_recebimento(%L, 50, %L)', (select valor->>'locacao_id' from t where chave = 'pre'), 'pix')) = 'sem_permissao',
  'atendente não registra pagamento (permissão padrão do admin)');
reset role;
select test.claims('10000000-0000-4000-a000-000000000001');
set local role authenticated;
select test.ok(test.erro_de(format('select public.registrar_recebimento(%L, 9999, %L)', (select valor->>'locacao_id' from t where chave = 'pre'), 'pix')) = 'valor_acima_do_saldo',
  'recebimento acima do saldo é rejeitado');
insert into t values ('rec', public.registrar_recebimento((select (valor->>'locacao_id')::uuid from t where chave = 'pre'), 210, 'pix', 'Quitado'));
reset role;
select test.ok((select (valor->>'saldo')::numeric from t where chave = 'rec') = 0, 'admin registra recebimento e saldo zera');

rollback;
