# Quantas placas solares cabem em um inversor de 5 kW? (9:16, 85 s)

Vídeo educativo vertical (Reels, TikTok, Shorts) em motion graphics 2D, feito a partir do briefing
em `briefing.json`. **Os dados são hipotéticos**, só para uma simulação didática, e o vídeo diz isso
na tela ("Exemplo ilustrativo · dados hipotéticos" em todas as cenas técnicas e aviso final).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O vídeo animado (8 cenas, 1080×1920). Abra no navegador para assistir |
| `legendas-85s.srt` | As mesmas legendas que já estão embutidas no vídeo, para subir separadas se preferir |
| `roteiro.json` | Narração por cena (texto do briefing), usada pelo pipeline de voz |
| `briefing.json` | Briefing original |
| `../videos/dimensionamento-5kw-85s-9x16.mp4` | O vídeo pronto: legendas embutidas, trilha e efeitos, **ainda sem voz** |
| `../videos/audio/dimensionamento-5kw-{trilha,efeitos}-85s.flac` | Trilha e efeitos separados, para mixar com a voz |

## Cenas

| # | Tempo | O que aparece |
|---|---|---|
| 1 | 0–8 | 12 módulos sobre o inversor de 5 kW; "5.000 ÷ 550 = 9?" leva um X vermelho |
| 2 | 8–18 | Ficha técnica do inversor; destaque em 600 V, partida 100 V, 2 MPPTs, 16 A e 7,5 kWp |
| 3 | 18–29 | Ficha do módulo 550 Wp; Vmp/Voc em amarelo (tensão), Imp/Isc em azul (corrente) |
| 4 | 29–42 | Seis módulos entram em série; barra soma até 250,8 V (Vmp); depois Voc 299,4 V a 25 °C |
| 5 | 42–53 | Termômetro de 25 °C a 0 °C; Voc sobe até ≈ 320,4 V, abaixo dos 600 V |
| 6 | 53–64 | String ligada ao MPPT 1; "a mesma corrente passa por todos"; 13,16 A ≤ 16 A e 13,9 A ≤ 20 A |
| 7 | 64–75 | Segunda string no MPPT 2; 12 × 550 Wp = 6.600 Wp; 6,6 kWp ÷ 5 kW = 1,32; ≤ 7,5 kWp |
| 8 | 75–85 | Resumo (5 kW CA, 6,6 kWp CC, 2 MPPTs, 6 por string), selo EXEMPLO ILUSTRATIVO e aviso final |

## Contas conferidas

- Vmp da string: 6 × 41,8 = 250,8 V (dentro da faixa de MPPT 90–550 V e acima da partida de 100 V).
- Voc da string a 25 °C: 6 × 49,9 = 299,4 V.
- Voc a 0 °C: 299,4 × (1 + 0,28% × 25) = 299,4 × 1,07 = 320,36 V ≈ 320,4 V, abaixo de 600 V.
- Corrente: em série a corrente não soma; Imp 13,16 A ≤ 16 A e Isc 13,9 A ≤ 20 A por MPPT.
- Potência: 12 × 550 Wp = 6.600 Wp = 6,6 kWp; 6,6 ÷ 5 = 1,32; 6,6 kWp ≤ 7,5 kWp recomendados.

## Decisões

- **Legendas embutidas** no vídeo, palavras-chave em amarelo, na faixa logo abaixo do conteúdo e
  acima da área da interface do Reels. Sem narração, elas seguem o tempo previsto da fala de cada
  cena; quando a voz entrar, os tempos continuam valendo (cada fala começa 0,3 s depois do início
  da cena).
- **Unidades preservadas:** os títulos em maiúsculas foram escritos à mão para não virar "KW",
  "WP" ou "VOC".
- **Cena 6:** em vez de mostrar uma soma errada com valor (6 × 13,16), o vídeo mostra
  "13,16 + 13,16 + … ? — não soma", para não pôr na tela um número que não está no briefing.
- **Música** leve, sem bateria (só pad e arpejo), para não competir com a voz.
- Nenhuma marca, logo ou identidade de terceiros, como pede o briefing. Também não leva a marca
  AG Power, porque o briefing não pede.

Antes de publicar, o briefing pede revisão do dimensionamento completo por profissional habilitado
(temperatura extrema, limites de MPPT, corrente, conectores e normas).

## Renderizar e narrar

```sh
# vídeo (a partir da raiz do repositório)
node render.mjs 9x16 --pagina dimensionamento-5kw/index.html --nome dimensionamento-5kw

# narração (precisa da chave GOOGLE_TTS_API_KEY no ambiente)
cd locucao
python3 tts.py google --voz pt-BR-Neural2-B --roteiro ../dimensionamento-5kw/roteiro.json --saida ../dimensionamento-5kw/voz
python3 narracao.py --roteiro ../dimensionamento-5kw/roteiro.json --nome dimensionamento-5kw --versao 85s --voz ../dimensionamento-5kw/voz
```
