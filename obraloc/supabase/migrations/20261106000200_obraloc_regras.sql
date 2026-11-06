-- ObraLoc — regras: permissões, histórico, cobrança e disponibilidade.

-- ---------------------------------------------------------------- utilidades
create or replace function public.formatar_brl(v numeric) returns text
language sql immutable set search_path = public, pg_temp as $$
  select 'R$ ' || translate(to_char(round(v, 2), 'FM999,999,990.00'), ',.', '.,')
$$;

create or replace function public.config() returns public.configuracoes
language sql stable security definer set search_path = public, pg_temp as $$
  select * from public.configuracoes where id
$$;

-- Erro de negócio com código legível pelo app e pelo assistente.
create or replace function public.erro(codigo text, mensagem text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using errcode = 'P0001', message = codigo, detail = mensagem;
end $$;

-- ---------------------------------------------------------------- permissões
create or replace function public.e_equipe() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.perfis where user_id = auth.uid() and ativo)
$$;

create or replace function public.tem_permissao(p text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.perfis pf
    join public.permissoes_papel pp on pp.papel = pf.papel
    where pf.user_id = auth.uid() and pf.ativo and pp.permissao = p
  )
$$;

create or replace function public.exigir_permissao(p text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.tem_permissao(p) then
    perform public.erro('sem_permissao', 'Você não tem permissão para esta ação (' || p || ').');
  end if;
  return auth.uid();
end $$;

-- ---------------------------------------------------------------- histórico
create or replace function public.registrar_historico(
  p_ator_tipo public.tipo_ator, p_acao text, p_entidade text, p_entidade_id uuid, p_dados jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.historico (ator_tipo, ator_id, acao, entidade, entidade_id, dados)
  values (p_ator_tipo, case when p_ator_tipo = 'equipe' then auth.uid() end, p_acao, p_entidade, p_entidade_id, coalesce(p_dados, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------- cobrança
create or replace function public.regra_padrao() returns public.regras_cobranca
language sql stable security definer set search_path = public, pg_temp as $$
  select r.* from public.regras_cobranca r
  join public.configuracoes c on c.regra_cobranca_id = r.id
  where c.id and r.ativa
$$;

-- Quantos dias serão cobrados no período, segundo a regra.
create or replace function public.contar_dias(p_inicio timestamptz, p_fim timestamptz, p_regra public.regras_cobranca)
returns int
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_fuso text := coalesce((public.config()).fuso_horario, 'America/Sao_Paulo');
  v_dias int;
begin
  if p_fim <= p_inicio then
    return null;
  end if;
  if p_regra.contagem = 'periodos_24h' then
    v_dias := ceil(extract(epoch from (p_fim - p_inicio)) / 86400.0)::int;
  else
    v_dias := ((p_fim - interval '1 microsecond') at time zone v_fuso)::date - (p_inicio at time zone v_fuso)::date + 1;
  end if;
  return greatest(v_dias, p_regra.minimo_dias);
end $$;

create or replace function public.nome_periodo(d int) returns text
language sql immutable as $$
  select case d when 1 then 'diária' when 7 then 'semana' when 15 then 'quinzena' when 30 then 'mês'
                else d || ' dias' end
$$;

-- Preço de UMA unidade de um equipamento por N dias, com explicação legível.
-- Erro 'sem_preco' quando a tabela não tem o necessário: nunca inventa valor.
create or replace function public.calcular_preco_unidade(p_equipamento uuid, p_dias int, p_regra public.regras_cobranca)
returns table (valor numeric, explicacao text)
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_diaria numeric;
  v_pac_dias int[];
  v_pac_valor numeric[];
  v_max int;
  v_n int;
  v_custo numeric[];
  v_escolha int[];
  v_melhor_k int;
  v_melhor numeric;
  k int; i int; c numeric;
  v_qtd int[];
  v_partes text[] := '{}';
begin
  if p_dias is null or p_dias < 1 then
    perform public.erro('periodo_invalido', 'Período inválido.');
  end if;

  if p_regra.metodo = 'diaria' then
    select ep.valor into v_diaria from public.equipamento_precos ep where ep.equipamento_id = p_equipamento and ep.dias = 1;
    if v_diaria is null then
      perform public.erro('sem_preco', 'Equipamento sem preço de diária cadastrado.');
    end if;
    valor := round(v_diaria * p_dias, 2);
    explicacao := p_dias || ' × diária (' || public.formatar_brl(v_diaria) || ')';
    return next;
    return;
  end if;

  -- método 'pacotes': menor custo combinando os períodos da tabela (pode cobrir mais dias
  -- que o pedido se isso sair mais barato, como "cobrar a semana").
  select array_agg(ep.dias order by ep.dias), array_agg(ep.valor order by ep.dias)
    into v_pac_dias, v_pac_valor
  from public.equipamento_precos ep where ep.equipamento_id = p_equipamento;

  if v_pac_dias is null then
    perform public.erro('sem_preco', 'Equipamento sem tabela de preços cadastrada.');
  end if;

  v_max := v_pac_dias[array_length(v_pac_dias, 1)];
  v_n := p_dias + v_max;
  v_custo := array_fill(null::numeric, array[v_n + 1], array[0]);
  v_escolha := array_fill(null::int, array[v_n + 1], array[0]);
  v_custo[0] := 0;

  for k in 1..v_n loop
    for i in 1..array_length(v_pac_dias, 1) loop
      if v_pac_dias[i] <= k and v_custo[k - v_pac_dias[i]] is not null then
        c := v_custo[k - v_pac_dias[i]] + v_pac_valor[i];
        if v_custo[k] is null or c < v_custo[k] then
          v_custo[k] := c;
          v_escolha[k] := i;
        end if;
      end if;
    end loop;
  end loop;

  for k in p_dias..v_n loop
    if v_custo[k] is not null and (v_melhor is null or v_custo[k] < v_melhor) then
      v_melhor := v_custo[k];
      v_melhor_k := k;
    end if;
  end loop;

  if v_melhor is null then
    perform public.erro('sem_preco', 'Não há combinação de preços para este período.');
  end if;

  v_qtd := array_fill(0, array[array_length(v_pac_dias, 1)]);
  k := v_melhor_k;
  while k > 0 loop
    i := v_escolha[k];
    v_qtd[i] := v_qtd[i] + 1;
    k := k - v_pac_dias[i];
  end loop;

  for i in reverse array_length(v_pac_dias, 1)..1 loop
    if v_qtd[i] > 0 then
      v_partes := v_partes || (v_qtd[i] || ' × ' || public.nome_periodo(v_pac_dias[i]) || ' (' || public.formatar_brl(v_pac_valor[i]) || ')');
    end if;
  end loop;

  valor := round(v_melhor, 2);
  explicacao := array_to_string(v_partes, ' + ');
  if v_melhor_k > p_dias then
    explicacao := explicacao || ' — cobre ' || v_melhor_k || ' dias; sai mais barato que ' || p_dias || ' dias avulsos';
  end if;
  return next;
end $$;

-- ---------------------------------------------------------------- disponibilidade
-- Uma alocação bloqueia a unidade quando:
--   * é manutenção ativa;
--   * é de locação confirmada ou em andamento;
--   * é de pré-reserva ainda não vencida.
-- Locação em andamento e ATRASADA continua bloqueando até agora + atraso_bloqueio_horas,
-- porque o equipamento ainda não voltou.
create or replace function public.periodo_bloqueio(a public.alocacoes, l public.locacoes)
returns tstzrange
language sql stable set search_path = public, pg_temp as $$
  select case
    when not a.ativo then null
    when a.tipo = 'manutencao' then a.periodo
    when l.status = 'em_andamento' and upper(a.periodo) < now() then
      tstzrange(lower(a.periodo), now() + make_interval(hours => (public.config()).atraso_bloqueio_horas), '[)')
    when l.status in ('confirmada', 'em_andamento') then a.periodo
    when l.status = 'pre_reserva' and l.expira_em > now() then a.periodo
    else null
  end
$$;

-- Unidades livres de um equipamento num período.
create or replace function public.unidades_livres(
  p_equipamento uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar_locacao uuid default null
) returns setof public.unidades
language sql stable security definer set search_path = public, pg_temp as $$
  select u.* from public.unidades u
  where u.equipamento_id = p_equipamento
    and u.condicao = 'ativa'
    and not exists (
      select 1
      from public.alocacoes a
      left join public.locacoes l on l.id = a.locacao_id
      where a.unidade_id = u.id
        and a.ativo
        and (p_ignorar_locacao is null or a.locacao_id is distinct from p_ignorar_locacao)
        and public.periodo_bloqueio(a, l) && tstzrange(p_inicio, p_fim, '[)')
    )
  -- Prefere unidades que estão na loja: uma unidade ainda com outro cliente só é usada
  -- se não houver alternativa (se esse cliente atrasar, a reserva fica em risco).
  order by exists (
      select 1 from public.alocacoes a join public.locacoes l on l.id = a.locacao_id
      where a.unidade_id = u.id and a.ativo and l.status = 'em_andamento'
    ), u.codigo
$$;

-- Validação comum de período pedido por cliente/assistente.
create or replace function public.validar_periodo(p_inicio timestamptz, p_fim timestamptz) returns void
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_cfg public.configuracoes := public.config();
begin
  if p_inicio is null or p_fim is null then
    perform public.erro('periodo_invalido', 'Informe a data de início e a de devolução.');
  end if;
  if p_fim <= p_inicio then
    perform public.erro('periodo_invalido', 'A devolução precisa ser depois da retirada.');
  end if;
  if p_inicio < now() - interval '15 minutes' then
    perform public.erro('periodo_invalido', 'A data de início já passou.');
  end if;
  if p_fim - p_inicio > make_interval(days => v_cfg.periodo_maximo_dias) then
    perform public.erro('periodo_invalido', 'Período acima do máximo de ' || v_cfg.periodo_maximo_dias || ' dias. Fale com a equipe.');
  end if;
end $$;

create or replace function public.consultar_disponibilidade_interno(
  p_equipamento uuid, p_inicio timestamptz, p_fim timestamptz, p_quantidade int default 1
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eq public.equipamentos;
  v_total int;
  v_livres int;
begin
  perform public.validar_periodo(p_inicio, p_fim);
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100 then
    perform public.erro('quantidade_invalida', 'Quantidade inválida.');
  end if;
  select * into v_eq from public.equipamentos where id = p_equipamento and ativo;
  if not found then
    perform public.erro('equipamento_nao_encontrado', 'Equipamento não encontrado no catálogo.');
  end if;
  select count(*) into v_total from public.unidades where equipamento_id = p_equipamento and condicao = 'ativa';
  select count(*) into v_livres from public.unidades_livres(p_equipamento, p_inicio, p_fim);
  return jsonb_build_object(
    'equipamento_id', v_eq.id,
    'equipamento', v_eq.nome,
    'inicio', p_inicio,
    'fim', p_fim,
    'quantidade_pedida', p_quantidade,
    'unidades_ativas', v_total,
    'disponiveis', v_livres,
    'suficiente', v_livres >= p_quantidade
  );
end $$;

-- Calcula um orçamento SEM gravar. Itens: [{"equipamento_id": "...", "quantidade": 2}, …]
create or replace function public.calcular_orcamento_interno(
  p_itens jsonb, p_inicio timestamptz, p_fim timestamptz, p_modalidade public.modalidade_entrega
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_regra public.regras_cobranca := public.regra_padrao();
  v_dias int;
  v_item jsonb;
  v_eq public.equipamentos;
  v_qtd int;
  v_preco record;
  v_livres int;
  v_linhas jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_tudo_disponivel boolean := true;
begin
  if v_regra.id is null then
    perform public.erro('sem_regra_cobranca', 'Nenhuma regra de cobrança ativa configurada.');
  end if;
  perform public.validar_periodo(p_inicio, p_fim);
  if p_modalidade is null then
    perform public.erro('modalidade_invalida', 'Informe se é retirada na loja ou entrega na obra.');
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    perform public.erro('itens_invalidos', 'Informe ao menos um equipamento.');
  end if;
  if jsonb_array_length(p_itens) > 20 then
    perform public.erro('itens_invalidos', 'Muitos itens num só orçamento. Fale com a equipe.');
  end if;
  if (select count(distinct x->>'equipamento_id') from jsonb_array_elements(p_itens) x) <> jsonb_array_length(p_itens) then
    perform public.erro('itens_invalidos', 'Equipamento repetido no orçamento.');
  end if;

  v_dias := public.contar_dias(p_inicio, p_fim, v_regra);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    begin
      v_qtd := (v_item->>'quantidade')::int;
      select * into v_eq from public.equipamentos where id = (v_item->>'equipamento_id')::uuid and ativo;
    exception when invalid_text_representation then
      perform public.erro('itens_invalidos', 'Item de orçamento inválido.');
    end;
    if v_eq.id is null then
      perform public.erro('equipamento_nao_encontrado', 'Equipamento não encontrado no catálogo.');
    end if;
    if v_qtd is null or v_qtd < 1 or v_qtd > 100 then
      perform public.erro('quantidade_invalida', 'Quantidade inválida para ' || v_eq.nome || '.');
    end if;

    select * into v_preco from public.calcular_preco_unidade(v_eq.id, v_dias, v_regra);
    select count(*) into v_livres from public.unidades_livres(v_eq.id, p_inicio, p_fim);
    if v_livres < v_qtd then
      v_tudo_disponivel := false;
    end if;

    v_linhas := v_linhas || jsonb_build_object(
      'equipamento_id', v_eq.id,
      'equipamento', v_eq.nome,
      'quantidade', v_qtd,
      'valor_unitario', v_preco.valor,
      'valor_total', round(v_preco.valor * v_qtd, 2),
      'explicacao', v_preco.explicacao,
      'disponiveis', v_livres,
      'disponivel', v_livres >= v_qtd
    );
    v_subtotal := v_subtotal + round(v_preco.valor * v_qtd, 2);
    v_eq := null;
  end loop;

  return jsonb_build_object(
    'regra', jsonb_build_object(
      'id', v_regra.id, 'codigo', v_regra.codigo, 'nome', v_regra.nome,
      'metodo', v_regra.metodo, 'contagem', v_regra.contagem,
      'minimo_dias', v_regra.minimo_dias, 'descricao', v_regra.descricao,
      'demonstrativa', v_regra.demonstrativa
    ),
    'inicio', p_inicio,
    'fim', p_fim,
    'dias', v_dias,
    'modalidade', p_modalidade,
    'itens', v_linhas,
    'valor_itens', v_subtotal,
    -- Frete não tem regra definida: nunca é calculado automaticamente.
    'valor_frete', null,
    'observacao_frete', case when p_modalidade = 'entrega'
      then 'Valor da entrega a confirmar pela equipe.' else null end,
    'valor_total', v_subtotal,
    'tudo_disponivel', v_tudo_disponivel
  );
end $$;
