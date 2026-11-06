-- Atendimento humano interrompendo o bot, inclusive respostas em processamento.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

set local role obraloc_integracao;
insert into t values ('in', public.registrar_mensagem_recebida(test.evento('ev-h1', 'msg-h1', '5511977770002', 'Quero alugar um gerador')));
reset role;
insert into t select 'conv', to_jsonb((valor->>'conversa_id')) from t where chave = 'in';

-- o bot gera duas respostas na época 0; uma ainda está na fila quando a equipe assume
set local role obraloc_bot;
insert into t values ('r1', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0, 'Olá! Sou o assistente virtual da ObraLoc.', 'resp:msg-h1:1'));
insert into t values ('r1-dup', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0, 'Olá! Sou o assistente virtual da ObraLoc.', 'resp:msg-h1:1'));
insert into t values ('r2', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0, 'Para quais datas?', 'resp:msg-h1:2'));
reset role;

select test.ok((select valor->>'duplicado' from t where chave = 'r1-dup') = 'true', 'resposta repetida do bot não duplica');

-- despachante envia a primeira
set local role obraloc_integracao;
insert into t values ('env1', public.reservar_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'r1')));
insert into t values ('conf1', public.confirmar_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'r1'), 'wamid-1'));
reset role;
select test.ok((select (valor->>'enviar')::boolean from t where chave = 'env1'), 'primeira resposta liberada para envio');

-- equipe assume
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('assumir', public.assumir_atendimento((select (valor #>> '{}')::uuid from t where chave = 'conv')));
reset role;

select test.ok((select valor->>'modo' from t where chave = 'assumir') = 'humano', 'conversa passa para atendimento humano');
select test.ok((select (valor->>'respostas_canceladas')::int from t where chave = 'assumir') = 1, 'resposta do bot ainda na fila é cancelada');
select test.ok((select estado from public.mensagens where id = (select (valor->>'mensagem_id')::uuid from t where chave = 'r2')) = 'cancelada', 'segunda resposta não será enviada');

-- o processamento antigo do bot (época 0) termina depois da tomada: nada sai, nada é gravado
set local role obraloc_bot;
insert into t values ('r3', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0, 'Resposta atrasada', 'resp:msg-h1:3'));
insert into t values ('orc-atrasado', public.bot_salvar_orcamento((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0,
  '[{"equipamento_id":"00000000-0000-4000-a000-000000000208","quantidade":1}]', test.dia(3, 8), test.dia(4, 8), 'retirada', null, 'orc:msg-h1'));
insert into t values ('esc-atrasado', public.bot_solicitar_atendimento_humano((select (valor #>> '{}')::uuid from t where chave = 'conv'), 0, 'x'));
-- mesmo sabendo a época nova, o bot não age enquanto a conversa está com a equipe
insert into t values ('r4', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'),
  (select (valor->>'epoca_bot')::int from t where chave = 'assumir'), 'Tentando de novo', 'resp:msg-h1:4'));
reset role;

select test.ok((select valor->>'codigo' from t where chave = 'r3') = 'bot_pausado', 'resposta de processamento antigo é recusada');
select test.ok((select valor->>'codigo' from t where chave = 'orc-atrasado') = 'bot_pausado', 'bot pausado não grava orçamento');
select test.ok(not exists (select 1 from public.orcamentos where chave_idempotencia = 'orc:msg-h1'), 'nenhum orçamento criado após a tomada');
select test.ok((select valor->>'codigo' from t where chave = 'esc-atrasado') = 'bot_pausado', 'bot pausado não muda o estado da conversa');
select test.ok((select valor->>'codigo' from t where chave = 'r4') = 'bot_pausado', 'com a equipe no controle o bot não responde');

-- se uma resposta antiga escapou do cancelamento, o despachante a barra
insert into public.mensagens (conversa_id, direcao, autor, provedor, corpo, estado, epoca_bot)
values ((select (valor #>> '{}')::uuid from t where chave = 'conv'), 'saida', 'bot', 'simulado', 'escapou', 'pendente', 0);
insert into t select 'id-escapou', to_jsonb(id) from public.mensagens where corpo = 'escapou';
set local role obraloc_integracao;
insert into t values ('env-escapou', public.reservar_envio((select (valor #>> '{}')::uuid from t where chave = 'id-escapou')));
reset role;
select test.ok((select valor->>'motivo' from t where chave = 'env-escapou') = 'bot_pausado', 'despachante cancela resposta do bot de época antiga');

-- resposta manual da equipe
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('manual', public.equipe_enviar_mensagem((select (valor #>> '{}')::uuid from t where chave = 'conv'), 'Oi! Aqui é a Carla, da equipe. Posso ajudar?'));
reset role;
set local role obraloc_integracao;
insert into t values ('env-manual', public.reservar_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'manual')));
insert into t values ('falha-manual', public.registrar_falha_envio((select (valor->>'mensagem_id')::uuid from t where chave = 'manual'), 'Provedor indisponível (simulado)'));
reset role;
select test.ok((select (valor->>'enviar')::boolean from t where chave = 'env-manual'), 'mensagem da equipe é enviada com o bot pausado');
select test.ok((select estado from public.mensagens where id = (select (valor->>'mensagem_id')::uuid from t where chave = 'manual')) = 'falhou', 'falha de envio fica registrada');
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('reenv', public.reenviar_mensagem((select (valor->>'mensagem_id')::uuid from t where chave = 'manual')));
reset role;
select test.ok((select estado from public.mensagens where id = (select (valor->>'mensagem_id')::uuid from t where chave = 'manual')) = 'pendente', 'equipe pode reenviar mensagem que falhou');

-- nova mensagem do cliente com atendimento humano: não aciona o bot
set local role obraloc_integracao;
insert into t values ('in2', public.registrar_mensagem_recebida(test.evento('ev-h2', 'msg-h2', '5511977770002', 'Obrigado')));
reset role;
select test.ok((select (valor->>'acionar_bot')::boolean from t where chave = 'in2') = false, 'mensagem nova não aciona o bot durante atendimento humano');

-- só volta ao bot por ação explícita
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('devolver', public.devolver_ao_assistente((select (valor #>> '{}')::uuid from t where chave = 'conv')));
reset role;
set local role obraloc_bot;
insert into t values ('r5', public.bot_enfileirar_resposta((select (valor #>> '{}')::uuid from t where chave = 'conv'),
  (select (valor->>'epoca_bot')::int from t where chave = 'devolver'), 'Voltei! Posso ajudar com mais alguma coisa?', 'resp:msg-h2:1'));
reset role;
select test.ok((select valor->>'modo' from t where chave = 'devolver') = 'bot', 'equipe devolve a conversa ao assistente');
select test.ok((select (valor->>'ok')::boolean from t where chave = 'r5'), 'bot volta a responder na nova época');

-- bot pede atendimento humano: aviso de transição sai, bot para
set local role obraloc_bot;
insert into t values ('esc', public.bot_solicitar_atendimento_humano((select (valor #>> '{}')::uuid from t where chave = 'conv'),
  (select (valor->>'epoca_bot')::int from t where chave = 'devolver'), 'Cliente pediu desconto',
  'Vou chamar alguém da equipe para conversar sobre condições, tudo bem?', 'esc:msg-h2'));
reset role;
select test.ok((select modo from public.conversas where id = (select (valor #>> '{}')::uuid from t where chave = 'conv')) = 'aguardando_equipe', 'negociação vai para a equipe');
insert into t select 'id-aviso', to_jsonb(id) from public.mensagens where chave_idempotencia = 'esc:msg-h2';
set local role obraloc_integracao;
insert into t values ('env-aviso', public.reservar_envio((select (valor #>> '{}')::uuid from t where chave = 'id-aviso')));
reset role;
select test.ok((select (valor->>'enviar')::boolean from t where chave = 'env-aviso'), 'aviso de transição é enviado mesmo com o bot pausado');

-- áudio sem serviço de transcrição: fica explícito, nada é inventado
set local role obraloc_integracao;
insert into t values ('audio', public.registrar_mensagem_recebida(test.evento('ev-h3', 'msg-h3', '5511977770002', null, 'audio')));
insert into t values ('transc', public.atualizar_transcricao((select (valor->>'mensagem_id')::uuid from t where chave = 'audio'), 'indisponivel'));
reset role;
select test.ok((select transcricao_estado = 'indisponivel' and transcricao is null from public.mensagens
  where id = (select (valor->>'mensagem_id')::uuid from t where chave = 'audio')), 'áudio sem transcrição fica marcado como indisponível');
set local role obraloc_integracao;
select test.ok(test.erro_de(format($q$select public.atualizar_transcricao(%L, 'concluida', '')$q$, (select valor->>'mensagem_id' from t where chave = 'audio'))) = 'estado_invalido',
  'não aceita transcrição "concluída" sem texto');
reset role;

-- confirmação de leitura não regride e é deduplicada
set local role obraloc_integracao;
insert into t values ('st1', public.registrar_status_entrega('simulado', 'st-1', 'wamid-1', 'lida'));
insert into t values ('st2', public.registrar_status_entrega('simulado', 'st-2', 'wamid-1', 'entregue'));
insert into t values ('st1-dup', public.registrar_status_entrega('simulado', 'st-1', 'wamid-1', 'lida'));
reset role;
select test.ok((select estado from public.mensagens where id_externo = 'wamid-1') = 'lida', 'status "lida" não volta para "entregue"');
select test.ok((select valor->>'duplicado' from t where chave = 'st1-dup') = 'true', 'status repetido é ignorado');

rollback;
