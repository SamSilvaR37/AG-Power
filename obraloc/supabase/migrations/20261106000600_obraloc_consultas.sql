-- ObraLoc — consultas agregadas usadas pelo app (painel, disponibilidade, ocupação).
-- Funções "invoker" respeitam o RLS de quem consulta; a de disponibilidade é "definer"
-- porque usa unidades_livres, e por isso confere se o usuário é da equipe.

create or replace function public.painel_resumo() returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'gerado_em', now(),
    'locacoes_ativas', (select count(*) from public.v_locacoes_resumo where status = 'em_andamento'),
    'atrasadas', coalesce((select jsonb_agg(jsonb_build_object(
        'locacao_id', id, 'numero', numero, 'cliente', cliente, 'fim', fim, 'itens', itens,
        'horas_atraso', floor(extract(epoch from now() - fim) / 3600)) order by fim)
      from public.v_locacoes_resumo where atrasada), '[]'::jsonb),
    'devolucoes_proximas', coalesce((select jsonb_agg(jsonb_build_object(
        'locacao_id', id, 'numero', numero, 'cliente', cliente, 'fim', fim, 'itens', itens) order by fim)
      from public.v_locacoes_resumo where status = 'em_andamento' and fim between now() and now() + interval '48 hours'), '[]'::jsonb),
    'retiradas_proximas', coalesce((select jsonb_agg(jsonb_build_object(
        'locacao_id', id, 'numero', numero, 'cliente', cliente, 'inicio', inicio, 'itens', itens, 'modalidade', modalidade) order by inicio)
      from public.v_locacoes_resumo where status = 'confirmada' and inicio < now() + interval '48 hours'), '[]'::jsonb),
    'pre_reservas', coalesce((select jsonb_agg(jsonb_build_object(
        'locacao_id', id, 'numero', numero, 'cliente', cliente, 'inicio', inicio, 'fim', fim, 'itens', itens,
        'expira_em', expira_em, 'valor_total', valor_total, 'origem', criado_por_tipo) order by expira_em)
      from public.v_locacoes_resumo where status = 'pre_reserva' and expira_em > now()), '[]'::jsonb),
    'em_risco', coalesce((select jsonb_agg(jsonb_build_object(
        'locacao_id', locacao_id, 'numero', numero, 'inicio', inicio, 'unidade', unidade, 'motivo', motivo,
        'locacao_bloqueadora', locacao_bloqueadora) order by inicio)
      from public.v_reservas_em_risco), '[]'::jsonb),
    'a_receber', jsonb_build_object(
      'total', coalesce((select sum(saldo) from public.v_locacoes_resumo
                         where status in ('confirmada', 'em_andamento', 'devolvida') and saldo > 0), 0),
      'locacoes', (select count(*) from public.v_locacoes_resumo
                   where status in ('confirmada', 'em_andamento', 'devolvida') and saldo > 0),
      'frete_a_definir', (select count(*) from public.locacoes
                          where modalidade = 'entrega' and valor_frete is null and status in ('pre_reserva', 'confirmada', 'em_andamento'))
    ),
    'disponibilidade_agora', coalesce((select jsonb_agg(x order by x->>'categoria', x->>'equipamento') from (
        select jsonb_build_object(
          'equipamento_id', v.equipamento_id, 'equipamento', v.equipamento, 'categoria', c.nome,
          'total', count(*) filter (where v.situacao <> 'baixada'),
          'disponivel', count(*) filter (where v.situacao = 'disponivel'),
          'reservado', count(*) filter (where v.situacao = 'reservado'),
          'alugado', count(*) filter (where v.situacao = 'alugado'),
          'manutencao', count(*) filter (where v.situacao = 'manutencao')) as x
        from public.v_unidades_situacao v
        join public.equipamentos e on e.id = v.equipamento_id
        join public.categorias c on c.id = e.categoria_id
        where e.ativo
        group by v.equipamento_id, v.equipamento, c.nome
      ) s), '[]'::jsonb),
    -- conversas só contam para quem pode atender (RLS de conversas)
    'conversas_aguardando', (select count(*) from public.conversas where modo = 'aguardando_equipe')
  )
$$;

-- Disponibilidade de todo o catálogo num período (tela "Disponibilidade").
create or replace function public.disponibilidade_periodo(p_inicio timestamptz, p_fim timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.e_equipe() then
    perform public.erro('sem_permissao', 'Acesso restrito à equipe.');
  end if;
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    perform public.erro('periodo_invalido', 'A devolução precisa ser depois da retirada.');
  end if;
  if p_fim - p_inicio > make_interval(days => (public.config()).periodo_maximo_dias) then
    perform public.erro('periodo_invalido', 'Período acima do máximo configurado.');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'equipamento_id', e.id, 'equipamento', e.nome, 'categoria', c.nome,
      'ativas', (select count(*) from public.unidades u where u.equipamento_id = e.id and u.condicao = 'ativa'),
      'livres', (select count(*) from public.unidades_livres(e.id, p_inicio, p_fim)),
      'diaria', (select valor from public.equipamento_precos p where p.equipamento_id = e.id and p.dias = 1)
    ) order by c.ordem, e.nome)
    from public.equipamentos e join public.categorias c on c.id = e.categoria_id
    where e.ativo
  ), '[]'::jsonb);
end $$;

-- Ocupação das unidades de um equipamento numa janela (linha do tempo).
-- Locação atrasada aparece estendida até o fim do bloqueio.
create or replace function public.ocupacao_equipamento(p_equipamento uuid, p_de timestamptz, p_ate timestamptz)
returns table (
  unidade_id uuid, unidade text, tipo public.tipo_alocacao, locacao_id uuid, numero int,
  status public.status_locacao, cliente text, inicio timestamptz, fim timestamptz, atrasada boolean, motivo text
)
language sql stable set search_path = public, pg_temp as $$
  select u.id, u.codigo, a.tipo, l.id, l.numero, l.status, c.nome,
         lower(public.periodo_bloqueio(a, l)), upper(public.periodo_bloqueio(a, l)),
         coalesce(l.status = 'em_andamento' and l.fim < now(), false), a.motivo
  from public.alocacoes a
  join public.unidades u on u.id = a.unidade_id
  left join public.locacoes l on l.id = a.locacao_id
  left join public.clientes c on c.id = l.cliente_id
  where u.equipamento_id = p_equipamento
    and public.periodo_bloqueio(a, l) && tstzrange(p_de, p_ate, '[)')
  order by u.codigo, lower(a.periodo)
$$;

revoke execute on function public.painel_resumo(), public.disponibilidade_periodo(timestamptz, timestamptz),
  public.ocupacao_equipamento(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.painel_resumo(), public.disponibilidade_periodo(timestamptz, timestamptz),
  public.ocupacao_equipamento(uuid, timestamptz, timestamptz) to authenticated, service_role;
