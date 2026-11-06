-- ObraLoc — segurança: papéis de serviço, RLS e permissões de execução.
--
-- Quem acessa o quê:
--   anon               : nada.
--   authenticated      : só quem tem perfil ativo (equipe). Lê pelas políticas RLS; escreve
--                        diretamente apenas cadastros (catálogo, clientes, configurações),
--                        conforme permissões. Mudanças de estado só pelas funções.
--   obraloc_bot        : só executa as ferramentas bot_*. Não lê nem grava tabelas.
--   obraloc_integracao : webhook e despachante. Só executa as funções de entrada/saída.
--   service_role       : servidor (Supabase). Nunca vai para o navegador.

-- ---------------------------------------------------------------- papéis de serviço
do $$
begin
  if not exists (select from pg_roles where rolname = 'obraloc_bot') then
    create role obraloc_bot nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'obraloc_integracao') then
    create role obraloc_integracao nologin noinherit;
  end if;
  -- permite que o PostgREST do Supabase assuma esses papéis via claim "role" do JWT
  if exists (select from pg_roles where rolname = 'authenticator') then
    execute 'grant obraloc_bot, obraloc_integracao to authenticator';
  end if;
end $$;

grant usage on schema public to obraloc_bot, obraloc_integracao;

-- ---------------------------------------------------------------- tabelas
revoke all on all tables in schema public from anon, authenticated, obraloc_bot, obraloc_integracao;
revoke all on all sequences in schema public from anon, authenticated, obraloc_bot, obraloc_integracao;

grant select on all tables in schema public to authenticated;
grant insert, update on public.categorias, public.equipamentos, public.unidades, public.clientes,
  public.cliente_contatos, public.regras_cobranca, public.configuracoes, public.perfis, public.permissoes_papel
  to authenticated;
grant delete on public.equipamento_precos, public.cliente_contatos, public.permissoes_papel to authenticated;
grant insert, update on public.equipamento_precos to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'perfis', 'permissoes_papel', 'regras_cobranca', 'configuracoes', 'categorias', 'equipamentos',
    'equipamento_precos', 'unidades', 'clientes', 'cliente_contatos', 'conexoes_whatsapp', 'conversas',
    'mensagens', 'eventos_webhook', 'orcamentos', 'orcamento_itens', 'locacoes', 'locacao_itens',
    'alocacoes', 'vistorias', 'recebimentos', 'historico'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- leitura pela equipe
do $$
declare t text;
begin
  foreach t in array array[
    'regras_cobranca', 'configuracoes', 'categorias', 'equipamentos', 'equipamento_precos', 'unidades',
    'clientes', 'cliente_contatos', 'conexoes_whatsapp', 'orcamentos', 'orcamento_itens', 'locacoes',
    'locacao_itens', 'alocacoes', 'vistorias', 'recebimentos', 'historico', 'permissoes_papel'
  ] loop
    execute format('create policy equipe_le on public.%I for select to authenticated using ((select public.e_equipe()))', t);
  end loop;
end $$;

create policy equipe_le on public.perfis for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_equipe()));
create policy atendimento_le on public.conversas for select to authenticated
  using ((select public.tem_permissao('atender_conversas')));
create policy atendimento_le on public.mensagens for select to authenticated
  using ((select public.tem_permissao('atender_conversas')));
create policy admin_le on public.eventos_webhook for select to authenticated
  using ((select public.tem_permissao('gerenciar_configuracoes')));

-- escrita de cadastros conforme permissão
do $$
declare
  r record;
begin
  for r in select * from (values
    ('categorias', 'gerenciar_catalogo'), ('equipamentos', 'gerenciar_catalogo'),
    ('equipamento_precos', 'gerenciar_catalogo'), ('unidades', 'gerenciar_catalogo'),
    ('clientes', 'gerenciar_clientes'), ('cliente_contatos', 'gerenciar_clientes'),
    ('regras_cobranca', 'gerenciar_configuracoes'), ('configuracoes', 'gerenciar_configuracoes'),
    ('perfis', 'gerenciar_equipe'), ('permissoes_papel', 'gerenciar_equipe')
  ) v(tabela, permissao) loop
    execute format('create policy grava_insert on public.%I for insert to authenticated with check ((select public.tem_permissao(%L)))', r.tabela, r.permissao);
    execute format('create policy grava_update on public.%I for update to authenticated using ((select public.tem_permissao(%L))) with check ((select public.tem_permissao(%L)))', r.tabela, r.permissao, r.permissao);
  end loop;
end $$;

create policy grava_delete on public.equipamento_precos for delete to authenticated using ((select public.tem_permissao('gerenciar_catalogo')));
create policy grava_delete on public.cliente_contatos for delete to authenticated using ((select public.tem_permissao('gerenciar_clientes')));
create policy grava_delete on public.permissoes_papel for delete to authenticated using ((select public.tem_permissao('gerenciar_equipe')));

-- A condição da unidade (manutenção/baixa) muda pela função alterar_condicao_unidade,
-- que registra histórico; a edição direta fica restrita aos campos de cadastro.
revoke update on public.unidades from authenticated;
grant update (codigo, numero_serie, observacoes) on public.unidades to authenticated;

-- ---------------------------------------------------------------- visões
grant select on public.v_unidades_situacao, public.v_locacoes_resumo, public.v_reservas_em_risco to authenticated;

-- ---------------------------------------------------------------- funções
-- O Supabase concede EXECUTE a todos por padrão; aqui tudo é fechado e reaberto por papel.
revoke execute on all functions in schema public from public, anon, authenticated, obraloc_bot, obraloc_integracao;
alter default privileges in schema public revoke execute on functions from public;

-- usadas dentro de políticas RLS
grant execute on function public.e_equipe(), public.tem_permissao(text) to authenticated;
-- usadas pelas visões (security_invoker)
grant execute on function public.config(), public.periodo_bloqueio(public.alocacoes, public.locacoes) to authenticated;

-- equipe (cada função confere a permissão específica)
grant execute on function
  public.consultar_disponibilidade(uuid, timestamptz, timestamptz, int),
  public.calcular_orcamento(jsonb, timestamptz, timestamptz, public.modalidade_entrega),
  public.salvar_orcamento(uuid, jsonb, timestamptz, timestamptz, public.modalidade_entrega, text, text, uuid),
  public.criar_pre_reserva(uuid, text),
  public.aprovar_pre_reserva(uuid),
  public.cancelar_locacao(uuid, text),
  public.realocar_unidade(uuid, uuid),
  public.registrar_retirada(uuid, jsonb, text),
  public.registrar_devolucao(uuid, jsonb, text, uuid[]),
  public.definir_frete(uuid, numeric),
  public.registrar_recebimento(uuid, numeric, text, text),
  public.agendar_manutencao(uuid, timestamptz, timestamptz, text),
  public.encerrar_manutencao(uuid),
  public.alterar_condicao_unidade(uuid, public.condicao_unidade, text),
  public.assumir_atendimento(uuid),
  public.devolver_ao_assistente(uuid),
  public.equipe_enviar_mensagem(uuid, text),
  public.reenviar_mensagem(uuid),
  public.marcar_conversa_lida(uuid),
  public.vincular_cliente_conversa(uuid, uuid),
  public.expirar_pre_reservas(),
  public.formatar_brl(numeric)
to authenticated;

-- assistente: somente as ferramentas
grant execute on function
  public.bot_ler_conversa(uuid, int),
  public.bot_salvar_contexto(uuid, int, jsonb),
  public.bot_enfileirar_resposta(uuid, int, text, text),
  public.bot_buscar_equipamentos(text, int),
  public.bot_consultar_disponibilidade(uuid, timestamptz, timestamptz, int),
  public.bot_calcular_orcamento(jsonb, timestamptz, timestamptz, text),
  public.bot_salvar_orcamento(uuid, int, jsonb, timestamptz, timestamptz, text, text, text),
  public.bot_criar_pre_reserva(uuid, int, uuid, text),
  public.bot_consultar_locacao(uuid),
  public.bot_solicitar_atendimento_humano(uuid, int, text, text, text)
to obraloc_bot;

-- integração (webhook + despachante)
grant execute on function
  public.registrar_mensagem_recebida(jsonb),
  public.atualizar_transcricao(uuid, text, text),
  public.registrar_status_entrega(text, text, text, public.status_mensagem),
  public.atualizar_conexao(text, text, text),
  public.mensagens_para_envio(int),
  public.reservar_envio(uuid),
  public.confirmar_envio(uuid, text),
  public.registrar_falha_envio(uuid, text),
  public.expirar_pre_reservas()
to obraloc_integracao;

grant execute on all functions in schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
