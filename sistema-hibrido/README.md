# Quando falta energia, a casa com solar continua ligada? (9:16, 120 s)

Vídeo educativo sobre **sistema fotovoltaico híbrido com backup**, feito a partir de `briefing.json`
e `roteiro-original.md`. Segue o storyboard e os tempos originais (10 cenas, 120 s), com a
narração do roteiro sem cortes.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O vídeo animado (1080×1920). Abra no navegador para assistir |
| `legendas-120s.srt` | As mesmas legendas embutidas no vídeo |
| `roteiro.json` | Narração por cena, usada pelo pipeline de voz |
| `briefing.json`, `roteiro-original.md` | Briefing e roteiro originais (com a revisão técnica e as fontes) |
| `../videos/sistema-hibrido-120s-9x16.mp4` | O vídeo pronto: legendas, trilha e efeitos, **ainda sem voz** |
| `../videos/audio/sistema-hibrido-{trilha,efeitos}-120s.flac` | Trilha e efeitos separados |

## Direção de arte

- **Maquete arquitetônica em isometria** sobre fundo off-white, com sombras suaves e paredes em corte
  (topo da mureta em grafite, como em desenho de corte). Nas cenas internas, o telhado com os
  painéis aparece **elevado acima da casa** (vista explodida de maquete) para mostrar o interior.
- **Inversor híbrido genérico:** gabinete vertical branco fosco, faixa grafite lateral, visor pequeno
  na parte de baixo, na parede em 3/4. **Bateria:** dois módulos grafite ao lado.
  O inversor on-grid da cena 2 é outro equipamento (caixa cinza menor, sem bateria).
- Paleta do briefing; fluxos: **âmbar = solar**, **verde = backup**, **petróleo = rede**.
- Legendas grandes, até 2 linhas, em faixa grafite acima da área dos botões do Instagram.
- Sons: queda de rede, clique de transferência, sinal de confirmação; música discreta sem bateria.

## Revisão técnica (itens do roteiro e como o vídeo trata cada um)

1. Fala de **sistema híbrido com backup** em todo o vídeo, não de "todo híbrido".
2. **On-grid desliga sem rede:** na cena 2, os fluxos param na queda e o fio da rede leva um X.
   Nenhuma partícula vai para a rede depois da queda (cenas 2 e 5).
3. **Não promete a casa inteira:** cena 6 separa BACKUP e CARGAS COMUNS, com nota de que backup
   total exige dimensionamento, chaveamento e equipamentos compatíveis.
4. **Sem tempo de comutação:** na cena 5 a luz pisca e volta, sem cronômetro nem número.
5. **kW × kWh:** cena 8 mostra dois medidores separados (potência e energia).
6. **8 kWh disponíveis na saída CA**, com nota de que não é a capacidade nominal da bateria e de
   que o exemplo é idealizado, com consumo constante.
7. A autonomia real (SOC, perdas, temperatura, envelhecimento) está coberta pela nota da cena 8 e
   pela frase "A autonomia depende da carga e da energia armazenada" (cena 7).
8. **Potência limitada:** cena 9, limite "5 kW — exemplo hipotético", picos de partida como traços
   curtos e aviso de sobrecarga. As barras não têm valores individuais, para não inventar números.
9. Painéis no backup: a cena 7 traz "conforme o modelo e as configurações".
10. A cena 10 fecha com "Confira o manual dos equipamentos e as regras da distribuidora".

O excedente para a rede (cena 4) é um fluxo pontilhado com o rótulo "se permitido", e uma nota
diz que os caminhos variam com o modelo, as configurações e as regras de conexão.

Nenhuma marca de fabricante aparece no vídeo. As fontes do roteiro citam fabricantes, mas ficaram
só nos arquivos de referência.

## Renderizar e narrar

```sh
node render.mjs 9x16 --pagina sistema-hibrido/index.html --nome sistema-hibrido

cd locucao   # precisa da chave GOOGLE_TTS_API_KEY no ambiente
python3 tts.py google --voz pt-BR-Neural2-A --roteiro ../sistema-hibrido/roteiro.json --saida ../sistema-hibrido/voz
python3 narracao.py --roteiro ../sistema-hibrido/roteiro.json --nome sistema-hibrido --versao 120s --voz ../sistema-hibrido/voz
```
