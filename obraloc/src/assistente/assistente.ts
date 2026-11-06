// Assistente virtual de DEMONSTRAÇÃO (regras fixas, sem IA).
//
// Regras que valem para qualquer implementação (inclusive uma futura com IA):
//  * Apresenta-se como assistente virtual da ObraLoc; nunca finge ser pessoa.
//  * Uma pergunta por vez; não repete o que já foi respondido (estado em contexto_bot).
//  * Preço, disponibilidade e reservas vêm SEMPRE das ferramentas do backend.
//    Se uma ferramenta falha, diz que não conseguiu e chama a equipe. Nunca inventa.
//  * Reclamação, negociação e pedido de pessoa → equipe.
//  * Se a equipe assumir a conversa no meio do processamento, as ferramentas recusam
//    (época do bot mudou) e o assistente para em silêncio.
import type { FerramentasBot, RespostaFerramenta } from '../backend/integracao';
import { brl, dataHora, hora } from '../lib/format';
import { InterpretadorRegras, normalizar, type Interpretacao, type Interpretador } from './interpretador';

export interface Item { equipamento_id: string; nome: string; quantidade: number | null }

export interface ContextoBot {
  v: 1;
  apresentado?: boolean;
  etapa: 'coletando' | 'aguardando_aceite' | 'reservado';
  itens: Item[];
  opcoes?: { quantidade: number | null; candidatos: { id: string; nome: string }[] };
  inicio?: string;
  fim?: string;
  modalidade?: 'retirada' | 'entrega';
  endereco?: string;
  orcamento?: { id: string; numero: number };
  ultimaPergunta?: string;
}

/** Estado novo a cada uso: nunca compartilhar a lista de itens entre conversas. */
const novo = (): ContextoBot => ({ v: 1, etapa: 'coletando', itens: [] });

const AVISOS = {
  reclamacao: 'Sinto muito pelo problema. Vou chamar alguém da equipe para te atender por aqui.',
  negociacao: 'Condições especiais e descontos são tratados pela equipe. Vou chamar alguém para conversar com você.',
  humano: 'Claro! Vou chamar alguém da equipe. Em instantes alguém te responde por aqui.',
  falha: 'Tive um problema para consultar o sistema agora e prefiro não te passar uma informação errada. Vou chamar alguém da equipe.',
} as const;

const STATUS: Record<string, string> = {
  pre_reserva: 'pré-reserva aguardando confirmação da equipe',
  confirmada: 'confirmada pela equipe',
  em_andamento: 'em andamento',
  devolvida: 'devolvida',
  expirada: 'expirada (o prazo da pré-reserva passou)',
  cancelada: 'cancelada',
};

class Pausado extends Error {}

export interface OpcoesAssistente {
  /** Simula o tempo de processamento (ms). Serve para testar a tomada de atendimento no meio. */
  atrasoMs?: number;
  interpretador?: Interpretador;
  agora?: () => Date;
}

export class AssistenteDemonstracao {
  readonly descricao = 'Assistente de demonstração com regras fixas (sem IA).';
  private filas = new Map<string, Promise<void>>();
  private interpretador: Interpretador;
  private agora: () => Date;
  atrasoMs: number;

  constructor(private ferramentas: FerramentasBot, opcoes: OpcoesAssistente = {}) {
    this.interpretador = opcoes.interpretador ?? new InterpretadorRegras();
    this.agora = opcoes.agora ?? (() => new Date());
    this.atrasoMs = opcoes.atrasoMs ?? 0;
  }

  /** Processa as mensagens de cada conversa em ordem, uma de cada vez. */
  responder(p: { conversaId: string; epoca: number; mensagemId: string }): Promise<void> {
    const anterior = this.filas.get(p.conversaId) ?? Promise.resolve();
    const atual = anterior.then(() => this.processar(p)).catch((e) => {
      if (!(e instanceof Pausado)) console.error('[assistente] falha', (e as Error).name);
    });
    this.filas.set(p.conversaId, atual);
    return atual;
  }

  // ------------------------------------------------------------ fluxo
  private async processar({ conversaId, epoca, mensagemId }: { conversaId: string; epoca: number; mensagemId: string }) {
    const conv = await this.ferramentas.lerConversa(conversaId, 30);
    if (!conv.ok || conv.modo !== 'bot' || conv.epoca_bot !== epoca) return;
    const mensagens = (conv.mensagens as { id: string; direcao: string; tipo: string; corpo: string | null; transcricao_estado: string; transcricao: string | null }[]) ?? [];
    const msg = mensagens.find((m) => m.id === mensagemId);
    if (!msg) return;

    const salvo = (conv.contexto as Partial<ContextoBot>) ?? {};
    const ctx: ContextoBot = { ...novo(), ...salvo, itens: [...(salvo.itens ?? [])] };
    const nome = ((conv.cliente as { nome?: string } | null)?.nome ?? (conv.nome_contato as string | null) ?? '').split(' ')[0];
    const t = new Turno(this.ferramentas, conversaId, epoca, mensagemId, ctx);

    if (!ctx.apresentado) {
      t.dizer(`Olá${nome ? `, ${nome}` : ''}! Sou o assistente virtual da ObraLoc. Posso ver equipamentos, disponibilidade e fazer orçamentos.`);
      ctx.apresentado = true;
    }

    let texto = msg.corpo ?? '';
    if (msg.tipo === 'audio') {
      if (msg.transcricao_estado === 'concluida' && msg.transcricao) texto = msg.transcricao;
      else {
        t.dizer('Ainda não consigo ouvir áudios por aqui. Pode me mandar por escrito?');
        return this.finalizar(t);
      }
    } else if (msg.tipo !== 'texto') {
      t.dizer('Por enquanto eu só consigo ler mensagens de texto. Pode escrever o que precisa?');
      return this.finalizar(t);
    }

    const r = this.interpretador.interpretar(texto, this.agora());
    try {
      await this.conduzir(t, r, texto);
    } catch (e) {
      if (e instanceof Pausado) return;
      throw e;
    }
    return this.finalizar(t);
  }

  private async finalizar(t: Turno) {
    if (t.encerrado) return;
    if (this.atrasoMs) await new Promise((r) => setTimeout(r, this.atrasoMs));
    await t.concluir();
  }

  private async conduzir(t: Turno, r: Interpretacao, texto: string) {
    const ctx = t.ctx;
    const i = r.intencoes;

    // 1) o que vai para a equipe
    if (i.includes('reclamacao')) return t.escalar('Reclamação do cliente', AVISOS.reclamacao);
    if (i.includes('negociacao')) return t.escalar('Cliente quer negociar preço ou condições', AVISOS.negociacao);
    if (i.includes('humano')) return t.escalar('Cliente pediu para falar com a equipe', AVISOS.humano);

    if (i.includes('recomecar')) {
      Object.assign(ctx, { ...novo(), apresentado: true, opcoes: undefined, inicio: undefined, fim: undefined, modalidade: undefined, endereco: undefined, orcamento: undefined });
      t.dizer('Tudo bem, vamos começar de novo. Qual equipamento você precisa?');
      return;
    }

    if (i.includes('consultar_locacao') && !r.trechosEquipamento.length) {
      const res = await t.ferramenta(this.ferramentas.consultarLocacao(t.conversaId));
      const locs = (res.locacoes as { numero: number; status: string; inicio: string; fim: string; itens: string; valor_total: number; expira_em: string | null }[]) ?? [];
      if (!locs.length) { t.dizer('Não encontrei locações ligadas a este número.'); return; }
      const l = locs[0];
      t.dizer(`Sua locação #${l.numero} (${l.itens}) está ${STATUS[l.status] ?? l.status}. ` +
        `Retirada ${dataHora(l.inicio)}, devolução ${dataHora(l.fim)}.` +
        (l.status === 'pre_reserva' && l.expira_em ? ` A pré-reserva vale até ${hora(l.expira_em)}.` : ''));
      return;
    }

    // 2) aceite do orçamento apresentado
    if (ctx.etapa === 'aguardando_aceite' && ctx.orcamento) {
      const mudou = r.trechosEquipamento.length || r.inicio || r.duracaoDias || r.quantidade || r.modalidade;
      if (i.includes('confirmar') && !mudou) return this.aceitar(t);
      if (i.includes('negar') && !mudou) {
        ctx.etapa = 'coletando';
        ctx.orcamento = undefined;
        t.dizer('Tudo bem! Quer mudar algo, como datas ou quantidade? Se preferir, posso chamar alguém da equipe.');
        return;
      }
      if (mudou) { ctx.etapa = 'coletando'; ctx.orcamento = undefined; }
      else { t.dizer('Posso fazer a pré-reserva desse orçamento? Responda "sim" ou me diga o que quer mudar.'); return; }
    }

    if (ctx.etapa === 'reservado') {
      if (r.trechosEquipamento.length && !i.includes('consultar_locacao')) {
        Object.assign(ctx, { ...novo(), apresentado: true, opcoes: undefined, inicio: undefined, fim: undefined, modalidade: undefined, endereco: undefined, orcamento: undefined });
      } else {
        t.dizer(i.includes('agradecer') ? 'Eu que agradeço! Qualquer coisa é só chamar.' : 'Sua pré-reserva já está com a equipe. Assim que confirmarem, te aviso por aqui. Precisa de mais alguma coisa?');
        return;
      }
    }

    // 3) coleta de dados
    if (r.dataNoPassado) {
      t.dizer('Essa data já passou. Para quando você precisa?');
      return;
    }
    await this.aplicarEquipamentos(t, r);
    if (t.terminou) return;
    this.aplicarDados(ctx, r, texto);

    // 4) próxima pergunta (uma por vez)
    if (!ctx.itens.length) {
      if (r.intencoes.includes('agradecer')) { t.dizer('Por nada! Se precisar de algum equipamento, é só me dizer.'); return; }
      return t.perguntar('equipamento', t.falou ? 'Qual equipamento você precisa?' : 'Qual equipamento você precisa? Por exemplo: betoneira, martelete, andaime.');
    }
    const semQtd = ctx.itens.find((x) => !x.quantidade);
    if (semQtd) return t.perguntar(`qtd:${semQtd.equipamento_id}`, `Quantas unidades de ${semQtd.nome} você precisa?`);
    if (!ctx.inicio) return t.perguntar('inicio', 'Para quando você precisa? Pode ser "amanhã", "sábado" ou uma data como 12/11.');
    if (!ctx.fim) return t.perguntar('fim', 'E até quando vai ficar com o equipamento? Pode me dizer a data de devolução ou quantos dias.');
    if (!ctx.modalidade) return t.perguntar('modalidade', 'Você vai retirar na loja ou prefere entrega na obra?');
    if (ctx.modalidade === 'entrega' && !ctx.endereco) return t.perguntar('endereco', 'Qual o endereço da obra para a entrega?');

    await this.orcar(t);
  }

  private async aplicarEquipamentos(t: Turno, r: Interpretacao) {
    const ctx = t.ctx;
    // resposta a uma pergunta de "qual destes?"
    if (ctx.opcoes) {
      const op = ctx.opcoes;
      const escolha = r.opcao
        ? op.candidatos[r.opcao - 1]
        : op.candidatos.find((c) => r.trechosEquipamento.some((x) => normalizar(c.nome).includes(x.texto.split(' ')[0])));
      if (escolha) {
        ctx.itens.push({ equipamento_id: escolha.id, nome: escolha.nome, quantidade: op.quantidade ?? r.quantidade });
        ctx.opcoes = undefined;
        return;
      }
      if (!r.trechosEquipamento.length) {
        t.dizer(`Qual destas opções? ${op.candidatos.map((c, n) => `${n + 1}) ${c.nome}`).join(' · ')}`);
        t.terminar();
        return;
      }
      ctx.opcoes = undefined;
    }

    const deveBuscar = ctx.itens.length === 0 || /\b(tambem|mais|adicion\w*|e mais)\b/.test(normalizar(r.trechosEquipamento.map((x) => x.texto).join(' ')))
      || r.intencoes.includes('pedido') && ctx.etapa === 'coletando' && !ctx.inicio;
    if (!deveBuscar || !r.trechosEquipamento.length) return;

    const naoAchados: string[] = [];
    for (const trecho of r.trechosEquipamento) {
      const res = await t.ferramenta(this.ferramentas.buscarEquipamentos(trecho.texto, 5), { ignorarErro: ['busca_vazia'] });
      const lista = ((res.resultados as { id: string; nome: string; relevancia: number }[]) ?? []);
      if (!lista.length) { naoAchados.push(trecho.texto); continue; }
      const topo = lista.filter((x) => x.relevancia === lista[0].relevancia);
      if (topo.length > 1) {
        ctx.opcoes = { quantidade: trecho.quantidade, candidatos: topo.slice(0, 4).map((x) => ({ id: x.id, nome: x.nome })) };
        continue;
      }
      const existente = ctx.itens.find((x) => x.equipamento_id === topo[0].id);
      if (existente) { if (trecho.quantidade) existente.quantidade = trecho.quantidade; }
      else ctx.itens.push({ equipamento_id: topo[0].id, nome: topo[0].nome, quantidade: trecho.quantidade });
    }
    if (ctx.opcoes) {
      t.dizer(`Temos mais de uma opção. Qual delas? ${ctx.opcoes.candidatos.map((c, n) => `${n + 1}) ${c.nome}`).join(' · ')}`);
      t.terminar();
      return;
    }
    if (naoAchados.length && !ctx.itens.length && r.intencoes.includes('pedido') && !r.inicio && !r.modalidade) {
      t.dizer(`Não encontrei "${naoAchados[0]}" no nosso catálogo. Pode descrever de outro jeito? Se preferir, chamo alguém da equipe.`);
      t.terminar();
    }
  }

  private aplicarDados(ctx: ContextoBot, r: Interpretacao, texto: string) {
    // quantidade solta responde ao item que está sem quantidade
    const semQtd = ctx.itens.find((x) => !x.quantidade);
    if (r.quantidade && semQtd) semQtd.quantidade = r.quantidade;
    else if (r.quantidade && ctx.itens.length === 1 && !r.trechosEquipamento.length) ctx.itens[0].quantidade = r.quantidade;

    if (r.inicio && r.fim) { ctx.inicio = r.inicio; ctx.fim = r.fim; }
    else if (r.inicio && ctx.inicio && !ctx.fim && ctx.ultimaPergunta === 'fim' && r.inicio > ctx.inicio) ctx.fim = r.inicio;
    else if (r.inicio) { ctx.inicio = r.inicio; if (ctx.fim && ctx.fim <= r.inicio) ctx.fim = undefined; }
    if (r.duracaoDias && ctx.inicio) ctx.fim = new Date(new Date(ctx.inicio).getTime() + r.duracaoDias * 86400_000).toISOString();

    if (r.modalidade) ctx.modalidade = r.modalidade;
    if (r.endereco && (ctx.modalidade === 'entrega' || r.modalidade === 'entrega')) { ctx.endereco = r.endereco; ctx.modalidade = 'entrega'; }
    else if (ctx.ultimaPergunta === 'endereco' && !r.endereco && texto.trim().length >= 6) ctx.endereco = texto.trim().slice(0, 200);
  }

  private async orcar(t: Turno) {
    const ctx = t.ctx;
    // disponibilidade primeiro, item a item
    for (const item of ctx.itens) {
      const d = await t.ferramenta(this.ferramentas.consultarDisponibilidade(item.equipamento_id, ctx.inicio!, ctx.fim!, item.quantidade!),
        { ignorarErro: ['periodo_invalido', 'quantidade_invalida'] });
      if (!d.ok) {
        if (d.codigo === 'periodo_invalido') { ctx.inicio = undefined; ctx.fim = undefined; }
        t.dizer(`${d.mensagem ?? 'Não consegui usar esse período.'} Pode me dizer as datas de novo?`);
        return;
      }
      if (!d.suficiente) {
        const livres = Number(d.disponiveis ?? 0);
        t.dizer(livres === 0
          ? `Não tenho ${item.nome} livre de ${dataHora(ctx.inicio!)} a ${dataHora(ctx.fim!)}. Quer tentar outras datas?`
          : `De ${dataHora(ctx.inicio!)} a ${dataHora(ctx.fim!)} tenho só ${livres} unidade(s) de ${item.nome}. Quer ajustar a quantidade ou as datas?`);
        if (livres === 0) { ctx.inicio = undefined; ctx.fim = undefined; } else item.quantidade = null;
        return;
      }
    }

    const itens = ctx.itens.map((x) => ({ equipamento_id: x.equipamento_id, quantidade: x.quantidade! }));
    const salvo = await t.ferramenta(this.ferramentas.salvarOrcamento(t.conversaId, t.epoca, itens, ctx.inicio!, ctx.fim!, ctx.modalidade!,
      ctx.endereco ?? null, `orc:${t.mensagemId}`), { ignorarErro: ['periodo_invalido', 'endereco_obrigatorio', 'sem_preco', 'indisponivel'] });
    if (!salvo.ok) {
      if (salvo.codigo === 'sem_preco') return t.escalar('Equipamento sem preço cadastrado', 'Esse equipamento está sem preço no sistema. Vou chamar alguém da equipe para te passar o valor.');
      t.dizer(`${salvo.mensagem ?? 'Não consegui montar o orçamento.'} Pode me ajudar a ajustar?`);
      return;
    }
    const resumo = (salvo.resumo as Resumo | undefined)
      ?? (await t.ferramenta(this.ferramentas.calcularOrcamento(itens, ctx.inicio!, ctx.fim!, ctx.modalidade!))) as unknown as Resumo;

    ctx.orcamento = { id: String(salvo.orcamento_id), numero: Number(salvo.numero) };
    ctx.etapa = 'aguardando_aceite';
    t.dizer(textoOrcamento(Number(salvo.numero), resumo, ctx));
  }

  private async aceitar(t: Turno) {
    const ctx = t.ctx;
    const r = await t.ferramenta(this.ferramentas.criarPreReserva(t.conversaId, t.epoca, ctx.orcamento!.id, `pre:${t.mensagemId}`),
      { ignorarErro: ['indisponivel', 'orcamento_vencido', 'orcamento_ja_utilizado', 'periodo_invalido'] });
    if (!r.ok) {
      ctx.etapa = 'coletando';
      ctx.orcamento = undefined;
      if (r.codigo === 'indisponivel') {
        ctx.inicio = undefined; ctx.fim = undefined;
        t.dizer('Que pena: o equipamento acabou de ficar indisponível nesse período, então nada foi reservado. Quer tentar outras datas?');
      } else {
        t.dizer(`${r.mensagem ?? 'Não foi possível fazer a pré-reserva.'} Nada foi reservado ainda. Quer que eu refaça o orçamento?`);
      }
      return;
    }
    ctx.etapa = 'reservado';
    const expira = r.expira_em ? ` As unidades ficam separadas até ${hora(String(r.expira_em))}.` : '';
    t.dizer(`Pré-reserva #${r.numero} feita!${expira} Agora a equipe confere e confirma a locação por aqui. Ainda não é a confirmação final.`);
  }
}

interface Resumo {
  dias: number;
  itens: { equipamento: string; quantidade: number; valor_total: number; explicacao: string }[];
  valor_total: number;
  regra: { nome: string; demonstrativa: boolean };
  observacao_frete: string | null;
}

function textoOrcamento(numero: number, r: Resumo, ctx: ContextoBot): string {
  const linhas = r.itens.map((i) => `• ${i.quantidade}× ${i.equipamento}: ${brl(i.valor_total)} (${i.explicacao}${i.quantidade > 1 ? ', por unidade' : ''})`);
  return [
    `Orçamento #${numero}:`,
    ...linhas,
    `Retirada ${dataHora(ctx.inicio!)} · devolução ${dataHora(ctx.fim!)} (${r.dias} ${r.dias === 1 ? 'dia' : 'dias'})`,
    ctx.modalidade === 'entrega' ? `Entrega em: ${ctx.endereco}` : 'Retirada na loja',
    `Total: ${brl(r.valor_total)}${r.observacao_frete ? ' + frete' : ''}`,
    `Regra de cobrança: ${r.regra.nome}.`,
    ...(r.observacao_frete ? [r.observacao_frete] : []),
    'Posso fazer a pré-reserva?',
  ].join('\n');
}

// ------------------------------------------------------------ um turno de resposta
class Turno {
  private falas: string[] = [];
  terminou = false;
  encerrado = false;
  constructor(private f: FerramentasBot, readonly conversaId: string, readonly epoca: number, readonly mensagemId: string, readonly ctx: ContextoBot) {}

  get falou() { return this.falas.length > 0; }
  dizer(texto: string) { this.falas.push(texto); }
  terminar() { this.terminou = true; }
  perguntar(chave: string, texto: string) { this.ctx.ultimaPergunta = chave; this.dizer(texto); }

  /** Chama uma ferramenta. bot_pausado → para tudo; falha do sistema → chama a equipe. */
  async ferramenta(p: Promise<RespostaFerramenta>, opts: { ignorarErro?: string[] } = {}): Promise<RespostaFerramenta> {
    const r = await p;
    if (r.ok) return r;
    if (r.codigo === 'bot_pausado') throw new Pausado();
    if (opts.ignorarErro?.includes(r.codigo ?? '')) return r;
    // Qualquer outro erro (falha de consulta/gravação, resposta inesperada): não improvisa, chama a equipe.
    await this.escalar(`Falha ao consultar o sistema (${r.codigo ?? 'desconhecida'})`, AVISOS.falha);
    throw new Pausado();
  }

  /** Passa para a equipe com um aviso ao cliente. Nada mais é dito pelo bot. */
  async escalar(motivo: string, aviso: string) {
    await this.f.salvarContexto(this.conversaId, this.epoca, this.ctx as unknown as Record<string, unknown>);
    const texto = this.falas.length ? `${this.falas.join('\n\n')}\n\n${aviso}` : aviso;
    const r = await this.f.solicitarAtendimentoHumano(this.conversaId, this.epoca, motivo, texto, `esc:${this.mensagemId}`);
    this.encerrado = true;
    if (!r.ok && r.codigo !== 'bot_pausado') console.error('[assistente] não consegui escalar', r.codigo);
  }

  async concluir() {
    const c = await this.f.salvarContexto(this.conversaId, this.epoca, this.ctx as unknown as Record<string, unknown>);
    if (!c.ok) return; // pausado ou falha: não responde
    if (!this.falas.length) return;
    await this.f.enfileirarResposta(this.conversaId, this.epoca, this.falas.join('\n\n'), `resp:${this.mensagemId}`);
  }
}
