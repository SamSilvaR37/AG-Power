-- ObraLoc — modelo de dados base
-- Locação de equipamentos para construção civil + atendimento por WhatsApp.
--
-- Princípios:
--  * Uma locação nasce como pré-reserva e muda de status na mesma linha
--    (pre_reserva → confirmada → em_andamento → devolvida). Nada é copiado na aprovação.
--  * Cada unidade física ocupada num período vira uma linha em `alocacoes`.
--    Uma restrição EXCLUDE impede duas alocações ativas da mesma unidade com períodos
--    sobrepostos, inclusive em transações simultâneas.
--  * Valores são sempre calculados pelo banco a partir da tabela de preços e da regra
--    de cobrança configurada. A regra usada fica gravada no orçamento.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------- tipos
create type public.papel_equipe as enum ('admin', 'atendente');
create type public.condicao_unidade as enum ('ativa', 'manutencao', 'baixada');
create type public.status_locacao as enum (
  'pre_reserva',   -- cliente aceitou o orçamento; unidade segurada até expira_em
  'confirmada',    -- equipe aprovou; aguardando retirada/entrega
  'em_andamento',  -- equipamento com o cliente
  'devolvida',     -- devolução registrada; unidades liberadas
  'expirada',      -- pré-reserva venceu sem aprovação
  'cancelada'
);
create type public.tipo_alocacao as enum ('locacao', 'manutencao');
create type public.status_orcamento as enum ('enviado', 'aceito', 'recusado', 'expirado', 'convertido');
create type public.modalidade_entrega as enum ('retirada', 'entrega');
create type public.modo_conversa as enum ('bot', 'aguardando_equipe', 'humano');
create type public.direcao_mensagem as enum ('entrada', 'saida');
create type public.autor_mensagem as enum ('cliente', 'bot', 'equipe', 'sistema');
create type public.status_mensagem as enum (
  'recebida', 'pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada'
);
create type public.tipo_ator as enum ('equipe', 'bot', 'sistema', 'cliente');

-- ---------------------------------------------------------------- equipe e permissões
create table public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  papel public.papel_equipe not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Permissões por papel, configuráveis pelo administrador.
create table public.permissoes_papel (
  papel public.papel_equipe not null,
  permissao text not null check (permissao in (
    'atender_conversas', 'gerenciar_clientes', 'orcamentos', 'aprovar_locacao',
    'registrar_retirada', 'registrar_devolucao', 'registrar_pagamento',
    'manutencao', 'gerenciar_catalogo', 'gerenciar_configuracoes', 'gerenciar_equipe'
  )),
  primary key (papel, permissao)
);

-- ---------------------------------------------------------------- configuração e cobrança
create table public.regras_cobranca (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  -- 'diaria'  : dias × preço da diária
  -- 'pacotes' : combinação de períodos da tabela (diária, semana, quinzena, mês…) de menor custo
  metodo text not null check (metodo in ('diaria', 'pacotes')),
  -- 'periodos_24h'    : cada 24 h (ou fração) conta 1 dia
  -- 'dias_calendario' : cada dia do calendário tocado conta 1 dia
  contagem text not null check (contagem in ('periodos_24h', 'dias_calendario')),
  minimo_dias int not null default 1 check (minimo_dias >= 1),
  descricao text not null,
  -- true = regra só para demonstração; ainda não validada pelos proprietários
  demonstrativa boolean not null default true,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.configuracoes (
  id boolean primary key default true check (id),
  fuso_horario text not null default 'America/Sao_Paulo',
  pre_reserva_minutos int not null default 120 check (pre_reserva_minutos between 5 and 10080),
  orcamento_validade_horas int not null default 24 check (orcamento_validade_horas between 1 and 720),
  -- Equipamento atrasado: por quantas horas além de agora ele continua bloqueando novas reservas.
  atraso_bloqueio_horas int not null default 24 check (atraso_bloqueio_horas between 0 and 720),
  periodo_maximo_dias int not null default 180 check (periodo_maximo_dias between 1 and 3650),
  regra_cobranca_id uuid references public.regras_cobranca (id),
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- catálogo
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ordem int not null default 0
);

-- Modelo de equipamento (o que aparece no catálogo).
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias (id),
  nome text not null,
  descricao text,
  -- termos extras para a busca (ex.: "martelete, rompedor")
  palavras_chave text,
  fotos text[] not null default '{}',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Tabela de preços por período (1 = diária, 7 = semana, 15 = quinzena, 30 = mês…).
create table public.equipamento_precos (
  equipamento_id uuid not null references public.equipamentos (id) on delete cascade,
  dias int not null check (dias between 1 and 365),
  valor numeric(12, 2) not null check (valor > 0),
  primary key (equipamento_id, dias)
);

-- Unidade física identificada (patrimônio).
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null references public.equipamentos (id),
  codigo text not null unique,
  numero_serie text,
  condicao public.condicao_unidade not null default 'ativa',
  observacoes text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- clientes
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'pf' check (tipo in ('pf', 'pj')),
  documento text,
  email text,
  endereco text,
  observacoes text,
  origem text not null default 'balcao' check (origem in ('balcao', 'whatsapp', 'telefone', 'outro')),
  -- cadastro criado pelo assistente a partir do WhatsApp, ainda sem conferência da equipe
  cadastro_incompleto boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.cliente_contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  -- formato E.164 só com dígitos, ex.: 5511987654321
  telefone text not null check (telefone ~ '^[0-9]{10,15}$'),
  whatsapp boolean not null default true,
  funcao text,
  criado_em timestamptz not null default now()
);
create unique index cliente_contatos_telefone_unico on public.cliente_contatos (telefone);

-- ---------------------------------------------------------------- atendimento (WhatsApp)
create table public.conexoes_whatsapp (
  provedor text primary key,
  estado text not null check (estado in ('simulado', 'conectado', 'desconectado', 'erro')),
  ultimo_erro text,
  atualizado_em timestamptz not null default now()
);

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  provedor text not null,
  chat_externo_id text not null,
  telefone text not null,
  nome_contato text,
  cliente_id uuid references public.clientes (id),
  contato_id uuid references public.cliente_contatos (id),
  modo public.modo_conversa not null default 'bot',
  atendente_id uuid references auth.users (id),
  -- Incrementa sempre que o bot é pausado/retomado. Respostas geradas numa época antiga
  -- são descartadas, mesmo que estivessem em processamento.
  epoca_bot int not null default 0,
  motivo_escalonamento text,
  -- estado estruturado da conversa conduzida pelo assistente (equipamento, datas…)
  contexto_bot jsonb not null default '{}'::jsonb,
  nao_lidas int not null default 0,
  ultima_mensagem_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (provedor, chat_externo_id)
);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  direcao public.direcao_mensagem not null,
  autor public.autor_mensagem not null,
  provedor text not null,
  id_externo text,
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'imagem', 'documento', 'outro')),
  corpo text,
  midia_url text,
  transcricao_estado text not null default 'nao_aplica'
    check (transcricao_estado in ('nao_aplica', 'pendente', 'indisponivel', 'concluida', 'falhou')),
  transcricao text,
  estado public.status_mensagem not null,
  erro text,
  epoca_bot int,
  autor_id uuid references auth.users (id),
  chave_idempotencia text unique,
  tentativas int not null default 0,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (provedor, id_externo)
);
create index mensagens_conversa_idx on public.mensagens (conversa_id, criado_em);
create index mensagens_pendentes_idx on public.mensagens (estado) where estado in ('pendente', 'enviando', 'falhou');

-- Eventos recebidos por webhook, só com o necessário para deduplicar.
-- O conteúdo bruto não é guardado aqui (evita espalhar dados pessoais).
create table public.eventos_webhook (
  id bigint generated always as identity primary key,
  provedor text not null,
  evento_id text not null,
  tipo text not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  resultado text,
  unique (provedor, evento_id)
);

-- ---------------------------------------------------------------- orçamentos e locações
create sequence public.orcamento_numero_seq start 1001;
create sequence public.locacao_numero_seq start 501;

create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.orcamento_numero_seq'),
  cliente_id uuid not null references public.clientes (id),
  conversa_id uuid references public.conversas (id),
  status public.status_orcamento not null default 'enviado',
  inicio timestamptz not null,
  fim timestamptz not null,
  modalidade public.modalidade_entrega not null,
  endereco_entrega text,
  dias int not null,
  regra jsonb not null,               -- cópia da regra de cobrança usada
  valor_itens numeric(12, 2) not null,
  valor_frete numeric(12, 2),         -- null = a definir pela equipe
  valor_total numeric(12, 2) not null,
  validade_ate timestamptz not null,
  chave_idempotencia text unique,
  criado_por_tipo public.tipo_ator not null,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  check (fim > inicio)
);

create table public.orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  equipamento_id uuid not null references public.equipamentos (id),
  quantidade int not null check (quantidade between 1 and 100),
  valor_unitario numeric(12, 2) not null,
  valor_total numeric(12, 2) not null,
  explicacao text not null
);

create table public.locacoes (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique default nextval('public.locacao_numero_seq'),
  cliente_id uuid not null references public.clientes (id),
  orcamento_id uuid unique references public.orcamentos (id),
  conversa_id uuid references public.conversas (id),
  status public.status_locacao not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  modalidade public.modalidade_entrega not null,
  endereco_entrega text,
  valor_itens numeric(12, 2) not null,
  valor_frete numeric(12, 2),
  valor_total numeric(12, 2) not null,
  regra jsonb not null,
  expira_em timestamptz,
  chave_idempotencia text unique,
  criado_por_tipo public.tipo_ator not null,
  criado_por uuid references auth.users (id),
  aprovado_por uuid references auth.users (id),
  aprovado_em timestamptz,
  retirado_em timestamptz,
  devolvido_em timestamptz,
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim > inicio),
  check (status <> 'pre_reserva' or expira_em is not null)
);
create index locacoes_status_idx on public.locacoes (status);

create table public.locacao_itens (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes (id) on delete cascade,
  equipamento_id uuid not null references public.equipamentos (id),
  quantidade int not null check (quantidade between 1 and 100),
  valor_unitario numeric(12, 2) not null,
  valor_total numeric(12, 2) not null,
  explicacao text not null
);

-- Ocupação de uma unidade física num período: por locação ou por manutenção.
create table public.alocacoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id),
  tipo public.tipo_alocacao not null,
  locacao_id uuid references public.locacoes (id) on delete cascade,
  periodo tstzrange not null check (not isempty(periodo) and lower(periodo) is not null and upper(periodo) is not null),
  ativo boolean not null default true,
  motivo text,
  criado_em timestamptz not null default now(),
  check ((tipo = 'locacao') = (locacao_id is not null)),
  -- A garantia final contra reserva dupla, válida mesmo com requisições simultâneas.
  constraint alocacoes_sem_sobreposicao
    exclude using gist (unidade_id with =, periodo with &&) where (ativo)
);
create index alocacoes_locacao_idx on public.alocacoes (locacao_id);

-- Checklist de retirada e de devolução.
create table public.vistorias (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes (id) on delete cascade,
  tipo text not null check (tipo in ('retirada', 'devolucao')),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) > 0),
  observacoes text,
  realizado_por uuid references auth.users (id),
  realizado_em timestamptz not null default now(),
  unique (locacao_id, tipo)
);

-- Recebimentos manuais (sem integração bancária).
create table public.recebimentos (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references public.locacoes (id),
  valor numeric(12, 2) not null check (valor > 0),
  forma text not null check (forma in ('dinheiro', 'pix', 'cartao', 'boleto', 'transferencia', 'outro')),
  observacao text,
  recebido_em timestamptz not null default now(),
  registrado_por uuid references auth.users (id)
);

-- ---------------------------------------------------------------- histórico
create table public.historico (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  ator_tipo public.tipo_ator not null,
  ator_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id uuid,
  dados jsonb not null default '{}'::jsonb
);
create index historico_entidade_idx on public.historico (entidade, entidade_id, em desc);
