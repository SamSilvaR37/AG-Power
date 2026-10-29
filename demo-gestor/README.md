# Demonstração real da AG Power — vídeo 1 de 3: a visão do gestor (16:9, 93 s)

Feito a partir de `briefing.json` (o JSON do vídeo 1). As telas do app são **os prints reais**
enviados (`prints/`), só com zoom, deslize e contorno; nada foi redesenhado nem inventado.
**Com narração** (ElevenLabs, voz masculina "Brian") e legendas embutidas.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O vídeo animado (1920×1080). Abra no navegador para assistir |
| `prints/` | Os 4 prints usados, **já com nomes de clientes borrados** (mosaico + desfoque forte) |
| `falas.js`, `roteiro.json` | Tempo de cada palavra da voz e duração das cenas (geradas por `montar_falas.py`) |
| `legendas-93s.srt` | Legendas (as mesmas que estão no vídeo) |
| `../videos/narrado/demo-gestor-93s-16x9-narrado.mp4` | **O vídeo final, com narração** |
| `../videos/demo-gestor-93s-16x9.mp4` | O vídeo sem voz (trilha e legendas) |

## O que ficou de fora, e por quê

O briefing manda pular a cena cujo print falta, em vez de criar uma tela parecida. Vieram 13 prints
**do celular** (vertical), e não os 9 do computador que o roteiro lista. Resultado:

| Cena do briefing | Situação |
|---|---|
| 1 Abertura, 2 Centro de Operações, 3 Precisa decidir, 4 Implantações, 7 Monitoramento, 9, 10, 12 | **Feitas** |
| 5 Agenda sincronizada com a planilha | **Pulada**: falta o print P04 (agenda com a barra de sincronização) |
| 6 Ordem de serviço concluída | **Pulada**: faltam P05a, P05b e P05c |
| 8 Só 59 no Plano Power | **Feita sem print**: falta P07 (Clientes com Plano Power ligado). Usei um cartão de números sobre fundo escuro, com os dados de `numeros_reais` (646, 59, 9,1%). Quando chegar o print, troco |
| 11 Um toque para ativar | **Pulada**: falta o print P08 (janela "Ativar Plano Power") |

Por isso o vídeo tem **93 s** e não os ~110 s do briefing.

## Como os prints do celular entraram no quadro 16:9

O quadro de 1920×1080 tem a coluna de texto à esquerda e, à direita, uma janela vertical que mostra
o print na largura real, com deslize e zoom de até 1,14× (o briefing permite 1,15×). Os contornos
(cor de destaque do app, entrando em 0,3 s) acompanham a palavra falada, usando o tempo de cada palavra
devolvido pela ElevenLabs.

## Conferência dos números

| Onde | Número | De onde vem |
|---|---|---|
| Cenas 2 e 7 | 150 usinas sem dado, de 583 monitoradas, há 2+ dias | **No print** (cartão "Usinas sem dado") |
| Cena 4 | 130 em implantação, 112 fora do prazo | **No print** |
| Cena 8 | 646 em operação, 59 no Plano Power, 9,1% | `numeros_reais` do briefing (sem print para conferir) |
| Cenas 9 e 10 | R$ 69.837, R$ 229.634, R$ 159.796,80, 194 e 135 clientes | Contas do briefing, conferidas: 59 × 98,64 × 12 = 69.837,12; 194 × 98,64 × 12 = 229.633,92; 135 × 98,64 × 12 = 159.796,80 (194 = 30% de 646) |

O print do Monitoramento mostra a plataforma SolarMan (398 usinas), parte das 583; a narração e a
sobreposição usam os 583 e 150 do painel, que são os do print P01.

## Privacidade

Todos os nomes de clientes visíveis foram borrados nos 4 prints usados: serviços sem técnico, serviços
atrasados (cenas 3 e 4). Os prints originais, sem borrão, **não estão no repositório**. Aparece o nome
"Samuel" ("Bom dia, Samuel"), que é do usuário do app. Os prints que não usei (agenda de hoje, técnicos,
lista de usinas, login) mostram nomes de clientes e técnicos e ficaram de fora.

## Antes de publicar (checklist do briefing)

- [ ] **Confirmar com a AG Power se o preço do Plano Power é mensal.** O selo da tela diz
      "Simulação · preço típico R$ 98,64/mês · base: 646 usinas em operação", como o briefing manda,
      mas a planilha não informa o período.
- [x] Números dos prints conferidos com `numeros_reais` (150/583 e 112/130 batem).
- [x] Nomes de clientes borrados nos prints usados.
- [x] Selo "Simulação" visível nas cenas 9 e 10 (as únicas com R$).
- [ ] Assistir uma vez sem som para ver se as legendas contam a história sozinhas.

## Renderizar de novo

```sh
# voz (ELEVENLABS_API_KEY no ambiente) e tempo das palavras
cd locucao
python3 tts.py elevenlabs --voz-id nPczCjzI2devNBz1zQrb --tempos --roteiro ../demo-gestor/roteiro.json --saida ../demo-gestor/voz
cd ../demo-gestor && python3 montar_falas.py && cd ..
# vídeo e mixagem
node render.mjs 16x9 --pagina demo-gestor/index.html --nome demo-gestor
cp dist/demo-gestor/demo-gestor-93s-16x9.mp4 videos/
for k in trilha efeitos; do ffmpeg -y -i dist/demo-gestor/audio-93s-$k.wav videos/audio/demo-gestor-$k-93s.flac; done
cd locucao && python3 narracao.py --roteiro ../demo-gestor/roteiro.json --nome demo-gestor --versao 93s --voz ../demo-gestor/voz
```
