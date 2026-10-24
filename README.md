# Comercial — Plataforma AG Power

Comercial institucional de 90 s (pt-BR) feito a partir do briefing em `briefing.json`.
O vídeo é **animado em HTML**: cada quadro é calculado a partir do tempo, então o mesmo
arquivo serve para assistir no navegador e para renderizar o MP4.

## O que tem aqui

| Arquivo | Para quê |
|---|---|
| `comercial.html` | O comercial inteiro: 12 cenas, os 3 formatos e a versão curta |
| `render.mjs` | Renderiza o MP4 quadro a quadro (Playwright + ffmpeg) |
| `audio.py` | Gera a trilha instrumental e os efeitos sonoros (tudo sintetizado, sem direito autoral de terceiros) |
| `videos/` | **Os vídeos prontos** (MP4) e a trilha/efeitos separados em FLAC para a mixagem com a locução |
| `assets/logo-ag-power.png` | Logo usado no vídeo (o ícone oficial do app, `public/icons/icon-512.png` do repositório agpower) |
| `locucao/ROTEIRO-LOCUCAO.md` | Roteiro para o locutor, **com o alerta de tempo (leia antes de gravar)** |
| `locucao/locucao-90s.srt`, `locucao-60s.srt` | Legendas da locução (versão B) |
| `briefing.json` | Briefing original. Os campos `video_referencia` continuam vazios, para preencher |
| `dist/` | Saída local do `render.mjs` (fica fora do git; o que vale publicar é copiado para `videos/`) |

## Assistir

Abra `comercial.html` no navegador (Chrome ou Edge). Há uma barra de controle: play/pause (espaço),
linha do tempo, escolha do formato (16:9, 9:16, 1:1) e versão de 60 s. O áudio vem do MP4 em
`videos/`.

Pela URL: `comercial.html?f=9x16&cut=60&t=42` (formato, versão curta, abrir parado num segundo).

## Renderizar os MP4

Precisa de Node 18+, Playwright com Chromium, ffmpeg e python3 com numpy.

```sh
cd comercial
node render.mjs 16x9          # 90 s, 1920×1080
node render.mjs all           # 16:9, 9:16 (1080×1920) e 1:1 (1080×1080)
node render.mjs all --cut     # versão curta, sem as cenas 3, 4 e 6
```

Saída em `dist/`: `ag-power-comercial-90s-16x9.mp4` etc. (H.264, 30 fps, AAC 192 kbps), mais
`audio-90s.wav` (mix), `audio-90s-trilha.wav` e `audio-90s-efeitos.wav` (separados, para a mixagem
com a locução). Leva uns 2,5 min por formato.

## Cenas (16:9, 90 s)

| # | Tempo | Cena | Texto na tela |
|---|---|---|---|
| 1 | 0–6 | Telhado em Campinas/SP ao nascer do sol; o sol vira o destaque do logo | E depois da instalação? |
| 2 | 6–13 | Logo, computador e celular, 5 ícones em sequência; zoom no celular | Plataforma AG Power · Tudo num lugar só |
| 3 | 13–21 | Planilha × agenda: criar, remarcar, mudar horário, concluir, cancelar; cadastro automático | A planilha continua sendo a base · Atualiza a cada 15 min (6h–22h) · Cadastro automático |
| 4 | 21–27 | Clique no "Cliente Exemplo", a OS abre, remarcar e "quem vai?" | Um clique, a OS inteira · Remarcar e definir "quem vai" |
| 5 | 27–42 | Técnico no telhado + telas do app (iniciar, fotos, materiais, ficha, assinaturas, sem sinal) | as 6 etapas, uma a uma |
| 6 | 42–49 | PDF montado → compartilhar → WhatsApp → celular do cliente | Relatório em PDF · Enviado pelo WhatsApp |
| 7 | 49–58 | Painel com 5 blocos, resumo da semana e aviso de segunda às 7h40 | Centro de Operações · Hoje · Atrasados · Sem técnico · Resumo da semana |
| 8 | 58–66 | Linha do tempo de 9 etapas acendendo; uma passa do prazo e pisca | as 9 etapas · Prazo por etapa + alerta |
| 9 | 66–73 | SolarMan, Solis e HYXi conectando; uma usina parou e outra gera abaixo | Coleta 3x ao dia · Antes do cliente reclamar |
| 10 | 73–80 | Portal no celular (entrar sem e-mail, jornada, geração, histórico, chamados) + selo Plano Power | Portal do cliente · Plano Power |
| 11 | 80–86 | 5 cartões semitransparentes, tracejados, com selo EM BREVE; recolhem no logo | EM BREVE + os 5 itens |
| 12 | 86–90 | Logo, celular, Campinas/SP | Plataforma AG Power · O pós-venda inteiro, num lugar só |

**Versão curta:** sem as cenas 3, 4 e 6, como o briefing pede, ela fica com **69 s**, não 60 s.
Para chegar a 60 s seria preciso encurtar outras cenas; isso precisa de uma decisão de vocês.

## Checklist do briefing

- [x] Nenhum nome de cliente real: só "Cliente Exemplo", "Cliente A–F", "Usina 01–06", "Técnico 1–3".
- [x] Nenhum valor em reais. As telas também não mostram números inventados (kWh, tensões,
      contagens): onde haveria um dado, aparecem barras e marcadores genéricos.
- [x] Cena "Em breve" visualmente diferente (cartões semitransparentes e tracejados, selo
      EM BREVE em cada um) e textos sem verbo no presente.
- [x] "Plataforma AG Power" em toda a peça. Financeiro não aparece.
- [x] As perguntas Sim/Não da ficha técnica são as do app (`src/components/tech/ficha-tecnica.tsx` no repositório agpower).
- [ ] **Locução:** o texto do briefing não cabe em 90 s (ver `locucao/ROTEIRO-LOCUCAO.md`).
- [ ] **Logo:** o vídeo usa o ícone do app. Se houver um arquivo oficial com o nome escrito,
      substitua `assets/logo-ag-power.png` (PNG quadrado com fundo transparente) e renderize de novo.
- [ ] **Vídeos de referência:** ainda não foram anexados (`video_referencia` vazio). Quando chegarem,
      dá para ajustar ritmo e transições cena a cena.
- [ ] Cena 9: "SolarMan", "Solis" e "HYXi" aparecem só como texto, não com os logos das marcas.
      Usar os logos depende de autorização das marcas.

## Como ajustar

Cada cena é um bloco `S({ id, name, dur, html, update, sfx })` em `comercial.html`:

- `dur`: duração em segundos. Mudou aqui, a linha do tempo, os efeitos sonoros e a trilha se ajustam.
- `html`: o conteúdo da cena. Textos na tela ficam aqui.
- `update(root, t)`: a animação, com `t` em segundos desde o início da cena.
- `sfx`: efeitos sonoros `[segundo, tipo]` (`tap`, `check`, `notify`, `whoosh`, `alert`…).

Cores e fontes ficam nas variáveis CSS no topo (`--navy`, `--sun`…). A tipografia é Inter
(bold nos títulos, regular no apoio).
