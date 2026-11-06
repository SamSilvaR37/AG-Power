// Interpretação da mensagem do cliente → dados estruturados.
//
// O texto do cliente é conteúdo NÃO CONFIÁVEL: aqui ele só é lido para extrair campos
// (datas, quantidades, intenção). Nada do que o cliente escreve muda regras, preços,
// permissões ou o comportamento do assistente.
//
// `InterpretadorRegras` é a versão de demonstração (regras fixas, sem IA). Uma IA pode
// implementar a mesma interface no servidor, devolvendo os mesmos campos, sem mudar o
// restante do assistente.

export type Intencao =
  | 'saudacao' | 'pedido' | 'confirmar' | 'negar' | 'humano' | 'reclamacao' | 'negociacao'
  | 'consultar_locacao' | 'recomecar' | 'agradecer' | 'outro';

export interface Interpretacao {
  intencoes: Intencao[];
  /** Trechos que podem nomear equipamentos, com a quantidade dita junto (se houver). */
  trechosEquipamento: { texto: string; quantidade: number | null }[];
  /** Quantidade solta ("são 3"). */
  quantidade: number | null;
  inicio: string | null;
  fim: string | null;
  /** Duração em dias ("por 3 dias", "uma semana"). */
  duracaoDias: number | null;
  modalidade: 'retirada' | 'entrega' | null;
  /** Texto depois de "endereço"/"rua"/"av." etc. */
  endereco: string | null;
  /** Escolha numérica ("1", "a segunda opção"). */
  opcao: number | null;
  /** Data que o cliente citou mas que já passou. */
  dataNoPassado: boolean;
}

export interface Interpretador {
  interpretar(texto: string, agora?: Date): Interpretacao;
}

// ------------------------------------------------------------ utilidades
const OFFSET_LOJA = -3; // America/Sao_Paulo (sem horário de verão)
export const HORA_RETIRADA = 8;

export function normalizar(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** Data (ano, mês, dia) "de hoje" no fuso da loja. */
function hojeLoja(agora: Date): { a: number; m: number; d: number; diaSemana: number } {
  const l = new Date(agora.getTime() + OFFSET_LOJA * 3600_000);
  return { a: l.getUTCFullYear(), m: l.getUTCMonth(), d: l.getUTCDate(), diaSemana: l.getUTCDay() };
}

/** ISO de uma data local da loja às `hora`. */
export function dataLoja(a: number, m: number, d: number, hora = HORA_RETIRADA): string {
  return new Date(Date.UTC(a, m, d, hora - OFFSET_LOJA)).toISOString();
}

function somarDias(iso: string, dias: number): string {
  return new Date(new Date(iso).getTime() + dias * 86400_000).toISOString();
}

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30,
};
const NUM = `(\\d{1,3}|${Object.keys(NUMEROS).join('|')})`;
const lerNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMEROS[s] ?? null);

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
};
const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

/** Palavras que não nomeiam equipamento (evita buscar "preciso", "alugar"...). */
const VAZIAS = new Set(('oi ola bom dia boa tarde noite tudo bem preciso precisava quero queria gostaria alugar aluguel locar locacao ' +
  'voces vcs tem teria tenho alugam aluga alugo alugue alugando alugamos aluguel locam disponivel disponiveis precisando para pra pro por favor de da do das dos um uma uns umas o a os as e ou com sem na no nas nos em ' +
  'amanha hoje depois semana dias dia mes ate entre sabado domingo segunda terca quarta quinta sexta obra casa ' +
  'retirar retiro buscar busco pegar entrega entregar levar loja sim nao pode ok obrigado obrigada valor preco quanto custa ' +
  'unidade unidades peca pecas mais tambem favor minha meu minhas meus reserva reservas pre-reserva pedido status foi ja confirmada confirmado confirmou aprovada aprovado como esta ficou').split(' '));

// ------------------------------------------------------------ datas
function proximoDiaSemana(agora: Date, alvo: number, depoisDe?: string): string {
  const h = hojeLoja(agora);
  let base = dataLoja(h.a, h.m, h.d);
  let dow = h.diaSemana;
  if (depoisDe) {
    base = dataLoja(...(ymd(depoisDe)));
    dow = new Date(new Date(base).getTime() + OFFSET_LOJA * 3600_000).getUTCDay();
  }
  let delta = (alvo - dow + 7) % 7;
  if (delta === 0) delta = depoisDe ? 7 : 7; // "sábado" dito no sábado = o próximo
  return somarDias(base, delta);
}

function ymd(iso: string): [number, number, number] {
  const l = new Date(new Date(iso).getTime() + OFFSET_LOJA * 3600_000);
  return [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()];
}

interface DataAchada { iso: string; pos: number; passado: boolean }

function acharDatas(t: string, agora: Date): DataAchada[] {
  const h = hojeLoja(agora);
  const hoje = dataLoja(h.a, h.m, h.d);
  const achadas: DataAchada[] = [];
  const add = (iso: string, pos: number) => achadas.push({ iso, pos, passado: iso < hoje });

  for (const m of t.matchAll(/\bhoje\b/g)) add(hoje, m.index!);
  for (const m of t.matchAll(/\bdepois de amanha\b/g)) add(somarDias(hoje, 2), m.index!);
  for (const m of t.matchAll(/\bamanha\b/g)) {
    if (!/depois de $/.test(t.slice(0, m.index!))) add(somarDias(hoje, 1), m.index!);
  }
  // 12/11 ou 12/11/2026
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const d = Number(m[1]); const mes = Number(m[2]) - 1;
    let a = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : h.a;
    if (!m[3] && (mes < h.m || (mes === h.m && d < h.d))) a++;
    if (d >= 1 && d <= 31 && mes >= 0 && mes <= 11) add(dataLoja(a, mes, d), m.index!);
  }
  // 12 de novembro
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2}) de (${Object.keys(MESES).join('|')})\\b`, 'g'))) {
    const d = Number(m[1]); const mes = MESES[m[2]];
    const a = mes < h.m || (mes === h.m && d < h.d) ? h.a + 1 : h.a;
    add(dataLoja(a, mes, d), m.index!);
  }
  // "dia 12"
  for (const m of t.matchAll(/\bdia (\d{1,2})\b(?! de)(?!\/)/g)) {
    const d = Number(m[1]);
    if (d < 1 || d > 31) continue;
    let mes = h.m; let a = h.a;
    if (d < h.d) { mes++; if (mes > 11) { mes = 0; a++; } }
    add(dataLoja(a, mes, d), m.index!);
  }
  // dias da semana (em ordem; o segundo é posterior ao primeiro)
  for (const m of t.matchAll(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/g)) {
    const anterior = achadas.filter((x) => x.pos < m.index!).sort((x, y) => y.pos - x.pos)[0];
    add(proximoDiaSemana(agora, DIAS_SEMANA[m[1]], anterior?.iso), m.index!);
  }
  const vistas = new Set<string>();
  return achadas.sort((a, b) => a.pos - b.pos).filter((x) => !vistas.has(x.iso) && vistas.add(x.iso));
}

// ------------------------------------------------------------ interpretador por regras
export class InterpretadorRegras implements Interpretador {
  interpretar(texto: string, agora = new Date()): Interpretacao {
    const original = texto.slice(0, 1000);
    const t = normalizar(original);
    const intencoes: Intencao[] = [];
    const tem = (re: RegExp) => re.test(t);

    if (tem(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)\b/)) intencoes.push('saudacao');
    if (tem(/\b(atendente|humano|pessoa|alguem da (loja|equipe)|falar com (alguem|voce|voces|o gerente|um vendedor)|vendedor|gerente)\b/)) intencoes.push('humano');
    if (tem(/\b(reclama\w*|quebrad\w*|defeito\w*|estragad\w*|nao funciona\w*|problema\w*|falhando|danificad\w*|insatisfeit\w*|absurdo|errad\w* na cobranca)\b/)) intencoes.push('reclamacao');
    if (tem(/\b(desconto\w*|mais barato|abaixar|baixar o preco|negocia\w*|preco melhor|valor melhor|faz por|condic\w* especia\w*|parcel\w*|fiado|promoc\w*|\d{1,2} ?%)/)) intencoes.push('negociacao');
    if (tem(/\b(minha (locacao|reserva|pre-reserva)|meu pedido|status|ja foi (aprovad|confirmad)|foi confirmad|confirmou)\b/)) intencoes.push('consultar_locacao');
    if (tem(/\b(recomecar|comecar de novo|cancela tudo|esquece|outro pedido)\b/)) intencoes.push('recomecar');
    if (tem(/^(sim|s|pode|pode sim|pode ser|fechado|fechou|confirmo|confirmado|isso|isso mesmo|ok|okay|beleza|blz|bora|perfeito|certo|quero|aceito|manda ver|pode fazer|pode reservar|claro)\b/)) intencoes.push('confirmar');
    if (tem(/^(nao|n|nao quero|melhor nao|agora nao|nao obrigado|negativo)\b/)) intencoes.push('negar');
    if (tem(/\b(obrigad\w*|valeu|agradec\w*)\b/)) intencoes.push('agradecer');

    // modalidade
    let modalidade: Interpretacao['modalidade'] = null;
    if (tem(/\b(entrega\w*|entregar|levar|leva|levam|mandar|manda|frete)\b/) && !tem(/\bsem entrega\b/)) modalidade = 'entrega';
    if (tem(/\b(retir\w*|busc\w*|pego|pegar|vou ai|passo ai|na loja)\b/)) modalidade = 'retirada';

    // endereço
    let endereco: string | null = null;
    const end = original.match(/(?:endere[cç]o\s*(?:[ée]|:)?\s*|(?=\b(?:rua|r\.|av\.|avenida|travessa|estrada|rodovia|alameda)\s))(.{6,160})/i);
    if (end) endereco = end[1].trim().replace(/[.!]+$/, '');

    // datas e duração
    const datas = acharDatas(t, agora);
    let duracaoDias: number | null = null;
    const dur = t.match(new RegExp(`\\b(?:por|durante|uns|umas|de)?\\s?${NUM} (dias?|semanas?|mes(?:es)?|quinzenas?)\\b`));
    if (dur) {
      const n = lerNum(dur[1]) ?? 1;
      duracaoDias = n * (dur[2].startsWith('semana') ? 7 : dur[2].startsWith('quinzena') ? 15 : dur[2].startsWith('mes') ? 30 : 1);
    } else if (tem(/\b(uma|1) semana\b|\bsemana (toda|inteira)\b/)) duracaoDias = 7;
    else if (tem(/\bum mes\b|\bmes inteiro\b/)) duracaoDias = 30;
    else if (tem(/\bfim de semana\b/)) duracaoDias = 2;

    const futuras = datas.filter((d) => !d.passado);
    let inicio: string | null = futuras[0]?.iso ?? null;
    let fim: string | null = futuras[1]?.iso ?? null;
    if (tem(/\bfim de semana\b/) && !inicio) { inicio = proximoDiaSemana(agora, 6); duracaoDias = 2; }
    if (inicio && fim && fim <= inicio) fim = null;

    // equipamentos com quantidade: "2 betoneiras e 10 andaimes"
    const trechos: Interpretacao['trechosEquipamento'] = [];
    for (const parte of t.split(/,|;|\be\b|\btambem\b|\bmais\b|\+/)) {
      const palavras = parte.replace(/[^a-z0-9/ -]/g, ' ').trim().split(/\s+/).filter(Boolean);
      const uteis = palavras.filter((p) => p.length >= 3 && !VAZIAS.has(p) && !/^\d/.test(p) && !(p in NUMEROS) && !(p in DIAS_SEMANA) && !(p in MESES));
      if (uteis.length === 0) continue;
      const q = parte.match(new RegExp(`\\b${NUM}\\s+(?!dias?\\b|semanas?\\b|mes|quinzena|de (?:${Object.keys(MESES).join('|')})|\\/)`));
      trechos.push({ texto: uteis.join(' '), quantidade: q ? lerNum(q[1]) : null });
    }

    // quantidade solta e escolha de opção
    let quantidade: number | null = null;
    const qs = t.match(new RegExp(`^(?:sao |serao |preciso de |quero )?${NUM}(?: (?:unidades?|pecas?))?$`));
    if (qs) quantidade = lerNum(qs[1]);
    let opcao: number | null = null;
    const op = t.match(/^(?:a |o |opcao )?(1|2|3|4|5|primeir[oa]|segund[oa]|terceir[oa])(?: opcao)?$/);
    if (op) opcao = ({ primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3 } as Record<string, number>)[op[1]] ?? Number(op[1]);

    if (trechos.length) intencoes.push('pedido');
    if (!intencoes.length) intencoes.push('outro');

    return {
      intencoes, trechosEquipamento: trechos, quantidade, inicio, fim, duracaoDias, modalidade, endereco, opcao,
      dataNoPassado: datas.some((d) => d.passado) && !futuras.length,
    };
  }
}
