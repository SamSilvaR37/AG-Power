# Dinheiro na Mesa — Plano Power (vídeo interno, 60 s)

**Uso interno, para donos e gerência.** Os valores em reais são uma **simulação**, não faturamento
real, com o preço típico de **R$ 98,64 por usina** da tabela oficial do Plano Power (AGENDA 2026.xlsx,
aba "PRECIFICACAO AVULSO E PLANO POS"; mediana das 97 usinas com número de placas cadastrado).
Os números da base vêm da plataforma AG Power em 24/10/2026.

> **A tabela não informa o período.** O briefing trata o preço como mensal, mas proíbe afirmar isso
> sem confirmar com a empresa. Por isso todo "/mês" no vídeo tem asterisco, e o rodapé diz
> "período da tabela tratado como mensal, a confirmar". Confirmado o período, é só tirar o asterisco.

> Antes de mostrar a outras pessoas: conferir no Groner quantos dos 59 clientes marcados como
> Plano Power realmente pagam (item do checklist do briefing).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O vídeo animado (9 cenas, 16:9, 9:16 e 1:1). Abra no navegador para assistir |
| `roteiro.json` | Locução por cena (usada pelas legendas e pela narração) |
| `locucao-60s.srt` | Legendas da locução |
| `briefing.json` | Briefing original |
| `../videos/dinheiro-na-mesa-60s-*.mp4` | Os vídeos prontos (com trilha e efeitos, ainda sem voz) |
| `../videos/audio/dinheiro-na-mesa-{trilha,efeitos}-60s.flac` | Trilha e efeitos separados, para mixar com a voz |

## Cenas

| # | Tempo | O que aparece | Texto na tela |
|---|---|---|---|
| 1 | 0–5 | Mesa escura, pilha de moedas se formando | Dinheiro na Mesa |
| 2 | 5–12 | Contador até 751; grade de 751 pontos (um por usina) acendendo; 636 em operação | 751 usinas cadastradas · 636 em operação |
| 3 | 12–19 | Os pontos viram barras; só 59 acendem em amarelo | 59 no Plano Power · 7,9% da base (59 de 751) |
| 4 | 19–25 | As 692 barras cinzas pulsam; corte seco no fim | 692 usinas fora do plano · sem acompanhamento recorrente |
| 5 | 25–35 | Barra de 59 para 225; contadores mensal e anual; selo SIMULAÇÃO | 30% da base = 225 clientes · R$ 98,64 por usina (tabela oficial) · R$ 22.194/mês* · R$ 266.328/ano |
| 6 | 35–42 | Hoje (cinza) × 30% (amarelo); pilha de moedas | Hoje: R$ 5.820/mês* · 30%: R$ 22.194/mês* · + R$ 196.491/ano |
| 7 | 42–50 | Três colunas: 30%, 50% e 100% da base | R$ 266 mil · R$ 444 mil · R$ 889 mil por ano |
| 8 | 50–56 | Monitoramento (uma usina "parou de mandar dados") e portal no celular | Monitoramento já funcionando · +108 implantações nos últimos 30 dias |
| 9 | 56–60 | Logo | Plano Power · O dinheiro está na mesa. |

Todas as contas foram conferidas: 59/751 = 7,86% → 7,9%; 751 − 59 = 692; 30% de 751 = 225;
59 × R$ 98,64 = R$ 5.819,76 → R$ 5.820; 225 × R$ 98,64 = R$ 22.194 (× 12 = R$ 266.328);
375 × 98,64 × 12 = R$ 443.880 → R$ 444 mil; 751 × 98,64 × 12 = R$ 888.943,68 → R$ 889 mil;
166 × 98,64 × 12 = R$ 196.490,88 → **R$ 196.491** (o briefing escreve 196.490, que é o valor truncado).

## Decisões e pontos para conferir

- **Selo SIMULAÇÃO** fixo no canto e rodapé com o preço, a fonte, o aviso do período e "não é
  faturamento real" em toda cena com valor em reais (5, 6 e 7). "Uso interno" no canto
  de todas as cenas.
- **Cena 3:** nota "Usinas marcadas como Plano Power na plataforma AG Power em 24/10/2026", porque
  o número ainda precisa ser conferido no Groner.
- **Cena 8:** o briefing diz "+108 implantações no último mês"; os dados dizem "cerca de 108 nos
  últimos 30 dias". Usei "nos últimos 30 dias", que é o que o dado sustenta.
- **Grade de usinas:** cada ponto é uma usina (751 no total), mas quais pontos são "em operação"
  ou "Plano Power" é sorteio ilustrativo, não a posição real.
- **Preço piso (R$ 89,77)** e o **plano de entrada de R$ 10** estão no briefing, mas nenhuma cena os
  usa; ficaram de fora.
- **Locução:** duas falas foram encurtadas para caber no tempo (precisa de aprovação):
  - Cena 5 (10 s): o original tem ~37 palavras faladas. Virou "Se só 30% da base estivesse no Plano
    Power, pela nossa própria tabela, seriam 225 clientes: mais de duzentos e sessenta mil por ano."
    Isso também tira o "por mês" falado, que afirmaria o período antes de ele ser confirmado.
  - Cena 8 (6 s), original com 27 palavras (precisaria de ~10 s): virou "E a ferramenta já existe:
    mostra quem parou antes do cliente reclamar. E a base cresce todo mês."
  As demais estão iguais ao briefing.

## Renderizar e narrar

```sh
# vídeos (a partir da raiz do repositório)
node render.mjs all --pagina dinheiro-na-mesa/index.html --nome dinheiro-na-mesa

# narração (precisa da chave GOOGLE_TTS_API_KEY no ambiente; ver ../README.md)
cd locucao
python3 tts.py google --voz pt-BR-Neural2-B --roteiro ../dinheiro-na-mesa/roteiro.json --saida ../dinheiro-na-mesa/voz
python3 narracao.py --roteiro ../dinheiro-na-mesa/roteiro.json --nome dinheiro-na-mesa --versao 60s --voz ../dinheiro-na-mesa/voz
```
