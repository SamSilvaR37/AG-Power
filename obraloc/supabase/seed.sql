-- ObraLoc — DADOS FICTÍCIOS para demonstração.
-- Nomes, telefones, documentos e preços são inventados. Nenhum dado real de cliente.
-- Datas são relativas a now(), para a demonstração sempre parecer "do dia".

-- ---------------------------------------------------------------- permissões padrão (ajustáveis)
insert into public.permissoes_papel (papel, permissao) values
  ('admin', 'atender_conversas'), ('admin', 'gerenciar_clientes'), ('admin', 'orcamentos'),
  ('admin', 'aprovar_locacao'), ('admin', 'registrar_retirada'), ('admin', 'registrar_devolucao'),
  ('admin', 'registrar_pagamento'), ('admin', 'manutencao'), ('admin', 'gerenciar_catalogo'),
  ('admin', 'gerenciar_configuracoes'), ('admin', 'gerenciar_equipe'),
  ('atendente', 'atender_conversas'), ('atendente', 'gerenciar_clientes'), ('atendente', 'orcamentos'),
  ('atendente', 'aprovar_locacao'), ('atendente', 'registrar_retirada'), ('atendente', 'registrar_devolucao'),
  ('atendente', 'manutencao')
on conflict do nothing;

-- ---------------------------------------------------------------- regras de cobrança (demonstrativas)
insert into public.regras_cobranca (id, codigo, nome, metodo, contagem, minimo_dias, descricao, demonstrativa) values
  ('00000000-0000-4000-a000-000000000001', 'pacotes-24h-demo', 'Pacotes de menor custo (demonstração)',
   'pacotes', 'periodos_24h', 1,
   'Cada 24 h (ou fração) conta 1 dia. O sistema combina diária, semana, quinzena e mês da tabela e cobra a combinação mais barata. Regra provisória, a validar com os proprietários.',
   true),
  ('00000000-0000-4000-a000-000000000002', 'diaria-calendario-demo', 'Diária por dia de calendário (demonstração)',
   'diaria', 'dias_calendario', 1,
   'Cada dia de calendário com o equipamento conta 1 diária, sem pacotes. Regra provisória, a validar com os proprietários.',
   true)
on conflict do nothing;

insert into public.configuracoes (id, regra_cobranca_id) values (true, '00000000-0000-4000-a000-000000000001')
on conflict (id) do nothing;

insert into public.conexoes_whatsapp (provedor, estado) values ('simulado', 'simulado') on conflict do nothing;

-- ---------------------------------------------------------------- catálogo
insert into public.categorias (id, nome, ordem) values
  ('00000000-0000-4000-a000-000000000101', 'Demolição e perfuração', 1),
  ('00000000-0000-4000-a000-000000000102', 'Concretagem', 2),
  ('00000000-0000-4000-a000-000000000103', 'Compactação', 3),
  ('00000000-0000-4000-a000-000000000104', 'Acesso e escoramento', 4),
  ('00000000-0000-4000-a000-000000000105', 'Energia', 5),
  ('00000000-0000-4000-a000-000000000106', 'Corte', 6),
  ('00000000-0000-4000-a000-000000000107', 'Limpeza', 7)
on conflict do nothing;

insert into public.equipamentos (id, categoria_id, nome, descricao, palavras_chave) values
  ('00000000-0000-4000-a000-000000000201', '00000000-0000-4000-a000-000000000101', 'Martelete rompedor 10 kg', 'Para demolição de pisos, paredes e concreto.', 'martelete rompedor britadeira demolidor quebrar piso'),
  ('00000000-0000-4000-a000-000000000202', '00000000-0000-4000-a000-000000000101', 'Furadeira de impacto', 'Furos em alvenaria, madeira e metal.', 'furadeira parafusadeira furar broca'),
  ('00000000-0000-4000-a000-000000000203', '00000000-0000-4000-a000-000000000102', 'Betoneira 400 L', 'Mistura de concreto e argamassa. Motor elétrico.', 'betoneira misturador concreto argamassa massa'),
  ('00000000-0000-4000-a000-000000000204', '00000000-0000-4000-a000-000000000103', 'Placa vibratória', 'Compactação de pisos intertravados e áreas planas.', 'placa vibratoria compactadora'),
  ('00000000-0000-4000-a000-000000000205', '00000000-0000-4000-a000-000000000103', 'Compactador de solo (sapo)', 'Compactação de valas e aterros.', 'compactador sapo soquete solo aterro vala'),
  ('00000000-0000-4000-a000-000000000206', '00000000-0000-4000-a000-000000000104', 'Andaime tubular (par de painéis 1 m)', 'Par de painéis de 1,0 × 1,0 m com travas.', 'andaime painel fachada'),
  ('00000000-0000-4000-a000-000000000207', '00000000-0000-4000-a000-000000000104', 'Escora metálica 3 m', 'Escora regulável para laje, até 3 m.', 'escora laje escoramento pontalete'),
  ('00000000-0000-4000-a000-000000000208', '00000000-0000-4000-a000-000000000105', 'Gerador 6,5 kVA', 'Gerador a gasolina para obra.', 'gerador energia motor'),
  ('00000000-0000-4000-a000-000000000209', '00000000-0000-4000-a000-000000000106', 'Serra mármore', 'Corte de pisos, revestimentos e pedras.', 'serra marmore makita corte piso cerâmica'),
  ('00000000-0000-4000-a000-000000000210', '00000000-0000-4000-a000-000000000106', 'Cortadora de piso', 'Corte de asfalto e concreto com disco diamantado.', 'cortadora piso asfalto concreto junta'),
  ('00000000-0000-4000-a000-000000000211', '00000000-0000-4000-a000-000000000107', 'Lavadora de alta pressão', 'Limpeza de fachadas, pisos e equipamentos.', 'lavadora alta pressao lava jato')
on conflict do nothing;

-- preços FICTÍCIOS (dias → valor por unidade)
insert into public.equipamento_precos (equipamento_id, dias, valor)
select ('00000000-0000-4000-a000-000000000' || e)::uuid, d, v from (values
  ('201', 1, 90), ('201', 7, 380), ('201', 15, 650), ('201', 30, 1050),
  ('202', 1, 35), ('202', 7, 140), ('202', 15, 240), ('202', 30, 380),
  ('203', 1, 70), ('203', 7, 280), ('203', 15, 480), ('203', 30, 790),
  ('204', 1, 110), ('204', 7, 450), ('204', 30, 1300),
  ('205', 1, 140), ('205', 7, 560), ('205', 30, 1600),
  ('206', 1, 8), ('206', 7, 25), ('206', 15, 40), ('206', 30, 60),
  ('207', 1, 3), ('207', 7, 9), ('207', 30, 20),
  ('208', 1, 150), ('208', 7, 600), ('208', 30, 1700),
  ('209', 1, 30), ('209', 7, 120),
  ('210', 1, 180), ('210', 7, 720),
  ('211', 1, 60), ('211', 7, 240)
) as p(e, d, v)
on conflict do nothing;

-- unidades físicas (patrimônio)
insert into public.unidades (equipamento_id, codigo, numero_serie)
select ('00000000-0000-4000-a000-000000000' || e)::uuid, prefixo || '-' || lpad(n::text, 3, '0'), 'SN' || e || lpad(n::text, 4, '0')
from (values
  ('201', 'MAR', 3), ('202', 'FUR', 4), ('203', 'BET', 2), ('204', 'PLV', 2), ('205', 'CPS', 1),
  ('206', 'AND', 20), ('207', 'ESC', 40), ('208', 'GER', 2), ('209', 'SRM', 3), ('210', 'CTP', 1), ('211', 'LAV', 2)
) as q(e, prefixo, total), generate_series(1, total) n
on conflict do nothing;

-- ---------------------------------------------------------------- clientes (fictícios)
insert into public.clientes (id, nome, tipo, documento, email, endereco, origem) values
  ('00000000-0000-4000-a000-000000000301', 'Construtora Horizonte Ltda', 'pj', '00.000.000/0001-01', 'obras@horizonte.exemplo', 'Rua das Palmeiras, 120 — Centro', 'balcao'),
  ('00000000-0000-4000-a000-000000000302', 'Ana Paula Ribeiro', 'pf', '000.000.000-02', null, 'Rua Ipê Amarelo, 45 — Jardim Primavera', 'whatsapp'),
  ('00000000-0000-4000-a000-000000000303', 'Reformas Silva & Filhos', 'pj', '00.000.000/0001-03', 'contato@reformassilva.exemplo', 'Av. Brasil, 2000 — Vila Nova', 'telefone'),
  ('00000000-0000-4000-a000-000000000304', 'Pedro Henrique Costa', 'pf', '000.000.000-04', null, 'Rua do Sol, 9 — Bela Vista', 'balcao'),
  ('00000000-0000-4000-a000-000000000305', 'Condomínio Jardim das Acácias', 'pj', '00.000.000/0001-05', 'sindico@acacias.exemplo', 'Rua das Acácias, 300 — Parque Verde', 'balcao')
on conflict do nothing;

insert into public.cliente_contatos (cliente_id, nome, telefone, funcao) values
  ('00000000-0000-4000-a000-000000000301', 'Marcos Vieira', '5511990010001', 'Mestre de obras'),
  ('00000000-0000-4000-a000-000000000301', 'Fernanda Lopes', '5511990010006', 'Compras'),
  ('00000000-0000-4000-a000-000000000302', 'Ana Paula Ribeiro', '5511990010002', null),
  ('00000000-0000-4000-a000-000000000303', 'Jorge Silva', '5511990010003', 'Sócio'),
  ('00000000-0000-4000-a000-000000000304', 'Pedro Henrique Costa', '5511990010004', null),
  ('00000000-0000-4000-a000-000000000305', 'Lúcia Martins', '5511990010005', 'Síndica')
on conflict do nothing;

-- ---------------------------------------------------------------- locações de exemplo
-- Função temporária só para o seed: calcula valores com a regra configurada e aloca unidades.
create or replace function pg_temp.seed_locacao(
  p_numero int, p_cliente uuid, p_status public.status_locacao, p_inicio timestamptz, p_fim timestamptz,
  p_itens jsonb, p_modalidade public.modalidade_entrega default 'retirada', p_endereco text default null,
  p_orcamento uuid default null, p_conversa uuid default null, p_criado_por public.tipo_ator default 'equipe'
) returns uuid language plpgsql as $$
declare
  v_regra public.regras_cobranca := public.regra_padrao();
  v_dias int := public.contar_dias(p_inicio, p_fim, v_regra);
  v_id uuid;
  v_item jsonb;
  v_preco record;
  v_total numeric := 0;
  v_qtd int;
begin
  insert into public.locacoes (numero, cliente_id, orcamento_id, conversa_id, status, inicio, fim, modalidade, endereco_entrega,
    valor_itens, valor_total, regra, expira_em, criado_por_tipo, aprovado_em, retirado_em, devolvido_em)
  values (p_numero, p_cliente, p_orcamento, p_conversa, p_status, p_inicio, p_fim, p_modalidade, p_endereco, 0, 0,
    to_jsonb(v_regra) - 'criado_em',
    case when p_status = 'pre_reserva' then now() + interval '90 minutes' end,
    p_criado_por,
    case when p_status in ('confirmada', 'em_andamento', 'devolvida') then p_inicio - interval '1 day' end,
    case when p_status in ('em_andamento', 'devolvida') then p_inicio end,
    case when p_status = 'devolvida' then p_fim end)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    select * into v_preco from public.calcular_preco_unidade((v_item->>'e')::uuid, v_dias, v_regra);
    v_qtd := (v_item->>'q')::int;
    insert into public.locacao_itens (locacao_id, equipamento_id, quantidade, valor_unitario, valor_total, explicacao)
    values (v_id, (v_item->>'e')::uuid, v_qtd, v_preco.valor, v_preco.valor * v_qtd, v_preco.explicacao);
    v_total := v_total + v_preco.valor * v_qtd;
    insert into public.alocacoes (unidade_id, tipo, locacao_id, periodo, ativo)
    select u.id, 'locacao', v_id, tstzrange(p_inicio, p_fim, '[)'), p_status not in ('devolvida', 'cancelada', 'expirada')
    from public.unidades u
    where u.equipamento_id = (v_item->>'e')::uuid
      and not exists (select 1 from public.alocacoes a where a.unidade_id = u.id and a.ativo
                      and a.periodo && tstzrange(p_inicio, p_fim, '[)'))
    order by u.codigo
    limit v_qtd;
  end loop;

  update public.locacoes set valor_itens = v_total, valor_total = v_total where id = v_id;
  return v_id;
end $$;

do $$
declare
  v_l1 uuid; v_l2 uuid; v_l5 uuid; v_l6 uuid; v_conv uuid; v_orc uuid; v_calc jsonb;
  v_amanha timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' + interval '1 day 8 hours';
begin
  if exists (select 1 from public.locacoes) then
    return; -- seed já aplicado
  end if;

  -- 501: em andamento, no prazo
  v_l1 := pg_temp.seed_locacao(501, '00000000-0000-4000-a000-000000000301', 'em_andamento',
    now() - interval '5 days', now() + interval '2 days',
    '[{"e":"00000000-0000-4000-a000-000000000203","q":1},{"e":"00000000-0000-4000-a000-000000000206","q":10}]',
    'entrega', 'Rua das Palmeiras, 120 — Centro');
  insert into public.recebimentos (locacao_id, valor, forma, observacao) values (v_l1, 200, 'pix', 'Sinal (fictício)');

  -- 502: em andamento e ATRASADA (única unidade do compactador)
  v_l2 := pg_temp.seed_locacao(502, '00000000-0000-4000-a000-000000000304', 'em_andamento',
    now() - interval '4 days', now() - interval '1 day',
    '[{"e":"00000000-0000-4000-a000-000000000205","q":1}]');

  -- 503: confirmada para amanhã cedo, mas a única unidade do compactador ainda não voltou (em risco)
  perform pg_temp.seed_locacao(503, '00000000-0000-4000-a000-000000000303', 'confirmada',
    v_amanha, v_amanha + interval '3 days',
    '[{"e":"00000000-0000-4000-a000-000000000205","q":1}]');

  -- 505: devolvida e quitada
  v_l5 := pg_temp.seed_locacao(505, '00000000-0000-4000-a000-000000000305', 'devolvida',
    now() - interval '12 days', now() - interval '9 days',
    '[{"e":"00000000-0000-4000-a000-000000000211","q":1}]');
  insert into public.recebimentos (locacao_id, valor, forma) select v_l5, valor_total, 'dinheiro' from public.locacoes where id = v_l5;

  -- 506: confirmada, retirada amanhã
  v_l6 := pg_temp.seed_locacao(506, '00000000-0000-4000-a000-000000000301', 'confirmada',
    v_amanha, v_amanha + interval '7 days',
    '[{"e":"00000000-0000-4000-a000-000000000202","q":2}]');

  -- gerador GER-002 em manutenção programada
  insert into public.alocacoes (unidade_id, tipo, periodo, motivo)
  select id, 'manutencao', tstzrange(now() - interval '1 day', now() + interval '2 days', '[)'), 'Troca de óleo e revisão (fictício)'
  from public.unidades where codigo = 'GER-002';

  -- conversa da Ana Paula: orçamento aceito virou pré-reserva aguardando aprovação (504)
  insert into public.conversas (provedor, chat_externo_id, telefone, nome_contato, cliente_id, ultima_mensagem_em, nao_lidas)
  values ('simulado', 'sim-5511990010002', '5511990010002', 'Ana Paula', '00000000-0000-4000-a000-000000000302', now() - interval '20 minutes', 0)
  returning id into v_conv;

  v_calc := public.calcular_orcamento_interno(
    '[{"equipamento_id":"00000000-0000-4000-a000-000000000201","quantidade":1}]',
    v_amanha, v_amanha + interval '2 days', 'retirada');
  insert into public.orcamentos (cliente_id, conversa_id, status, inicio, fim, modalidade, dias, regra,
    valor_itens, valor_total, validade_ate, criado_por_tipo)
  values ('00000000-0000-4000-a000-000000000302', v_conv, 'aceito', v_amanha, v_amanha + interval '2 days', 'retirada',
    (v_calc->>'dias')::int, v_calc->'regra', (v_calc->>'valor_itens')::numeric, (v_calc->>'valor_total')::numeric,
    now() + interval '23 hours', 'bot')
  returning id into v_orc;
  insert into public.orcamento_itens (orcamento_id, equipamento_id, quantidade, valor_unitario, valor_total, explicacao)
  select v_orc, (i->>'equipamento_id')::uuid, (i->>'quantidade')::int, (i->>'valor_unitario')::numeric,
         (i->>'valor_total')::numeric, i->>'explicacao'
  from jsonb_array_elements(v_calc->'itens') i;

  perform pg_temp.seed_locacao(504, '00000000-0000-4000-a000-000000000302', 'pre_reserva',
    v_amanha, v_amanha + interval '2 days',
    '[{"e":"00000000-0000-4000-a000-000000000201","q":1}]', 'retirada', null, v_orc, v_conv, 'bot');

  insert into public.mensagens (conversa_id, direcao, autor, provedor, id_externo, corpo, estado, criado_em, epoca_bot) values
    (v_conv, 'entrada', 'cliente', 'simulado', 'seed-m1', 'Oi! Vocês têm martelete pra alugar amanhã?', 'recebida', now() - interval '30 minutes', null),
    (v_conv, 'saida', 'bot', 'simulado', 'seed-m2', 'Olá, Ana Paula! Sou o assistente virtual da ObraLoc. Temos o Martelete rompedor 10 kg. Até quando você vai precisar?', 'lida', now() - interval '29 minutes', 0),
    (v_conv, 'entrada', 'cliente', 'simulado', 'seed-m3', 'Até depois de amanhã, retiro aí na loja.', 'recebida', now() - interval '27 minutes', null),
    (v_conv, 'saida', 'bot', 'simulado', 'seed-m4', 'Orçamento: 1× Martelete rompedor 10 kg, 2 dias, ' || public.formatar_brl((v_calc->>'valor_total')::numeric) || '. Posso fazer a pré-reserva?', 'lida', now() - interval '26 minutes', 0),
    (v_conv, 'entrada', 'cliente', 'simulado', 'seed-m5', 'Pode sim!', 'recebida', now() - interval '21 minutes', null),
    (v_conv, 'saida', 'bot', 'simulado', 'seed-m6', 'Pré-reserva feita! A equipe vai confirmar em breve e te aviso por aqui.', 'entregue', now() - interval '20 minutes', 0);

  -- conversa encaminhada à equipe (reclamação)
  insert into public.conversas (provedor, chat_externo_id, telefone, nome_contato, cliente_id, modo, motivo_escalonamento, ultima_mensagem_em, nao_lidas, epoca_bot)
  values ('simulado', 'sim-5511990010003', '5511990010003', 'Jorge Silva', '00000000-0000-4000-a000-000000000303',
          'aguardando_equipe', 'Reclamação sobre equipamento', now() - interval '5 minutes', 2, 1)
  returning id into v_conv;
  insert into public.mensagens (conversa_id, direcao, autor, provedor, id_externo, corpo, estado, criado_em, epoca_bot) values
    (v_conv, 'entrada', 'cliente', 'simulado', 'seed-m7', 'A placa vibratória da última locação veio com o motor falhando.', 'recebida', now() - interval '6 minutes', null),
    (v_conv, 'saida', 'sistema', 'simulado', 'seed-m8', 'Sinto muito pelo problema. Vou chamar alguém da equipe para te atender.', 'entregue', now() - interval '6 minutes', null),
    (v_conv, 'entrada', 'cliente', 'simulado', 'seed-m9', 'Ok, aguardo.', 'recebida', now() - interval '5 minutes', null);

  perform setval('public.locacao_numero_seq', 600);
end $$;
