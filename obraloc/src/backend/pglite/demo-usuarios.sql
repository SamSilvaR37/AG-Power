-- Usuários de DEMONSTRAÇÃO (só no banco local do navegador). Não existem no Supabase.
insert into auth.users (id, email) values
  ('10000000-0000-4000-a000-000000000001', 'admin@obraloc.exemplo'),
  ('10000000-0000-4000-a000-000000000002', 'atendente@obraloc.exemplo')
on conflict do nothing;

insert into public.perfis (user_id, nome, papel) values
  ('10000000-0000-4000-a000-000000000001', 'Rafaela Admin', 'admin'),
  ('10000000-0000-4000-a000-000000000002', 'Carlos Atendente', 'atendente')
on conflict do nothing;
