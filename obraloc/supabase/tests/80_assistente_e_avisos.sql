-- Busca do assistente (plural, empate) e aviso da equipe ao cliente.
begin;

create temp table t (chave text primary key, valor jsonb);
grant all on t to public;

set local role obraloc_bot;
insert into t values ('plural', public.bot_buscar_equipamentos('betoneiras', 5));
insert into t values ('empate', public.bot_buscar_equipamentos('compactador', 5));
insert into t values ('nada', public.bot_buscar_equipamentos('helicoptero', 5));
reset role;

select test.ok((select valor->'resultados'->0->>'nome' from t where chave = 'plural') = 'Betoneira 400 L', 'plural encontra o equipamento');
select test.ok((select (valor->'resultados'->0->>'relevancia')::int from t where chave = 'plural') = 1, 'busca devolve a relevância');
select test.ok((select jsonb_array_length(valor->'resultados') from t where chave = 'empate') = 2
  and (select (valor->'resultados'->0->>'relevancia') = (valor->'resultados'->1->>'relevancia') from t where chave = 'empate'),
  '"compactador" empata entre o sapo e a placa (o assistente pergunta)');
select test.ok((select jsonb_array_length(valor->'resultados') from t where chave = 'nada') = 0, 'equipamento fora do catálogo não aparece');

-- aviso da equipe: vai para a conversa da locação, sem pausar o bot
select test.claims('10000000-0000-4000-a000-000000000002');
set local role authenticated;
insert into t values ('aviso', public.notificar_cliente_locacao((select id from public.locacoes where numero = 504), 'Sua locação foi confirmada!'));
insert into t values ('sem-conv', public.notificar_cliente_locacao((select id from public.locacoes where numero = 502), 'Teste'));
reset role;
select test.ok((select (valor->>'ok')::boolean from t where chave = 'aviso'), 'aviso da equipe entra na fila');
select test.ok((select autor = 'sistema' and estado = 'pendente' from public.mensagens where id = (select (valor->>'mensagem_id')::uuid from t where chave = 'aviso')),
  'aviso sai como mensagem do sistema');
select test.ok((select modo from public.conversas where id = (select (valor->>'conversa_id')::uuid from t where chave = 'aviso')) = 'bot', 'aviso não pausa o assistente');
select test.ok((select valor->>'codigo' from t where chave = 'sem-conv') = 'sem_conversa', 'cliente sem WhatsApp: aviso recusado com motivo');

set local role obraloc_bot;
select test.ok(test.erro_de($q$select public.notificar_cliente_locacao((select null::uuid), 'x')$q$) = '42501', 'assistente não usa o aviso da equipe');
reset role;

rollback;
