# Roteiro de locução — Comercial Plataforma AG Power

Voz masculina ou feminina, calorosa e segura, ritmo calmo. pt-BR.
Tempos de cada cena = os do vídeo renderizado (`../dist/`).

## Atenção: o texto do briefing não cabe em 90 s

O texto original soma **~370 palavras**. Em ritmo calmo (~2,5 palavras/s) isso dá
**~148 s**. Mesmo acelerado (3,3 palavras/s) passa de 110 s.

| Cena | Tempo | Palavras (briefing) | Precisa de | Palavras/s exigidas |
|---|---|---|---|---|
| 1 Abertura | 6 s | 9 | 3,6 s | 1,5 ✅ |
| 2 Apresentação | 7 s | 28 | 11,2 s | 4,0 ❌ |
| 3 Agenda/planilha | 8 s | 33 | 13,2 s | 4,1 ❌ |
| 4 Um clique, a OS | 6 s | 21 | 8,4 s | 3,5 ❌ |
| 5 Técnico no telhado | 15 s | 60 | 24,0 s | 4,0 ❌ |
| 6 Relatório PDF | 7 s | 25 | 10,0 s | 3,6 ❌ |
| 7 Centro de Operações | 9 s | 38 | 15,2 s | 4,2 ❌ |
| 8 Jornada 9 etapas | 8 s | 31 | 12,4 s | 3,9 ❌ |
| 9 Monitoramento | 7 s | 31 | 12,4 s | 4,4 ❌ |
| 10 Portal / Plano Power | 7 s | 39 | 15,6 s | 5,6 ❌ |
| 11 Em breve | 6 s | 46 | 18,4 s | 7,7 ❌ |
| 12 Encerramento | 4 s | 9 | 3,6 s | 2,3 ✅ |

Há duas saídas, e a escolha é de vocês:

- **A — manter o texto do briefing** e esticar o vídeo para ~150 s. Basta mudar o `dur:` de cada
  cena em `comercial.html` e renderizar de novo; as animações se ajustam ao tempo da cena.
- **B — usar o texto enxuto abaixo** (~240 palavras, ~2,7 palavras/s), que cabe nos 90 s.
  Ele só *remove* informação, não acrescenta nada, e tudo o que sai da fala continua escrito
  na tela. **Precisa da aprovação de vocês antes de gravar.**

As legendas `locucao-90s.srt` e `locucao-60s.srt` usam a versão B (fonte: `roteiro_b.json`;
para regerar, rode `python3 gerar_srt.py`).

## Versão B — enxuta, cabe em 90 s (sugestão para aprovar)

| # | Tempo | Locução |
|---|---|---|
| 1 | 0–6 s | Instalar a usina é só o começo. E depois? |
| 2 | 6–13 s | Conheça a plataforma AG Power: agenda, ordens de serviço, técnicos, monitoramento e portal do cliente. Tudo num lugar só. |
| 3 | 13–21 s | A planilha continua sendo a base: a cada 15 minutos, das 6h às 22h, a agenda se ajusta sozinha. Cliente novo? Cadastro automático. |
| 4 | 21–27 s | Um clique no cliente e a OS abre inteira. Dali, a gestão remarca e define quem vai. |
| 5 | 27–42 s | Para o técnico, a OS na mão, no telhado. Iniciou, ela fica aberta até finalizar. Fotos num campo só, materiais usados, a ficha técnica que era no papel e as assinaturas na mesma tela. Funciona até sem sinal e sincroniza depois. |
| 6 | 42–49 s | Concluiu? O relatório em PDF sai pronto, com fotos, ficha e assinaturas, e vai para o cliente pelo WhatsApp. |
| 7 | 49–58 s | Donos e gerência enxergam a operação inteira. E todo domingo fecha o resumo da semana, pronto para o WhatsApp, com aviso segunda às 7h40. |
| 8 | 58–66 s | A jornada da usina em nove etapas, do contrato à operação, com prazo por etapa e alerta quando passa do prazo. |
| 9 | 66–73 s | Integrada ao SolarMan, Solis e HYXi, a plataforma mostra quais usinas pararam ou geram abaixo do esperado, antes do cliente reclamar. |
| 10 | 73–80 s | O cliente acompanha tudo pelo celular, sem decorar e-mail. E o Plano Power cuida da usina de forma recorrente. |
| 11 | 80–86 s | Em breve: novas marcas de inversor, avisos automáticos a cada etapa e portal para toda a carteira. *(tudo no futuro, nada de "faz" ou "já tem")* |
| 12 | 86–90 s | Plataforma AG Power. O pós-venda inteiro, num lugar só. |

O que saiu da fala, e onde continua aparecendo:

- Cena 3: "e sempre que alguém abre a agenda" (detalhe técnico; o "15 min (6h–22h)" está na tela).
- Cena 5: "o app leva ele de volta" (aparece como aviso no celular).
- Cena 7: a lista dos blocos (aparece no painel e no texto "Hoje · Atrasados · Sem técnico").
- Cena 8: os nomes das 9 etapas (todas escritas na linha do tempo).
- Cena 9: "coleta três vezes ao dia" (selo "Coleta 3x ao dia" na tela).
- Cena 10: jornada/geração/histórico/chamados (abas do app e texto na tela).
- Cena 11: "planilha de instalações 100% sincronizada", "'quem vai?' direto na agenda do dia" e o
  nome Auxsol (os cinco cartões "EM BREVE" mostram cada item escrito).

## Versão A — texto original do briefing (exige ~150 s)

| # | Locução |
|---|---|
| 1 | Instalar a usina é só o começo. E depois? |
| 2 | Conheça a plataforma AG Power: agenda, ordens de serviço, técnicos em campo, monitoramento das usinas e portal do cliente. Tudo num lugar só, no celular e no computador. |
| 3 | A planilha continua sendo a base. A cada 15 minutos, das 6h às 22h, e sempre que alguém abre a agenda, o sistema se ajusta sozinho. Cliente novo agendado? O cadastro nasce automaticamente. |
| 4 | Um clique no cliente e a ordem de serviço abre inteira. Da própria OS, a gestão remarca e define quem vai. |
| 5 | Para o técnico, a OS na mão, no telhado. Iniciou o serviço, a OS fica aberta até finalizar e o app leva ele de volta. Fotos num campo só, várias de uma vez. Materiais usados. A mesma ficha técnica que antes era no papel. Assinaturas do cliente e do responsável na mesma tela. E funciona até sem sinal: sincroniza depois. |
| 6 | Concluiu? O relatório em PDF sai pronto, com fotos, ficha técnica e assinaturas, e vai para o cliente pelo WhatsApp ou pelo compartilhamento do celular. |
| 7 | Donos e gerência enxergam a operação inteira: serviços de hoje, atrasados, sem técnico, implantações por etapa e cadastros incompletos. E todo domingo fecha o resumo da semana, pronto para mandar no WhatsApp, com aviso toda segunda às 7h40. |
| 8 | A jornada da usina em nove etapas: contrato, vistoria técnica, engenharia, homologação, agendamento, instalação, troca do medidor, primeira geração e operação. Com prazo por etapa e alerta quando passa do prazo. |
| 9 | Integrado ao SolarMan, Solis e HYXi, com coleta três vezes ao dia. A plataforma mostra quais usinas pararam de mandar dado ou estão gerando abaixo do esperado, antes do cliente reclamar. |
| 10 | O cliente entra pelo celular, sem decorar e-mail, e acompanha a jornada da usina, a geração de energia, o histórico de serviços e os chamados. E o Plano Power cuida da usina de forma recorrente, tudo marcado na plataforma. |
| 11 | E vem mais por aí, em breve: planilha de instalações 100% sincronizada, "quem vai?" direto na agenda do dia, integração com a Auxsol e outras marcas de inversor, avisos automáticos para o cliente a cada etapa e acesso ao portal para toda a carteira de clientes. |
| 12 | Plataforma AG Power. O pós-venda inteiro, num lugar só. |

## Dicas para a gravação

- "OS" se lê "ó-ésse". "HYXi" e "SolarMan": confirmar com a AG Power a pronúncia que usam.
- "7h40" → "sete e quarenta". "6h às 22h" → "das seis às vinte e duas".
- Deixe ~0,3 s de respiro no começo e no fim de cada cena: as transições ficam nesses pontos.
- Entregue em WAV 48 kHz. A mixagem usa `dist/audio-90s-trilha.wav` e `dist/audio-90s-efeitos.wav`
  separados, para baixar a trilha (~-8 dB) embaixo da voz.
