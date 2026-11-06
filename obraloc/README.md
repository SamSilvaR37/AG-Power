# ObraLoc — locação de equipamentos + atendimento por WhatsApp

Solução SUNA para uma locadora de equipamentos para construção civil. **ObraLoc** é marca provisória.
Todos os dados deste projeto são **fictícios** e nenhum WhatsApp real está conectado.

> Este é um projeto independente. Ele fica dentro do repositório `AG-Power` só porque é onde a
> sessão tinha acesso; não usa nada do CRM solar AG Power nem do banco dele. Pode ser movido
> para um repositório próprio sem mudar nada.

## Fluxo do MVP

```
WhatsApp → necessidade → disponibilidade → orçamento → aceite → pré-reserva
        → aprovação humana → locação → retirada → devolução
```

A confirmação final é sempre da equipe. O assistente nunca aprova locação, nunca registra
pagamento e nunca confirma devolução.

## Arquitetura

| Camada | Responsabilidade |
|---|---|
| **Banco (Supabase/Postgres)** | Fonte da verdade. Calcula preço, verifica disponibilidade, garante que não haja reserva dupla e executa as mudanças de estado. |
| **Funções da equipe** | `aprovar_pre_reserva`, `registrar_retirada`, `registrar_devolucao`, `registrar_recebimento`… cada uma confere a permissão do usuário. |
| **Ferramentas do assistente** (`bot_*`) | Única porta da IA para o sistema. Papel `obraloc_bot` sem acesso a tabelas. |
| **Integração WhatsApp** | Papel `obraloc_integracao`: registra mensagens recebidas (com deduplicação) e despacha a fila de saída. Os adaptadores de provedor ficam fora do banco. |
| **App (próximas etapas)** | React + TypeScript. Painel, cadastros, caixa de atendimento. |

### Decisões importantes

- **Pré-reserva e locação são o mesmo registro** (`locacoes`), que só muda de status:
  `pre_reserva → confirmada → em_andamento → devolvida` (ou `expirada` / `cancelada`).
  Aprovar não copia nada, então não pode conflitar consigo mesma.
- **Unidades físicas são alocadas já na pré-reserva** (`alocacoes`). Uma restrição
  `EXCLUDE USING gist` impede duas alocações ativas da mesma unidade em períodos sobrepostos.
  É a barreira final, válida mesmo com pedidos simultâneos. Antes dela, uma trava por
  equipamento (`pg_advisory_xact_lock`) faz o segundo pedido esperar e receber "indisponível".
- **Manutenção usa a mesma tabela de alocações**, então manutenção e reserva também não se sobrepõem.
- **Atrasos**: locação em andamento que passou da data continua bloqueando a unidade até
  *agora + `atraso_bloqueio_horas`* (configurável). Reservas seguintes que dependem dessa unidade
  aparecem em `v_reservas_em_risco`, a retirada delas é barrada e a equipe pode usar
  `realocar_unidade`. Ao reservar, o sistema prefere unidades que já estão na loja.
- **Expiração**: pré-reserva vencida deixa de bloquear na hora (consulta por `expira_em`) e é
  marcada como `expirada` pela rotina `expirar_pre_reservas()` ou na próxima reserva. O prazo
  é configurável (`configuracoes.pre_reserva_minutos`, padrão 120).
- **Idempotência**: webhook deduplicado por id do evento **e** por id da mensagem; orçamento
  e pré-reserva do assistente exigem chave de idempotência (derivada da mensagem do cliente).
  Um orçamento gera no máximo uma locação.
- **Pausa do bot**: cada conversa tem `epoca_bot`. Assumir o atendimento incrementa a época,
  cancela as respostas do bot que ainda estão na fila e faz o assistente recusar qualquer
  gravação da época antiga, mesmo que estivesse no meio do processamento. O bot só volta com
  "Devolver ao assistente".

### Cobrança configurável

A regra de diárias da demonstração **não** foi adotada como definitiva. Há duas regras de
exemplo, ambas marcadas como **demonstrativas**:

| Código | Método | Contagem |
|---|---|---|
| `pacotes-24h-demo` (padrão) | menor custo combinando diária/semana/quinzena/mês da tabela | cada 24 h ou fração = 1 dia |
| `diaria-calendario-demo` | dias × diária | cada dia de calendário = 1 dia |

Todo orçamento grava a regra usada e uma explicação por item, por exemplo
`1 × semana (R$ 380,00) + 2 × diária (R$ 90,00)`. **Frete de entrega não é calculado**: fica
"a confirmar pela equipe" (`definir_frete`). **Multa por atraso não existe**: a devolução
apenas sinaliza o atraso.

### Permissões padrão (ajustáveis em `permissoes_papel`)

| Permissão | admin | atendente |
|---|:-:|:-:|
| atender conversas, clientes, orçamentos | ✔ | ✔ |
| aprovar locação, registrar retirada e devolução, manutenção | ✔ | ✔ |
| registrar pagamento | ✔ | — |
| catálogo e preços, configurações, equipe | ✔ | — |

Essa divisão é um ponto de partida e **precisa ser confirmada com os proprietários**.

## Estrutura

```
obraloc/
├── supabase/
│   ├── migrations/
│   │   ├── …0100_obraloc_base.sql         tabelas, tipos, restrição contra reserva dupla
│   │   ├── …0200_obraloc_regras.sql       permissões, cobrança, disponibilidade
│   │   ├── …0300_obraloc_operacoes.sql    orçamento → pré-reserva → aprovação → retirada → devolução
│   │   ├── …0400_obraloc_atendimento.sql  webhook, fila de saída, pausa do bot, ferramentas bot_*
│   │   └── …0500_obraloc_seguranca.sql    papéis, RLS, permissões de execução
│   ├── seed.sql                           dados FICTÍCIOS (catálogo, clientes, locações, conversas)
│   └── tests/                             testes SQL (rodam em Postgres local)
└── scripts/
    ├── db-test.sh                         sobe Postgres temporário, aplica tudo e testa
    └── db-test-concorrencia.sh            conexões simultâneas de verdade
```

## Como testar

Requer PostgreSQL 16 instalado localmente (não usa nenhum projeto Supabase):

```sh
cd obraloc
scripts/db-test.sh            # VERBOSE=1 mostra cada verificação; KEEP=1 mantém o banco no ar
```

O que é verificado (153 verificações SQL + 5 cenários de concorrência):

- dois clientes (e doze) tentando a última unidade no mesmo período: só um consegue;
- webhook duplicado, inclusive em entregas simultâneas;
- datas inválidas, data passada, equipamento inexistente ou indisponível;
- falha de consulta (sem regra de cobrança, tabela inacessível): erro explícito, nenhum valor inventado;
- equipe assumindo a conversa com resposta do bot na fila e com o bot no meio do processamento;
- expiração de pré-reserva (consulta e rotina) e liberação da unidade;
- aprovação que converte a pré-reserva na mesma locação, sem conflito consigo mesma;
- atraso bloqueando a reserva seguinte e liberação após a devolução;
- devolução liberando a unidade, ou mandando para manutenção quando há avaria;
- RLS: anônimo e usuário sem perfil não veem nada; atendente não altera preços nem configurações;
  assistente e integração não leem tabelas nem aprovam nada.

## Plano de etapas

1. **Banco, regras e dados fictícios** ✅ (esta entrega)
2. App React + TypeScript com o mesmo banco rodando no navegador (PGlite, mesmas migrações),
   login de demonstração admin/atendente: painel, catálogo, clientes, disponibilidade por período.
3. Camada de provedores WhatsApp (interface única + provedor simulado) e caixa de atendimento
   com simulador de mensagens recebidas.
4. Assistente de demonstração **determinístico** (identificado como tal) usando só as ferramentas
   `bot_*`, com a interface pronta para conectar uma IA depois. Áudio: sem serviço de transcrição,
   pede texto.
5. Telas de pré-reserva e aprovação, retirada e devolução com checklist, recebimentos e histórico.
6. Ligação a um Supabase real e a um provedor de WhatsApp, **somente com autorização**: funções
   de servidor para webhook, despachante e assistente, com segredos em variáveis de ambiente.

## O que ainda é simulado ou está pendente

- Nenhum app de interface ainda (etapa 2).
- Nenhum provedor de WhatsApp: existe só o provedor `simulado`. A validação de assinatura do
  webhook depende do provedor escolhido. **Antes de integrar, é preciso definir qual será usado.**
- Nenhuma IA: as ferramentas existem, o assistente ainda não.
- Sem transcrição de áudio: a mensagem fica marcada como `pendente`/`indisponivel`.
- Os papéis `obraloc_bot` e `obraloc_integracao` estão prontos no banco. No Supabase real, o
  servidor vai assumi-los por um JWT com a claim `role`; essa ligação será feita na etapa 6.
- Usuários da equipe de teste existem só nos testes (`tests/01_fixtures.sql`).
