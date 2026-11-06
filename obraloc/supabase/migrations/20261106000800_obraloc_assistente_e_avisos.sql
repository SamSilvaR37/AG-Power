-- ObraLoc — ajustes para o assistente e avisos da equipe.

-- Busca do assistente devolve a relevância: com empate, o assistente pergunta qual
-- equipamento é, em vez de escolher sozinho.
create or replace function public.bot_buscar_equipamentos(p_texto text, p_limite int default 5) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_termos text[];
  v_res jsonb;
begin
  v_termos := array(
    select distinct t from regexp_split_to_table(public.normalizar_busca(left(p_texto, 200)), '[^a-z0-9]+') t
    where length(t) >= 3
  );
  if coalesce(array_length(v_termos, 1), 0) = 0 then
    return public.bot_falha('bot_buscar_equipamentos', 'busca_vazia', 'Diga qual equipamento procura.');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.relevancia desc, r.nome), '[]'::jsonb) into v_res from (
    select * from (
      select e.id, e.nome, c.nome as categoria, e.descricao,
        -- termo casa com o começo de uma palavra (aceita plural: "betoneiras" → "betoneira")
        (select count(*) from unnest(v_termos) t
          where exists (
            select 1 from regexp_split_to_table(public.normalizar_busca(e.nome || ' ' || coalesce(e.palavras_chave, '') || ' ' || c.nome), '[^a-z0-9]+') w
            where length(w) >= 3 and (w like t || '%' or t like w || '%')
          )) as relevancia,
        (select count(*) from public.unidades u where u.equipamento_id = e.id and u.condicao = 'ativa') as unidades_ativas
      from public.equipamentos e join public.categorias c on c.id = e.categoria_id
      where e.ativo
    ) x where x.relevancia > 0
    order by x.relevancia desc, x.nome
    limit least(greatest(p_limite, 1), 10)
  ) r;
  return jsonb_build_object('ok', true, 'resultados', v_res);
exception when others then
  return public.bot_falha('bot_buscar_equipamentos', 'falha_consulta', 'Não consegui consultar o catálogo agora.', sqlstate);
end $$;

-- A equipe avisa o cliente sobre uma locação (ex.: "locação aprovada") pela conversa de
-- WhatsApp ligada a ela, como mensagem 'sistema': não pausa o assistente.
create or replace function public.notificar_cliente_locacao(p_locacao uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('atender_conversas');
  v_loc public.locacoes;
  v_conv public.conversas;
  v_id uuid;
begin
  if coalesce(trim(p_texto), '') = '' then
    perform public.erro('mensagem_vazia', 'Escreva a mensagem.');
  end if;
  select * into v_loc from public.locacoes where id = p_locacao;
  if not found then
    perform public.erro('locacao_nao_encontrada', 'Locação não encontrada.');
  end if;
  select * into v_conv from public.conversas where id = v_loc.conversa_id;
  if not found then
    select * into v_conv from public.conversas where cliente_id = v_loc.cliente_id order by ultima_mensagem_em desc nulls last limit 1;
  end if;
  if v_conv.id is null then
    return jsonb_build_object('ok', false, 'codigo', 'sem_conversa', 'mensagem', 'Este cliente não tem conversa de WhatsApp.');
  end if;
  insert into public.mensagens (conversa_id, direcao, autor, provedor, corpo, estado, autor_id)
  values (v_conv.id, 'saida', 'sistema', v_conv.provedor, left(p_texto, 2000), 'pendente', v_uid)
  returning id into v_id;
  perform public.registrar_historico('equipe', 'cliente_notificado', 'locacao', v_loc.id, jsonb_build_object('conversa', v_conv.id));
  return jsonb_build_object('ok', true, 'mensagem_id', v_id, 'conversa_id', v_conv.id);
end $$;

revoke execute on function public.bot_buscar_equipamentos(text, int), public.notificar_cliente_locacao(uuid, text) from public, anon, authenticated;
grant execute on function public.bot_buscar_equipamentos(text, int) to obraloc_bot, service_role;
grant execute on function public.notificar_cliente_locacao(uuid, text) to authenticated, service_role;
