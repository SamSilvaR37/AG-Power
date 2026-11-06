-- ObraLoc — operações: orçamento → pré-reserva → aprovação → retirada → devolução.
-- Toda mudança de estado passa por estas funções. O app e o assistente não escrevem
-- diretamente em locacoes/alocacoes (ver políticas RLS na migração de segurança).

-- ---------------------------------------------------------------- gatilhos
create or replace function public.trg_locacao_atualizada() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.atualizado_em := now();
  if new.status <> 'pre_reserva' then
    new.expira_em := null;
  end if;
  return new;
end $$;

create trigger locacao_atualizada before update on public.locacoes
for each row execute function public.trg_locacao_atualizada();

-- Ao encerrar (devolvida/expirada/cancelada), as unidades são liberadas.
create or replace function public.trg_locacao_libera_unidades() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status in ('devolvida', 'expirada', 'cancelada') and old.status is distinct from new.status then
    update public.alocacoes set ativo = false where locacao_id = new.id and ativo;
  end if;
  return null;
end $$;

create trigger locacao_libera_unidades after update of status on public.locacoes
for each row execute function public.trg_locacao_libera_unidades();

-- ---------------------------------------------------------------- utilidades
create or replace function public.resposta_locacao(l public.locacoes, p_duplicado boolean default false)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'ok', true, 'duplicado', p_duplicado,
    'locacao_id', l.id, 'numero', l.numero, 'status', l.status,
    'inicio', l.inicio, 'fim', l.fim, 'expira_em', l.expira_em,
    'valor_total', l.valor_total, 'valor_frete', l.valor_frete
  )
$$;

create or replace function public.travar_equipamentos(p_equipamentos uuid[]) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v uuid;
begin
  -- ordem fixa evita deadlock entre pedidos com os mesmos equipamentos
  for v in select distinct x from unnest(p_equipamentos) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('obraloc:equipamento:' || v::text, 0));
  end loop;
end $$;

-- Marca como expiradas as pré-reservas vencidas (liberando as unidades).
-- Pode ser agendada (pg_cron/edge function) e também é chamada antes de reservar.
create or replace function public.expirar_pre_reservas() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in
    update public.locacoes set status = 'expirada'
    where status = 'pre_reserva' and expira_em <= now()
    returning id
  loop
    v_total := v_total + 1;
    perform public.registrar_historico('sistema', 'pre_reserva_expirada', 'locacao', v_id);
  end loop;
  return v_total;
end $$;

-- ---------------------------------------------------------------- orçamento
create or replace function public.salvar_orcamento_interno(
  p_cliente uuid, p_conversa uuid, p_itens jsonb, p_inicio timestamptz, p_fim timestamptz,
  p_modalidade public.modalidade_entrega, p_endereco text, p_chave text, p_ator public.tipo_ator
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_existente public.orcamentos;
  v_calc jsonb;
  v_orc public.orcamentos;
  v_item jsonb;
begin
  if p_chave is not null then
    select * into v_existente from public.orcamentos where chave_idempotencia = p_chave;
    if found then
      return jsonb_build_object('ok', true, 'duplicado', true, 'orcamento_id', v_existente.id,
        'numero', v_existente.numero, 'valor_total', v_existente.valor_total);
    end if;
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente) then
    perform public.erro('cliente_nao_encontrado', 'Cliente não encontrado.');
  end if;
  if p_modalidade = 'entrega' and coalesce(trim(p_endereco), '') = '' then
    perform public.erro('endereco_obrigatorio', 'Informe o endereço da obra para entrega.');
  end if;

  v_calc := public.calcular_orcamento_interno(p_itens, p_inicio, p_fim, p_modalidade);

  begin
    insert into public.orcamentos (
      cliente_id, conversa_id, inicio, fim, modalidade, endereco_entrega, dias, regra,
      valor_itens, valor_frete, valor_total, validade_ate, chave_idempotencia, criado_por_tipo, criado_por
    ) values (
      p_cliente, p_conversa, p_inicio, p_fim, p_modalidade, nullif(trim(p_endereco), ''),
      (v_calc->>'dias')::int, v_calc->'regra',
      (v_calc->>'valor_itens')::numeric, null, (v_calc->>'valor_total')::numeric,
      now() + make_interval(hours => (public.config()).orcamento_validade_horas),
      p_chave, p_ator, case when p_ator = 'equipe' then auth.uid() end
    ) returning * into v_orc;
  exception when unique_violation then
    -- mesma chave gravada por uma requisição simultânea (reenvio do webhook)
    select * into v_existente from public.orcamentos where chave_idempotencia = p_chave;
    return jsonb_build_object('ok', true, 'duplicado', true, 'orcamento_id', v_existente.id,
      'numero', v_existente.numero, 'valor_total', v_existente.valor_total);
  end;

  for v_item in select * from jsonb_array_elements(v_calc->'itens') loop
    insert into public.orcamento_itens (orcamento_id, equipamento_id, quantidade, valor_unitario, valor_total, explicacao)
    values (v_orc.id, (v_item->>'equipamento_id')::uuid, (v_item->>'quantidade')::int,
            (v_item->>'valor_unitario')::numeric, (v_item->>'valor_total')::numeric, v_item->>'explicacao');
  end loop;

  perform public.registrar_historico(p_ator, 'orcamento_criado', 'orcamento', v_orc.id,
    jsonb_build_object('numero', v_orc.numero, 'valor_total', v_orc.valor_total));

  return jsonb_build_object('ok', true, 'duplicado', false, 'orcamento_id', v_orc.id,
    'numero', v_orc.numero, 'validade_ate', v_orc.validade_ate, 'resumo', v_calc);
end $$;

-- ---------------------------------------------------------------- pré-reserva
create or replace function public.criar_pre_reserva_interno(p_orcamento uuid, p_chave text, p_ator public.tipo_ator)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_orc public.orcamentos;
  v_loc public.locacoes;
  v_item record;
  v_qtd int;
  v_nome text;
begin
  if p_chave is not null then
    select * into v_loc from public.locacoes where chave_idempotencia = p_chave;
    if found then
      return public.resposta_locacao(v_loc, true);
    end if;
  end if;

  select * into v_orc from public.orcamentos where id = p_orcamento for update;
  if not found then
    perform public.erro('orcamento_nao_encontrado', 'Orçamento não encontrado.');
  end if;

  -- Um orçamento gera no máximo uma locação (reenvio não duplica).
  select * into v_loc from public.locacoes where orcamento_id = v_orc.id;
  if found then
    if v_loc.status in ('expirada', 'cancelada') then
      perform public.erro('orcamento_ja_utilizado',
        'A pré-reserva deste orçamento ' || case when v_loc.status = 'expirada' then 'expirou' else 'foi cancelada' end
        || '. É preciso gerar um novo orçamento.');
    end if;
    return public.resposta_locacao(v_loc, true);
  end if;

  if v_orc.status not in ('enviado', 'aceito') then
    perform public.erro('orcamento_invalido', 'Este orçamento não pode mais ser aceito.');
  end if;
  if v_orc.validade_ate < now() then
    perform public.erro('orcamento_vencido', 'O orçamento venceu. É preciso recalcular os valores.');
  end if;
  if v_orc.inicio < now() - interval '15 minutes' then
    perform public.erro('periodo_invalido', 'A data de início do orçamento já passou.');
  end if;

  perform public.expirar_pre_reservas();
  perform public.travar_equipamentos(array(select equipamento_id from public.orcamento_itens where orcamento_id = v_orc.id));

  insert into public.locacoes (
    cliente_id, orcamento_id, conversa_id, status, inicio, fim, modalidade, endereco_entrega,
    valor_itens, valor_frete, valor_total, regra, expira_em, chave_idempotencia, criado_por_tipo, criado_por
  ) values (
    v_orc.cliente_id, v_orc.id, v_orc.conversa_id, 'pre_reserva', v_orc.inicio, v_orc.fim, v_orc.modalidade,
    v_orc.endereco_entrega, v_orc.valor_itens, v_orc.valor_frete, v_orc.valor_total, v_orc.regra,
    now() + make_interval(mins => (public.config()).pre_reserva_minutos),
    p_chave, p_ator, case when p_ator = 'equipe' then auth.uid() end
  ) returning * into v_loc;

  insert into public.locacao_itens (locacao_id, equipamento_id, quantidade, valor_unitario, valor_total, explicacao)
  select v_loc.id, equipamento_id, quantidade, valor_unitario, valor_total, explicacao
  from public.orcamento_itens where orcamento_id = v_orc.id;

  for v_item in select equipamento_id, quantidade from public.orcamento_itens where orcamento_id = v_orc.id order by equipamento_id loop
    insert into public.alocacoes (unidade_id, tipo, locacao_id, periodo)
    select u.id, 'locacao', v_loc.id, tstzrange(v_orc.inicio, v_orc.fim, '[)')
    from public.unidades_livres(v_item.equipamento_id, v_orc.inicio, v_orc.fim) u
    limit v_item.quantidade;
    get diagnostics v_qtd = row_count;
    if v_qtd < v_item.quantidade then
      select nome into v_nome from public.equipamentos where id = v_item.equipamento_id;
      perform public.erro('indisponivel',
        'Não há ' || v_item.quantidade || ' unidade(s) de ' || v_nome || ' livres nesse período (livres: ' || v_qtd || ').');
    end if;
  end loop;

  update public.orcamentos set status = 'aceito' where id = v_orc.id;

  perform public.registrar_historico(p_ator, 'pre_reserva_criada', 'locacao', v_loc.id,
    jsonb_build_object('numero', v_loc.numero, 'orcamento', v_orc.numero, 'expira_em', v_loc.expira_em));

  return public.resposta_locacao(v_loc, false);
exception
  when exclusion_violation then
    -- última barreira: outra transação ocupou a unidade no mesmo instante
    perform public.erro('indisponivel', 'O equipamento acabou de ser reservado por outro pedido para esse período.');
end $$;

-- ---------------------------------------------------------------- aprovação humana
create or replace function public.aprovar_pre_reserva(p_locacao uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('aprovar_locacao');
  v_loc public.locacoes;
begin
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found then
    perform public.erro('locacao_nao_encontrada', 'Locação não encontrada.');
  end if;
  if v_loc.status = 'confirmada' then
    return public.resposta_locacao(v_loc, true);
  end if;
  if v_loc.status <> 'pre_reserva' then
    perform public.erro('status_invalido', 'Só é possível aprovar uma pré-reserva (status atual: ' || v_loc.status || ').');
  end if;
  if v_loc.expira_em <= now() then
    update public.locacoes set status = 'expirada' where id = v_loc.id;
    perform public.registrar_historico('sistema', 'pre_reserva_expirada', 'locacao', v_loc.id);
    return jsonb_build_object('ok', false, 'codigo', 'pre_reserva_expirada',
      'mensagem', 'A pré-reserva expirou antes da aprovação e as unidades foram liberadas. Gere um novo orçamento.');
  end if;
  if exists (
    select 1 from public.alocacoes a join public.unidades u on u.id = a.unidade_id
    where a.locacao_id = v_loc.id and a.ativo and u.condicao <> 'ativa'
  ) then
    perform public.erro('unidade_indisponivel', 'Uma unidade reservada saiu de operação. Realoque a unidade antes de aprovar.');
  end if;

  -- Mesma linha, mesmas alocações: a conversão não conflita consigo mesma.
  update public.locacoes set status = 'confirmada', aprovado_por = v_uid, aprovado_em = now()
  where id = v_loc.id returning * into v_loc;
  update public.orcamentos set status = 'convertido' where id = v_loc.orcamento_id;

  perform public.registrar_historico('equipe', 'locacao_aprovada', 'locacao', v_loc.id, jsonb_build_object('numero', v_loc.numero));
  return public.resposta_locacao(v_loc, false);
end $$;

create or replace function public.cancelar_locacao(p_locacao uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_loc public.locacoes;
begin
  perform public.exigir_permissao('aprovar_locacao');
  if coalesce(trim(p_motivo), '') = '' then
    perform public.erro('motivo_obrigatorio', 'Informe o motivo do cancelamento.');
  end if;
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found then
    perform public.erro('locacao_nao_encontrada', 'Locação não encontrada.');
  end if;
  if v_loc.status = 'cancelada' then
    return public.resposta_locacao(v_loc, true);
  end if;
  if v_loc.status not in ('pre_reserva', 'confirmada') then
    perform public.erro('status_invalido', 'Não é possível cancelar uma locação com status ' || v_loc.status || '.');
  end if;
  update public.locacoes set status = 'cancelada', motivo_cancelamento = left(p_motivo, 500)
  where id = v_loc.id returning * into v_loc;
  update public.orcamentos set status = 'recusado' where id = v_loc.orcamento_id and status in ('enviado', 'aceito');
  perform public.registrar_historico('equipe', 'locacao_cancelada', 'locacao', v_loc.id, jsonb_build_object('motivo', left(p_motivo, 200)));
  return public.resposta_locacao(v_loc, false);
end $$;

-- Troca uma unidade de uma reserva ainda não retirada (ex.: a anterior está atrasada com outro cliente).
create or replace function public.realocar_unidade(p_locacao uuid, p_unidade uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_loc public.locacoes;
  v_aloc public.alocacoes;
  v_eq uuid;
  v_nova uuid;
begin
  perform public.exigir_permissao('aprovar_locacao');
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found or v_loc.status not in ('pre_reserva', 'confirmada') then
    perform public.erro('status_invalido', 'Só é possível realocar reservas ainda não retiradas.');
  end if;
  select * into v_aloc from public.alocacoes where locacao_id = v_loc.id and unidade_id = p_unidade and ativo for update;
  if not found then
    perform public.erro('unidade_nao_alocada', 'Essa unidade não pertence a esta reserva.');
  end if;
  select equipamento_id into v_eq from public.unidades where id = p_unidade;
  perform public.expirar_pre_reservas();
  perform public.travar_equipamentos(array[v_eq]);
  select id into v_nova from public.unidades_livres(v_eq, v_loc.inicio, v_loc.fim) limit 1;
  if v_nova is null then
    perform public.erro('indisponivel', 'Não há outra unidade livre desse equipamento no período.');
  end if;
  update public.alocacoes set ativo = false where id = v_aloc.id;
  insert into public.alocacoes (unidade_id, tipo, locacao_id, periodo) values (v_nova, 'locacao', v_loc.id, v_aloc.periodo);
  perform public.registrar_historico('equipe', 'unidade_realocada', 'locacao', v_loc.id,
    jsonb_build_object('de', p_unidade, 'para', v_nova));
  return jsonb_build_object('ok', true, 'unidade_anterior', p_unidade, 'unidade_nova', v_nova);
exception when exclusion_violation then
  perform public.erro('indisponivel', 'A unidade acabou de ser ocupada. Tente novamente.');
end $$;

-- ---------------------------------------------------------------- retirada e devolução
create or replace function public.validar_checklist(p jsonb) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    perform public.erro('checklist_obrigatorio', 'Preencha o checklist.');
  end if;
  if exists (
    select 1 from jsonb_array_elements(p) x
    where jsonb_typeof(x) <> 'object' or coalesce(x->>'item', '') = '' or jsonb_typeof(x->'ok') <> 'boolean'
  ) then
    perform public.erro('checklist_invalido', 'Cada item do checklist precisa de "item" e "ok".');
  end if;
end $$;

create or replace function public.registrar_retirada(p_locacao uuid, p_checklist jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('registrar_retirada');
  v_loc public.locacoes;
  v_bloqueio record;
begin
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found then
    perform public.erro('locacao_nao_encontrada', 'Locação não encontrada.');
  end if;
  if v_loc.status = 'em_andamento' then
    return public.resposta_locacao(v_loc, true);
  end if;
  if v_loc.status <> 'confirmada' then
    perform public.erro('status_invalido', 'A retirada exige locação aprovada (status atual: ' || v_loc.status || ').');
  end if;
  perform public.validar_checklist(p_checklist);

  -- Unidade ainda com outro cliente (atraso) ou fora de operação?
  select u.codigo, o.numero as outra into v_bloqueio
  from public.alocacoes a
  join public.unidades u on u.id = a.unidade_id
  left join public.alocacoes a2 on a2.unidade_id = a.unidade_id and a2.ativo and a2.locacao_id <> v_loc.id
  left join public.locacoes o on o.id = a2.locacao_id and o.status = 'em_andamento'
  where a.locacao_id = v_loc.id and a.ativo and (u.condicao <> 'ativa' or o.id is not null)
  limit 1;
  if found then
    perform public.erro('unidade_ocupada',
      'A unidade ' || v_bloqueio.codigo || coalesce(' ainda está na locação #' || v_bloqueio.outra, ' está fora de operação')
      || '. Realoque a unidade antes da retirada.');
  end if;

  insert into public.vistorias (locacao_id, tipo, checklist, observacoes, realizado_por)
  values (v_loc.id, 'retirada', p_checklist, left(p_observacoes, 2000), v_uid);
  update public.locacoes set status = 'em_andamento', retirado_em = now() where id = v_loc.id returning * into v_loc;
  perform public.registrar_historico('equipe', 'retirada_registrada', 'locacao', v_loc.id);
  return public.resposta_locacao(v_loc, false);
end $$;

create or replace function public.registrar_devolucao(
  p_locacao uuid, p_checklist jsonb, p_observacoes text default null, p_unidades_manutencao uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('registrar_devolucao');
  v_loc public.locacoes;
  v_atraso interval;
begin
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found then
    perform public.erro('locacao_nao_encontrada', 'Locação não encontrada.');
  end if;
  if v_loc.status = 'devolvida' then
    return public.resposta_locacao(v_loc, true);
  end if;
  if v_loc.status <> 'em_andamento' then
    perform public.erro('status_invalido', 'A devolução exige equipamento retirado (status atual: ' || v_loc.status || ').');
  end if;
  perform public.validar_checklist(p_checklist);
  if exists (
    select 1 from unnest(coalesce(p_unidades_manutencao, '{}')) x
    where not exists (select 1 from public.alocacoes a where a.locacao_id = v_loc.id and a.unidade_id = x)
  ) then
    perform public.erro('unidade_nao_alocada', 'Unidade marcada para manutenção não pertence a esta locação.');
  end if;

  insert into public.vistorias (locacao_id, tipo, checklist, observacoes, realizado_por)
  values (v_loc.id, 'devolucao', p_checklist, left(p_observacoes, 2000), v_uid);
  update public.locacoes set status = 'devolvida', devolvido_em = now() where id = v_loc.id returning * into v_loc;

  update public.unidades set condicao = 'manutencao',
    observacoes = 'Devolvida com avaria na locação #' || v_loc.numero
  where id = any(coalesce(p_unidades_manutencao, '{}'));

  v_atraso := greatest(now() - v_loc.fim, interval '0');
  perform public.registrar_historico('equipe', 'devolucao_registrada', 'locacao', v_loc.id,
    jsonb_build_object('atraso_horas', floor(extract(epoch from v_atraso) / 3600),
                       'unidades_manutencao', coalesce(p_unidades_manutencao, '{}')));
  return public.resposta_locacao(v_loc, false) || jsonb_build_object(
    'atrasada', v_atraso > interval '0',
    'atraso_horas', floor(extract(epoch from v_atraso) / 3600),
    -- não existe regra comercial de multa: fica com a equipe
    'cobranca_atraso', case when v_atraso > interval '0' then 'a definir pela equipe' end
  );
end $$;

-- ---------------------------------------------------------------- financeiro manual
create or replace function public.definir_frete(p_locacao uuid, p_valor numeric) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_loc public.locacoes;
begin
  perform public.exigir_permissao('orcamentos');
  if p_valor is null or p_valor < 0 then
    perform public.erro('valor_invalido', 'Valor de frete inválido.');
  end if;
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found or v_loc.status not in ('pre_reserva', 'confirmada', 'em_andamento') then
    perform public.erro('status_invalido', 'Não é possível alterar o frete desta locação.');
  end if;
  update public.locacoes set valor_frete = round(p_valor, 2), valor_total = valor_itens + round(p_valor, 2)
  where id = v_loc.id returning * into v_loc;
  perform public.registrar_historico('equipe', 'frete_definido', 'locacao', v_loc.id, jsonb_build_object('valor', p_valor));
  return public.resposta_locacao(v_loc, false);
end $$;

create or replace function public.registrar_recebimento(
  p_locacao uuid, p_valor numeric, p_forma text, p_observacao text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('registrar_pagamento');
  v_loc public.locacoes;
  v_recebido numeric;
  v_id uuid;
begin
  select * into v_loc from public.locacoes where id = p_locacao for update;
  if not found or v_loc.status in ('expirada', 'cancelada') then
    perform public.erro('status_invalido', 'Não é possível registrar recebimento nesta locação.');
  end if;
  if p_valor is null or p_valor <= 0 then
    perform public.erro('valor_invalido', 'Informe um valor maior que zero.');
  end if;
  select coalesce(sum(valor), 0) into v_recebido from public.recebimentos where locacao_id = v_loc.id;
  if v_recebido + p_valor > v_loc.valor_total then
    perform public.erro('valor_acima_do_saldo', 'O valor passa do saldo em aberto (' || public.formatar_brl(v_loc.valor_total - v_recebido) || ').');
  end if;
  insert into public.recebimentos (locacao_id, valor, forma, observacao, registrado_por)
  values (v_loc.id, round(p_valor, 2), p_forma, left(p_observacao, 500), v_uid) returning id into v_id;
  perform public.registrar_historico('equipe', 'recebimento_registrado', 'locacao', v_loc.id,
    jsonb_build_object('valor', p_valor, 'forma', p_forma));
  return jsonb_build_object('ok', true, 'recebimento_id', v_id, 'saldo', v_loc.valor_total - v_recebido - round(p_valor, 2));
end $$;

-- ---------------------------------------------------------------- manutenção
create or replace function public.agendar_manutencao(p_unidade uuid, p_inicio timestamptz, p_fim timestamptz, p_motivo text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_eq uuid;
begin
  perform public.exigir_permissao('manutencao');
  if p_fim <= p_inicio then
    perform public.erro('periodo_invalido', 'O fim da manutenção precisa ser depois do início.');
  end if;
  select equipamento_id into v_eq from public.unidades where id = p_unidade;
  if v_eq is null then
    perform public.erro('unidade_nao_encontrada', 'Unidade não encontrada.');
  end if;
  perform public.expirar_pre_reservas();
  perform public.travar_equipamentos(array[v_eq]);
  insert into public.alocacoes (unidade_id, tipo, periodo, motivo)
  values (p_unidade, 'manutencao', tstzrange(p_inicio, p_fim, '[)'), left(p_motivo, 500)) returning id into v_id;
  perform public.registrar_historico('equipe', 'manutencao_agendada', 'unidade', p_unidade, jsonb_build_object('alocacao', v_id));
  return jsonb_build_object('ok', true, 'alocacao_id', v_id);
exception when exclusion_violation then
  perform public.erro('conflito', 'A unidade tem reserva ou locação nesse período.');
end $$;

create or replace function public.encerrar_manutencao(p_alocacao uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_unidade uuid;
begin
  perform public.exigir_permissao('manutencao');
  update public.alocacoes set ativo = false where id = p_alocacao and tipo = 'manutencao' and ativo returning unidade_id into v_unidade;
  if v_unidade is null then
    perform public.erro('manutencao_nao_encontrada', 'Manutenção ativa não encontrada.');
  end if;
  perform public.registrar_historico('equipe', 'manutencao_encerrada', 'unidade', v_unidade);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.alterar_condicao_unidade(p_unidade uuid, p_condicao public.condicao_unidade, p_observacao text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('manutencao');
  update public.unidades set condicao = p_condicao, observacoes = coalesce(left(p_observacao, 500), observacoes) where id = p_unidade;
  if not found then
    perform public.erro('unidade_nao_encontrada', 'Unidade não encontrada.');
  end if;
  perform public.registrar_historico('equipe', 'condicao_unidade_alterada', 'unidade', p_unidade, jsonb_build_object('condicao', p_condicao));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- versões para a equipe (app)
create or replace function public.consultar_disponibilidade(p_equipamento uuid, p_inicio timestamptz, p_fim timestamptz, p_quantidade int default 1)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.e_equipe() then perform public.erro('sem_permissao', 'Acesso restrito à equipe.'); end if;
  return public.consultar_disponibilidade_interno(p_equipamento, p_inicio, p_fim, p_quantidade);
end $$;

create or replace function public.calcular_orcamento(p_itens jsonb, p_inicio timestamptz, p_fim timestamptz, p_modalidade public.modalidade_entrega)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.e_equipe() then perform public.erro('sem_permissao', 'Acesso restrito à equipe.'); end if;
  return public.calcular_orcamento_interno(p_itens, p_inicio, p_fim, p_modalidade);
end $$;

create or replace function public.salvar_orcamento(
  p_cliente uuid, p_itens jsonb, p_inicio timestamptz, p_fim timestamptz,
  p_modalidade public.modalidade_entrega, p_endereco text default null, p_chave text default null, p_conversa uuid default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('orcamentos');
  return public.salvar_orcamento_interno(p_cliente, p_conversa, p_itens, p_inicio, p_fim, p_modalidade, p_endereco, p_chave, 'equipe');
end $$;

create or replace function public.criar_pre_reserva(p_orcamento uuid, p_chave text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('orcamentos');
  return public.criar_pre_reserva_interno(p_orcamento, p_chave, 'equipe');
end $$;

-- ---------------------------------------------------------------- visões (respeitam RLS de quem consulta)
create view public.v_unidades_situacao with (security_invoker = true) as
select
  u.id as unidade_id, u.codigo, u.equipamento_id, e.nome as equipamento, u.condicao,
  case
    when u.condicao = 'baixada' then 'baixada'
    when u.condicao = 'manutencao' then 'manutencao'
    when exists (select 1 from public.alocacoes a where a.unidade_id = u.id and a.ativo and a.tipo = 'manutencao' and a.periodo @> now()) then 'manutencao'
    when exists (select 1 from public.alocacoes a join public.locacoes l on l.id = a.locacao_id
                 where a.unidade_id = u.id and a.ativo and l.status = 'em_andamento') then 'alugado'
    when exists (select 1 from public.alocacoes a join public.locacoes l on l.id = a.locacao_id
                 where a.unidade_id = u.id and a.ativo and a.periodo @> now()
                   and (l.status = 'confirmada' or (l.status = 'pre_reserva' and l.expira_em > now()))) then 'reservado'
    else 'disponivel'
  end as situacao,
  (select min(lower(a.periodo)) from public.alocacoes a join public.locacoes l on l.id = a.locacao_id
    where a.unidade_id = u.id and a.ativo and lower(a.periodo) > now()
      and (l.status = 'confirmada' or (l.status = 'pre_reserva' and l.expira_em > now()))) as proxima_reserva_em
from public.unidades u
join public.equipamentos e on e.id = u.equipamento_id;

create view public.v_locacoes_resumo with (security_invoker = true) as
select
  l.id, l.numero, l.status, l.cliente_id, c.nome as cliente, l.inicio, l.fim, l.modalidade,
  l.valor_itens, l.valor_frete, l.valor_total, l.expira_em, l.criado_por_tipo, l.conversa_id, l.orcamento_id,
  coalesce(r.recebido, 0) as recebido,
  l.valor_total - coalesce(r.recebido, 0) as saldo,
  (l.status = 'em_andamento' and l.fim < now()) as atrasada,
  (select string_agg(li.quantidade || '× ' || e.nome, ', ' order by e.nome)
     from public.locacao_itens li join public.equipamentos e on e.id = li.equipamento_id
    where li.locacao_id = l.id) as itens
from public.locacoes l
join public.clientes c on c.id = l.cliente_id
left join (select locacao_id, sum(valor) as recebido from public.recebimentos group by locacao_id) r on r.locacao_id = l.id;

-- Reservas ainda não retiradas cuja unidade está com outro cliente ou fora de operação.
create view public.v_reservas_em_risco with (security_invoker = true) as
select
  l.id as locacao_id, l.numero, l.inicio, u.id as unidade_id, u.codigo as unidade,
  case when u.condicao <> 'ativa' then 'unidade_fora_de_operacao' else 'unidade_com_outro_cliente' end as motivo,
  o.numero as locacao_bloqueadora, o.fim as devolucao_prevista_bloqueadora
from public.locacoes l
join public.alocacoes a on a.locacao_id = l.id and a.ativo
join public.unidades u on u.id = a.unidade_id
left join lateral (
  select ol.numero, ol.fim from public.alocacoes a2
  join public.locacoes ol on ol.id = a2.locacao_id
  where a2.unidade_id = a.unidade_id and a2.ativo and ol.id <> l.id and ol.status = 'em_andamento'
    -- atrasada (ainda não voltou) ou com devolução prevista depois do início desta reserva
    and (ol.fim < now() or ol.fim > lower(a.periodo))
  limit 1
) o on true
where (l.status = 'confirmada' or (l.status = 'pre_reserva' and l.expira_em > now()))
  and (u.condicao <> 'ativa' or o.numero is not null);
