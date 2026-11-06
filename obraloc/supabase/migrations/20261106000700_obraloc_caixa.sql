-- ObraLoc — caixa de atendimento: resumo das conversas para a lista.
-- security_invoker: só aparece para quem tem a permissão atender_conversas (RLS de conversas/mensagens).

create view public.v_conversas_caixa with (security_invoker = true) as
select
  c.id, c.provedor, c.telefone, c.nome_contato, c.cliente_id, cl.nome as cliente, cl.cadastro_incompleto,
  c.modo, c.atendente_id, p.nome as atendente, c.epoca_bot, c.motivo_escalonamento, c.nao_lidas,
  c.ultima_mensagem_em, c.criado_em,
  um.corpo as ultima_mensagem, um.tipo as ultima_tipo, um.direcao as ultima_direcao, um.autor as ultimo_autor,
  (select count(*) from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida' and m.estado in ('pendente', 'enviando')) as pendentes,
  (select count(*) from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida' and m.estado = 'falhou') as falhas,
  (select count(*) from public.mensagens m where m.conversa_id = c.id and m.tipo = 'audio' and m.transcricao_estado in ('pendente', 'indisponivel', 'falhou')) as audios_sem_texto
from public.conversas c
left join public.clientes cl on cl.id = c.cliente_id
left join public.perfis p on p.user_id = c.atendente_id
left join lateral (
  select m.corpo, m.tipo, m.direcao, m.autor from public.mensagens m
  where m.conversa_id = c.id and m.estado <> 'cancelada'
  order by m.criado_em desc limit 1
) um on true;

grant select on public.v_conversas_caixa to authenticated;
