-- Usuários de teste e utilitários de asserção (somente testes locais).

insert into auth.users (id, email) values
  ('10000000-0000-4000-a000-000000000001', 'admin@obraloc.exemplo'),
  ('10000000-0000-4000-a000-000000000002', 'atendente@obraloc.exemplo'),
  ('10000000-0000-4000-a000-000000000003', 'sem-perfil@obraloc.exemplo')
on conflict do nothing;

insert into public.perfis (user_id, nome, papel) values
  ('10000000-0000-4000-a000-000000000001', 'Admin Demo', 'admin'),
  ('10000000-0000-4000-a000-000000000002', 'Atendente Demo', 'atendente')
on conflict do nothing;

create schema if not exists test;
grant usage on schema test to public;

create or replace function test.ok(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FALHOU: %', p_msg;
  end if;
  raise notice 'ok  %', p_msg;
end $$;

-- Executa SQL e devolve o código do erro de negócio (ou SQLSTATE), ou 'sem_erro'.
create or replace function test.erro_de(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'sem_erro';
exception
  when sqlstate 'P0001' then return sqlerrm;
  when others then return sqlstate;
end $$;

grant execute on all functions in schema test to public;

-- Atalhos de identidade (use: select test.como_admin(); … reset role;)
create or replace function test.claims(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
grant execute on function test.claims(uuid) to public;

-- Data no fuso da loja: hoje + n dias, na hora indicada.
create or replace function test.dia(n int, hora int default 8) returns timestamptz
language sql stable as $$
  select (date_trunc('day', now() at time zone 'America/Sao_Paulo') + make_interval(days => n, hours => hora)) at time zone 'America/Sao_Paulo'
$$;
grant execute on function test.dia(int, int) to public;

-- Evento de mensagem simulado, no formato normalizado do adaptador.
create or replace function test.evento(p_evento text, p_msg text, p_tel text, p_corpo text, p_tipo text default 'texto')
returns jsonb language sql immutable as $$
  select jsonb_build_object('provedor', 'simulado', 'evento_id', p_evento, 'chat_id', 'sim-' || p_tel,
    'telefone', p_tel, 'nome', 'Cliente Teste', 'mensagem_id', p_msg, 'tipo', p_tipo, 'corpo', p_corpo)
$$;
grant execute on function test.evento(text, text, text, text, text) to public;
