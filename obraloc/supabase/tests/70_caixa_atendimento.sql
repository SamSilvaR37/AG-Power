-- Resumo da caixa de atendimento: pendências, falhas e áudios sem texto; acesso restrito.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

set local role obraloc_integracao;
insert into t values ('in', public.registrar_mensagem_recebida(test.evento('ev-cx1', 'msg-cx1', '5511977770100', 'Bom dia')));
insert into t values ('aud', public.registrar_mensagem_recebida(test.evento('ev-cx2', 'msg-cx2', '5511977770100', null, 'audio')));
reset role;
insert into t select 'conv', to_jsonb(valor->>'conversa_id') from t where chave = 'in';

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('m1', public.equipe_enviar_mensagem((select (valor #>> '{}')::uuid from t where chave = 'conv'), 'Olá! Em que posso ajudar?'));
insert into t values ('m2', public.equipe_enviar_mensagem((select (valor #>> '{}')::uuid from t where chave = 'conv'), 'Segunda mensagem'));
reset role;

set local role obraloc_integracao;
select public.reservar_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'm2'));
select public.registrar_falha_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'm2'), 'Sem conexão (simulado)');
reset role;

select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
select test.ok((select modo from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 'humano',
  'responder manualmente assume o atendimento');
select test.ok((select atendente from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) is not null,
  'caixa mostra quem está atendendo');
select test.ok((select pendentes from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 1, 'caixa conta mensagem pendente');
select test.ok((select falhas from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 1, 'caixa conta mensagem com falha');
select test.ok((select audios_sem_texto from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 1, 'caixa sinaliza áudio sem transcrição');
select test.ok((select nao_lidas from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 2, 'duas mensagens não lidas');
select public.marcar_conversa_lida((select (valor #>> '{}')::uuid from t where chave = 'conv'));
select test.ok((select nao_lidas from public.v_conversas_caixa where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 0, 'marcar como lida zera o contador');
reset role;

select test.claims('10000000-0000-4000-a000-000000000003');
set local role authenticated;
select test.ok((select count(*) from public.v_conversas_caixa) = 0, 'sem perfil não vê conversas');
reset role;

rollback;
