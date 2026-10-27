# Dimensionamento Solar Autoral — Inversor 5 kW (9:16, 85 s)

Versão **autoral** do vídeo educativo "Quantas placas cabem em um inversor de 5 kW?", feita a partir
de `briefing.json`. Usa só o tema e a lógica didática em etapas; toda a direção de arte é nova.
**Exemplo educativo hipotético:** sempre conferir o datasheet real antes de dimensionar.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O vídeo animado (8 cenas, 1080×1920). Abra no navegador para assistir |
| `legendas-85s.srt` | As mesmas legendas embutidas no vídeo, para subir separadas se preferir |
| `roteiro.json` | Narração por cena (texto do briefing + mensagem final), usada pelo pipeline de voz |
| `briefing.json` | Briefing original |
| `../videos/dimensionamento-5kw-autoral-85s-9x16.mp4` | O vídeo pronto: legendas embutidas, trilha e efeitos, **ainda sem voz** |
| `../videos/audio/dimensionamento-5kw-autoral-{trilha,efeitos}-85s.flac` | Trilha e efeitos separados |

## Direção de arte (o que é novo)

- **Estilo:** infográfico isométrico com HUD de dashboard de engenharia sobre blueprint digital
  (grade fina e grossa, granulado leve, vinheta), cores do briefing: #0F172A, âmbar #F59E0B,
  azul-céu #38BDF8, verde #22C55E e vermelho #EF4444.
- **Inversor:** desenho genérico gerado em isometria 3/4: corpo vertical cinza-claro fosco, lateral
  grafite com aletas, tampo claro, LCD no canto superior direito, dois LEDs e quatro entradas
  numa faixa grafite embaixo da frente (dois pares: MPPT 1 e MPPT 2). Nunca aparece de frente nem
  centralizado: fica de lado, embaixo à direita ou à esquerda, conforme a cena.
- **Módulos:** isométricos, inclinados, moldura preta fina, células azul-escuras em degradê e sombra
  no chão; flutuam na abertura.
- **Cards:** HUD translúcido com cantoneiras azul-céu; o dado em foco ganha borda âmbar e uma linha
  tracejada ligando ao LCD do inversor (cena 3). Na cena 4, balões com linhas ligam cada dado a um
  ponto do módulo.
- **Transições:** varredura técnica: uma linha azul-céu desce e revela a cena seguinte.
- **Estrutura em etapas:** indicador fixo "01 / 08" com barra de progresso no topo.
- **Legendas:** faixa inferior de alto contraste com filetes azul-céu, palavras-chave em âmbar.
- **Trilha** leve, sem bateria pesada, e sons de interface (tiques, "swish" nas transições, "check").

## Contas conferidas

6 × 41,8 V = 250,8 V; corrente da string = 13,16 A (em série não soma) < 16 A por MPPT;
12 × 550 Wp = 6.600 Wp = 6,6 kWp (≤ 7,5 kWp recomendados).

## Decisões e pontos de atenção

- **Tempo das cenas redistribuído (sem cortar texto):** 7 / 8 / 12,5 / 13,5 / 9 / 9,5 / 10 / 15,5 s,
  total 85 s. No briefing, a cena 8 tem 11 s, mas a fala dela + a mensagem final precisam de ~16 s,
  e a cena 4 precisa de ~14 s; o tempo saiu das cenas com fala curta (1, 2, 5 e 7).
- **Mensagem final** ("EXEMPLO EDUCATIVO. SEMPRE CONFIRA O DATASHEET REAL.") entra na cena 8, depois do
  checklist, na tela e na narração.
- **Voc no frio não aparece:** este briefing não inclui a verificação do Voc em baixa temperatura (a
  versão anterior incluía). Por isso o vídeo não compara os 250,8 V da string com os 600 V do
  inversor: a tensão máxima se confere com o Voc corrigido pela temperatura mínima, não com o Vmp.
  Se quiser, dá para acrescentar uma etapa curta sobre isso.
- **Cena 6:** o chip "6 × 13,16 A? não" mostra o erro sem pôr o resultado da soma na tela.
- Nenhuma marca real, logotipo de fabricante ou identidade do vídeo de referência.

## Renderizar e narrar

```sh
node render.mjs 9x16 --pagina dimensionamento-5kw-autoral/index.html --nome dimensionamento-5kw-autoral

cd locucao   # precisa da chave GOOGLE_TTS_API_KEY no ambiente
python3 tts.py google --voz pt-BR-Neural2-B --roteiro ../dimensionamento-5kw-autoral/roteiro.json --saida ../dimensionamento-5kw-autoral/voz
python3 narracao.py --roteiro ../dimensionamento-5kw-autoral/roteiro.json --nome dimensionamento-5kw-autoral --versao 85s --voz ../dimensionamento-5kw-autoral/voz
```
