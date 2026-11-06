-- ObraLoc — atendimento por WhatsApp: entrada idempotente, fila de saída, pausa do bot
-- e as ferramentas que o assistente pode usar.
--
-- Papéis (criados na migração de segurança):
--   obraloc_integracao : servidor do webhook / despachante de mensagens
--   obraloc_bot        : servidor do assistente; só executa as funções bot_*
-- Nenhum dos dois lê ou grava tabelas diretamente.

-- ---------------------------------------------------------------- entrada (webhook)
-- p: {provedor, evento_id, chat_id, telefone, nome, mensagem_id, tipo, corpo, midia_url, recebido_em}
-- já normalizado pelo adaptador do provedor, depois de validar a assinatura do webhook.
create or replace function public.registrar_mensagem_recebida(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prov text := nullif(trim(p->>'provedor'), '');
  v_evento text := nullif(trim(p->>'evento_id'), '');
  v_msg_ext text := nullif(trim(p->>'mensagem_id'), '');
  v_tel text := regexp_replace(coalesce(p->>'telefone', ''), '[^0-9]', '', 'g');
  v_tipo text := coalesce(nullif(p->>'tipo', ''), 'texto');
  v_ev_id bigint;
  v_conv public.conversas;
  v_msg_id uuid;
  v_contato public.cliente_contatos;
begin
  if v_prov is null or v_evento is null or v_msg_ext is null or nullif(p->>'chat_id', '') is null then
    perform public.erro('evento_invalido', 'Evento sem provedor, evento_id, chat_id ou mensagem_id.');
  end if;
  if v_tel !~ '^[0-9]{10,15}$' then
    perform public.erro('evento_invalido', 'Telefone inválido no evento.');
  end if;
  if v_tipo not in ('texto', 'audio', 'imagem', 'documento', 'outro') then
    v_tipo := 'outro';
  end if;

  -- 1) deduplicação pelo id do evento
  insert into public.eventos_webhook (provedor, evento_id, tipo) values (v_prov, v_evento, 'mensagem')
  on conflict (provedor, evento_id) do nothing
  returning id into v_ev_id;
  if v_ev_id is null then
    return jsonb_build_object('ok', true, 'duplicado', true, 'motivo', 'evento_repetido');
  end if;

  -- 2) deduplicação pelo id da mensagem (provedor pode reenviar com outro evento)
  select id into v_msg_id from public.mensagens where provedor = v_prov and id_externo = v_msg_ext;
  if found then
    update public.eventos_webhook set processado_em = now(), resultado = 'mensagem_repetida' where id = v_ev_id;
    return jsonb_build_object('ok', true, 'duplicado', true, 'motivo', 'mensagem_repetida', 'mensagem_id', v_msg_id);
  end if;

  insert into public.conversas (provedor, chat_externo_id, telefone, nome_contato)
  values (v_prov, p->>'chat_id', v_tel, left(nullif(trim(p->>'nome'), ''), 120))
  on conflict (provedor, chat_externo_id) do update
    set nome_contato = coalesce(excluded.nome_contato, public.conversas.nome_contato)
  returning * into v_conv;

  -- vincula ao cliente quando o telefone já é de um contato cadastrado
  if v_conv.cliente_id is null then
    select * into v_contato from public.cliente_contatos where telefone = v_tel;
    if found then
      update public.conversas set cliente_id = v_contato.cliente_id, contato_id = v_contato.id
      where id = v_conv.id returning * into v_conv;
    end if;
  end if;

  begin
    insert into public.mensagens (conversa_id, direcao, autor, provedor, id_externo, tipo, corpo, midia_url,
                                  transcricao_estado, estado, criado_em)
    values (v_conv.id, 'entrada', 'cliente', v_prov, v_msg_ext, v_tipo, left(p->>'corpo', 4000),
            left(p->>'midia_url', 1000),
            case when v_tipo = 'audio' then 'pendente' else 'nao_aplica' end,
            'recebida', coalesce((p->>'recebido_em')::timestamptz, now()))
    returning id into v_msg_id;
  exception when unique_violation then
    update public.eventos_webhook set processado_em = now(), resultado = 'mensagem_repetida' where id = v_ev_id;
    return jsonb_build_object('ok', true, 'duplicado', true, 'motivo', 'mensagem_repetida');
  end;

  update public.conversas set ultima_mensagem_em = now(), nao_lidas = nao_lidas + 1
  where id = v_conv.id returning * into v_conv;
  update public.eventos_webhook set processado_em = now(), resultado = 'ok' where id = v_ev_id;

  return jsonb_build_object(
    'ok', true, 'duplicado', false,
    'conversa_id', v_conv.id, 'mensagem_id', v_msg_id,
    'modo', v_conv.modo, 'epoca_bot', v_conv.epoca_bot,
    'acionar_bot', v_conv.modo = 'bot'
  );
end $$;

-- Resultado da transcrição de áudio. Sem serviço configurado: estado 'indisponivel'.
create or replace function public.atualizar_transcricao(p_mensagem uuid, p_estado text, p_texto text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_estado not in ('indisponivel', 'concluida', 'falhou') then
    perform public.erro('estado_invalido', 'Estado de transcrição inválido.');
  end if;
  if p_estado = 'concluida' and coalesce(trim(p_texto), '') = '' then
    perform public.erro('estado_invalido', 'Transcrição concluída sem texto.');
  end if;
  update public.mensagens set transcricao_estado = p_estado,
    transcricao = case when p_estado = 'concluida' then left(p_texto, 4000) end
  where id = p_mensagem and tipo = 'audio';
  if not found then
    perform public.erro('mensagem_nao_encontrada', 'Mensagem de áudio não encontrada.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Confirmação de entrega/leitura vinda do provedor.
create or replace function public.registrar_status_entrega(p_provedor text, p_evento_id text, p_id_externo text, p_estado public.status_mensagem)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ev bigint;
begin
  if p_estado not in ('entregue', 'lida', 'falhou') then
    perform public.erro('estado_invalido', 'Status de entrega inválido.');
  end if;
  insert into public.eventos_webhook (provedor, evento_id, tipo) values (p_provedor, p_evento_id, 'status')
  on conflict do nothing returning id into v_ev;
  if v_ev is null then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;
  -- nunca regride (lida não volta para entregue)
  update public.mensagens set estado = p_estado
  where provedor = p_provedor and id_externo = p_id_externo and direcao = 'saida'
    and (case estado when 'enviada' then 1 when 'entregue' then 2 when 'lida' then 3 else 0 end)
      < (case p_estado when 'entregue' then 2 when 'lida' then 3 else 9 end)
    and estado <> 'lida';
  update public.eventos_webhook set processado_em = now(), resultado = 'ok' where id = v_ev;
  return jsonb_build_object('ok', true, 'duplicado', false);
end $$;

create or replace function public.atualizar_conexao(p_provedor text, p_estado text, p_erro text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.conexoes_whatsapp (provedor, estado, ultimo_erro, atualizado_em)
  values (p_provedor, p_estado, left(p_erro, 300), now())
  on conflict (provedor) do update set estado = excluded.estado, ultimo_erro = excluded.ultimo_erro, atualizado_em = now();
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- saída (fila)
create or replace function public.mensagens_para_envio(p_limite int default 20)
returns table (mensagem_id uuid, conversa_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id, m.conversa_id from public.mensagens m
  where m.direcao = 'saida' and m.estado = 'pendente'
  order by m.criado_em limit least(greatest(p_limite, 1), 100)
$$;

-- O despachante chama antes de entregar ao provedor. Mensagem do bot cuja conversa foi
-- assumida pela equipe (ou cuja época mudou) é cancelada aqui e não sai.
create or replace function public.reservar_envio(p_mensagem uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_msg public.mensagens;
  v_conv public.conversas;
begin
  select * into v_msg from public.mensagens where id = p_mensagem and direcao = 'saida' for update;
  if not found then
    perform public.erro('mensagem_nao_encontrada', 'Mensagem não encontrada.');
  end if;
  select * into v_conv from public.conversas where id = v_msg.conversa_id for update;
  if v_msg.estado <> 'pendente' then
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'estado_' || v_msg.estado);
  end if;
  if v_msg.autor = 'bot' and (v_conv.modo <> 'bot' or v_conv.epoca_bot <> v_msg.epoca_bot) then
    update public.mensagens set estado = 'cancelada', erro = 'Cancelada: o assistente foi pausado.' where id = v_msg.id;
    return jsonb_build_object('ok', true, 'enviar', false, 'motivo', 'bot_pausado');
  end if;
  update public.mensagens set estado = 'enviando', tentativas = tentativas + 1 where id = v_msg.id;
  return jsonb_build_object('ok', true, 'enviar', true, 'provedor', v_conv.provedor,
    'chat_id', v_conv.chat_externo_id, 'telefone', v_conv.telefone, 'corpo', v_msg.corpo);
end $$;

create or replace function public.confirmar_envio(p_mensagem uuid, p_id_externo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.mensagens set estado = 'enviada', id_externo = p_id_externo, enviado_em = now(), erro = null
  where id = p_mensagem and estado = 'enviando';
  if not found then
    perform public.erro('estado_invalido', 'Mensagem não estava em envio.');
  end if;
  update public.conversas set ultima_mensagem_em = now() where id = (select conversa_id from public.mensagens where id = p_mensagem);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.registrar_falha_envio(p_mensagem uuid, p_erro text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- só uma descrição curta: o adaptador não deve repassar tokens, cabeçalhos ou payload
  update public.mensagens set estado = 'falhou', erro = left(coalesce(p_erro, 'Falha no envio'), 300)
  where id = p_mensagem and estado = 'enviando';
  if not found then
    perform public.erro('estado_invalido', 'Mensagem não estava em envio.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- caixa de atendimento (equipe)
create or replace function public.assumir_atendimento(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('atender_conversas');
  v_conv public.conversas;
  v_canceladas int;
begin
  select * into v_conv from public.conversas where id = p_conversa for update;
  if not found then
    perform public.erro('conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  update public.conversas set modo = 'humano', atendente_id = v_uid, epoca_bot = epoca_bot + 1
  where id = v_conv.id returning * into v_conv;
  -- respostas do bot ainda não entregues ao provedor deixam de sair
  update public.mensagens set estado = 'cancelada', erro = 'Cancelada: atendimento assumido pela equipe.'
  where conversa_id = v_conv.id and autor = 'bot' and estado in ('pendente', 'falhou');
  get diagnostics v_canceladas = row_count;
  perform public.registrar_historico('equipe', 'atendimento_assumido', 'conversa', v_conv.id,
    jsonb_build_object('respostas_canceladas', v_canceladas));
  return jsonb_build_object('ok', true, 'modo', v_conv.modo, 'epoca_bot', v_conv.epoca_bot, 'respostas_canceladas', v_canceladas);
end $$;

create or replace function public.devolver_ao_assistente(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv public.conversas;
begin
  perform public.exigir_permissao('atender_conversas');
  update public.conversas set modo = 'bot', atendente_id = null, epoca_bot = epoca_bot + 1, motivo_escalonamento = null
  where id = p_conversa returning * into v_conv;
  if not found then
    perform public.erro('conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  perform public.registrar_historico('equipe', 'devolvida_ao_assistente', 'conversa', v_conv.id);
  return jsonb_build_object('ok', true, 'modo', v_conv.modo, 'epoca_bot', v_conv.epoca_bot);
end $$;

-- Resposta manual. Se o bot estava ativo, a conversa é assumida antes (o bot pausa).
create or replace function public.equipe_enviar_mensagem(p_conversa uuid, p_corpo text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := public.exigir_permissao('atender_conversas');
  v_conv public.conversas;
  v_id uuid;
begin
  if coalesce(trim(p_corpo), '') = '' then
    perform public.erro('mensagem_vazia', 'Escreva a mensagem.');
  end if;
  select * into v_conv from public.conversas where id = p_conversa for update;
  if not found then
    perform public.erro('conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  if v_conv.modo <> 'humano' then
    perform public.assumir_atendimento(p_conversa);
  end if;
  insert into public.mensagens (conversa_id, direcao, autor, provedor, corpo, estado, autor_id)
  values (v_conv.id, 'saida', 'equipe', v_conv.provedor, left(p_corpo, 4000), 'pendente', v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'mensagem_id', v_id);
end $$;

create or replace function public.reenviar_mensagem(p_mensagem uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('atender_conversas');
  update public.mensagens set estado = 'pendente', erro = null
  where id = p_mensagem and estado = 'falhou' and autor = 'equipe';
  if not found then
    perform public.erro('estado_invalido', 'Só mensagens da equipe que falharam podem ser reenviadas.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.marcar_conversa_lida(p_conversa uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('atender_conversas');
  update public.conversas set nao_lidas = 0 where id = p_conversa;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.vincular_cliente_conversa(p_conversa uuid, p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.exigir_permissao('atender_conversas');
  update public.conversas set cliente_id = p_cliente where id = p_conversa;
  if not found then
    perform public.erro('conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  perform public.registrar_historico('equipe', 'cliente_vinculado', 'conversa', p_conversa, jsonb_build_object('cliente', p_cliente));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------- ferramentas do assistente
-- Regras comuns:
--  * nunca lançam erro para o assistente: devolvem {ok:false, codigo, mensagem};
--  * ações de escrita exigem que a conversa esteja com o bot e na mesma época
--    (se a equipe assumiu no meio do processamento, nada é gravado);
--  * o assistente só enxerga dados do cliente da própria conversa.

create or replace function public.bot_falha(p_ferramenta text, p_codigo text, p_mensagem text, p_estado text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_estado is not null then
    -- erro inesperado: registra só a ferramenta e o SQLSTATE, sem dados do cliente
    perform public.registrar_historico('bot', 'falha_ferramenta', 'ferramenta', null,
      jsonb_build_object('ferramenta', p_ferramenta, 'sqlstate', p_estado));
  end if;
  return jsonb_build_object('ok', false, 'codigo', p_codigo, 'mensagem', p_mensagem);
end $$;

create or replace function public.bot_travar_conversa(p_conversa uuid, p_epoca int) returns public.conversas
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv public.conversas;
begin
  select * into v_conv from public.conversas where id = p_conversa for update;
  if not found then
    perform public.erro('conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  if v_conv.modo <> 'bot' or v_conv.epoca_bot <> p_epoca then
    perform public.erro('bot_pausado', 'A conversa está com a equipe. O assistente não deve responder.');
  end if;
  return v_conv;
end $$;

create or replace function public.normalizar_busca(t text) returns text
language sql immutable as $$
  select lower(translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc'))
$$;

create or replace function public.bot_ler_conversa(p_conversa uuid, p_limite int default 20) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_conv public.conversas;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if not found then
    return public.bot_falha('bot_ler_conversa', 'conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  return jsonb_build_object(
    'ok', true, 'conversa_id', v_conv.id, 'modo', v_conv.modo, 'epoca_bot', v_conv.epoca_bot,
    'nome_contato', v_conv.nome_contato,
    'cliente', (select jsonb_build_object('id', c.id, 'nome', c.nome) from public.clientes c where c.id = v_conv.cliente_id),
    'contexto', v_conv.contexto_bot,
    'mensagens', coalesce((
      select jsonb_agg(x order by x.criado_em) from (
        select m.id, m.direcao, m.autor, m.tipo, m.corpo, m.transcricao_estado, m.transcricao, m.estado, m.criado_em
        from public.mensagens m where m.conversa_id = v_conv.id and m.estado <> 'cancelada'
        order by m.criado_em desc limit least(greatest(p_limite, 1), 50)
      ) x), '[]'::jsonb)
  );
end $$;

create or replace function public.bot_salvar_contexto(p_conversa uuid, p_epoca int, p_contexto jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.bot_travar_conversa(p_conversa, p_epoca);
  if jsonb_typeof(p_contexto) <> 'object' or length(p_contexto::text) > 8000 then
    perform public.erro('contexto_invalido', 'Contexto inválido.');
  end if;
  update public.conversas set contexto_bot = p_contexto where id = p_conversa;
  return jsonb_build_object('ok', true);
exception when sqlstate 'P0001' then
  return public.bot_falha('bot_salvar_contexto', sqlerrm, 'Não foi possível salvar o contexto.');
end $$;

create or replace function public.bot_enfileirar_resposta(p_conversa uuid, p_epoca int, p_corpo text, p_chave text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conv public.conversas;
  v_id uuid;
begin
  if coalesce(trim(p_corpo), '') = '' or p_chave is null then
    return public.bot_falha('bot_enfileirar_resposta', 'mensagem_invalida', 'Mensagem vazia ou sem chave.');
  end if;
  select id into v_id from public.mensagens where chave_idempotencia = p_chave;
  if found then
    return jsonb_build_object('ok', true, 'duplicado', true, 'mensagem_id', v_id);
  end if;
  v_conv := public.bot_travar_conversa(p_conversa, p_epoca);
  insert into public.mensagens (conversa_id, direcao, autor, provedor, corpo, estado, epoca_bot, chave_idempotencia)
  values (v_conv.id, 'saida', 'bot', v_conv.provedor, left(p_corpo, 1500), 'pendente', p_epoca, p_chave)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'duplicado', false, 'mensagem_id', v_id);
exception
  when sqlstate 'P0001' then
    return public.bot_falha('bot_enfileirar_resposta', sqlerrm, 'O assistente está pausado nesta conversa.');
  when unique_violation then
    select id into v_id from public.mensagens where chave_idempotencia = p_chave;
    return jsonb_build_object('ok', true, 'duplicado', true, 'mensagem_id', v_id);
end $$;

create or replace function public.bot_buscar_equipamentos(p_texto text, p_limite int default 5) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_termos text[];
  v_res jsonb;
begin
  v_termos := array(
    select t from regexp_split_to_table(public.normalizar_busca(left(p_texto, 200)), '[^a-z0-9]+') t
    where length(t) >= 3
  );
  if coalesce(array_length(v_termos, 1), 0) = 0 then
    return public.bot_falha('bot_buscar_equipamentos', 'busca_vazia', 'Diga qual equipamento procura.');
  end if;
  select coalesce(jsonb_agg(to_jsonb(r) - 'relevancia' order by r.relevancia desc, r.nome), '[]'::jsonb) into v_res from (
    select * from (
      select e.id, e.nome, c.nome as categoria, e.descricao,
        (select count(*) from unnest(v_termos) t
          where public.normalizar_busca(e.nome || ' ' || coalesce(e.palavras_chave, '') || ' ' || c.nome) like '%' || t || '%') as relevancia,
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

create or replace function public.bot_consultar_disponibilidade(p_equipamento uuid, p_inicio timestamptz, p_fim timestamptz, p_quantidade int default 1)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object('ok', true) || public.consultar_disponibilidade_interno(p_equipamento, p_inicio, p_fim, p_quantidade);
exception
  when sqlstate 'P0001' then
    declare v_det text;
    begin
      get stacked diagnostics v_det = pg_exception_detail;
      return public.bot_falha('bot_consultar_disponibilidade', sqlerrm, v_det);
    end;
  when others then
    return public.bot_falha('bot_consultar_disponibilidade', 'falha_consulta', 'Não consegui consultar a disponibilidade agora.', sqlstate);
end $$;

create or replace function public.bot_calcular_orcamento(p_itens jsonb, p_inicio timestamptz, p_fim timestamptz, p_modalidade text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_modalidade not in ('retirada', 'entrega') then
    return public.bot_falha('bot_calcular_orcamento', 'modalidade_invalida', 'Informe retirada ou entrega.');
  end if;
  return jsonb_build_object('ok', true) || public.calcular_orcamento_interno(p_itens, p_inicio, p_fim, p_modalidade::public.modalidade_entrega);
exception
  when sqlstate 'P0001' then
    declare v_det text;
    begin
      get stacked diagnostics v_det = pg_exception_detail;
      return public.bot_falha('bot_calcular_orcamento', sqlerrm, v_det);
    end;
  when others then
    return public.bot_falha('bot_calcular_orcamento', 'falha_consulta', 'Não consegui calcular o orçamento agora.', sqlstate);
end $$;

create or replace function public.bot_salvar_orcamento(
  p_conversa uuid, p_epoca int, p_itens jsonb, p_inicio timestamptz, p_fim timestamptz,
  p_modalidade text, p_endereco text, p_chave text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conv public.conversas;
  v_cliente uuid;
  v_contato uuid;
begin
  if p_chave is null then
    return public.bot_falha('bot_salvar_orcamento', 'chave_obrigatoria', 'Chave de idempotência obrigatória.');
  end if;
  if p_modalidade not in ('retirada', 'entrega') then
    return public.bot_falha('bot_salvar_orcamento', 'modalidade_invalida', 'Informe retirada ou entrega.');
  end if;
  v_conv := public.bot_travar_conversa(p_conversa, p_epoca);
  v_cliente := v_conv.cliente_id;
  if v_cliente is null then
    -- contato novo: cria um cadastro mínimo, marcado para conferência da equipe
    insert into public.clientes (nome, origem, cadastro_incompleto)
    values (coalesce(v_conv.nome_contato, 'Contato WhatsApp ' || right(v_conv.telefone, 4)), 'whatsapp', true)
    returning id into v_cliente;
    insert into public.cliente_contatos (cliente_id, nome, telefone, whatsapp)
    values (v_cliente, coalesce(v_conv.nome_contato, 'Contato WhatsApp'), v_conv.telefone, true)
    on conflict (telefone) do nothing
    returning id into v_contato;
    update public.conversas set cliente_id = v_cliente, contato_id = v_contato where id = v_conv.id;
    perform public.registrar_historico('bot', 'cliente_criado_pelo_whatsapp', 'cliente', v_cliente);
  end if;
  return public.salvar_orcamento_interno(v_cliente, v_conv.id, p_itens, p_inicio, p_fim,
    p_modalidade::public.modalidade_entrega, p_endereco, p_chave, 'bot');
exception
  when sqlstate 'P0001' then
    declare v_det text;
    begin
      get stacked diagnostics v_det = pg_exception_detail;
      return public.bot_falha('bot_salvar_orcamento', sqlerrm, v_det);
    end;
  when others then
    return public.bot_falha('bot_salvar_orcamento', 'falha_gravacao', 'Não consegui registrar o orçamento agora.', sqlstate);
end $$;

create or replace function public.bot_criar_pre_reserva(p_conversa uuid, p_epoca int, p_orcamento uuid, p_chave text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_conv public.conversas;
begin
  if p_chave is null then
    return public.bot_falha('bot_criar_pre_reserva', 'chave_obrigatoria', 'Chave de idempotência obrigatória.');
  end if;
  v_conv := public.bot_travar_conversa(p_conversa, p_epoca);
  if not exists (select 1 from public.orcamentos where id = p_orcamento and conversa_id = v_conv.id) then
    return public.bot_falha('bot_criar_pre_reserva', 'orcamento_nao_encontrado', 'Orçamento não encontrado nesta conversa.');
  end if;
  return public.criar_pre_reserva_interno(p_orcamento, p_chave, 'bot');
exception
  when sqlstate 'P0001' then
    declare v_det text;
    begin
      get stacked diagnostics v_det = pg_exception_detail;
      return public.bot_falha('bot_criar_pre_reserva', sqlerrm, v_det);
    end;
  when others then
    return public.bot_falha('bot_criar_pre_reserva', 'falha_gravacao', 'Não consegui registrar a pré-reserva agora.', sqlstate);
end $$;

-- Locações e orçamentos do cliente desta conversa (nunca de outros clientes).
create or replace function public.bot_consultar_locacao(p_conversa uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_conv public.conversas;
begin
  select * into v_conv from public.conversas where id = p_conversa;
  if not found then
    return public.bot_falha('bot_consultar_locacao', 'conversa_nao_encontrada', 'Conversa não encontrada.');
  end if;
  if v_conv.cliente_id is null then
    return jsonb_build_object('ok', true, 'locacoes', '[]'::jsonb, 'orcamentos', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'ok', true,
    'locacoes', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', l.numero, 'status', l.status, 'inicio', l.inicio, 'fim', l.fim,
        'valor_total', l.valor_total, 'frete_a_definir', l.modalidade = 'entrega' and l.valor_frete is null,
        'expira_em', l.expira_em,
        'itens', (select string_agg(li.quantidade || '× ' || e.nome, ', ') from public.locacao_itens li
                  join public.equipamentos e on e.id = li.equipamento_id where li.locacao_id = l.id)
      ) order by l.criado_em desc)
      from (select * from public.locacoes where cliente_id = v_conv.cliente_id order by criado_em desc limit 5) l), '[]'::jsonb),
    'orcamentos', coalesce((select jsonb_agg(jsonb_build_object(
        'orcamento_id', o.id, 'numero', o.numero, 'status', o.status, 'valor_total', o.valor_total, 'validade_ate', o.validade_ate
      ) order by o.criado_em desc)
      from (select * from public.orcamentos where conversa_id = v_conv.id order by criado_em desc limit 5) o), '[]'::jsonb)
  );
exception when others then
  return public.bot_falha('bot_consultar_locacao', 'falha_consulta', 'Não consegui consultar suas locações agora.', sqlstate);
end $$;

-- p_aviso: mensagem de transição ("vou chamar alguém da equipe"), enviada como 'sistema'
-- para não ser cancelada pela própria pausa do bot.
create or replace function public.bot_solicitar_atendimento_humano(
  p_conversa uuid, p_epoca int, p_motivo text, p_aviso text default null, p_chave text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv public.conversas;
begin
  v_conv := public.bot_travar_conversa(p_conversa, p_epoca);
  if coalesce(trim(p_aviso), '') <> '' then
    insert into public.mensagens (conversa_id, direcao, autor, provedor, corpo, estado, chave_idempotencia)
    values (v_conv.id, 'saida', 'sistema', v_conv.provedor, left(p_aviso, 1000), 'pendente', p_chave)
    on conflict (chave_idempotencia) do nothing;
  end if;
  update public.conversas set modo = 'aguardando_equipe', epoca_bot = epoca_bot + 1,
    motivo_escalonamento = left(coalesce(nullif(trim(p_motivo), ''), 'Pedido de atendimento humano'), 300)
  where id = v_conv.id returning * into v_conv;
  perform public.registrar_historico('bot', 'atendimento_humano_solicitado', 'conversa', v_conv.id,
    jsonb_build_object('motivo', v_conv.motivo_escalonamento));
  return jsonb_build_object('ok', true, 'modo', v_conv.modo);
exception
  when sqlstate 'P0001' then
    return public.bot_falha('bot_solicitar_atendimento_humano', sqlerrm, 'A conversa já está com a equipe.');
end $$;
