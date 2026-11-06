// Provedor SIMULADO, usado dentro do próprio app. Não fala com o WhatsApp.
// Imita o que um provedor real faz: webhook assinado, envio que pode falhar,
// confirmações de entrega/leitura e queda de conexão.
import { ErroProvedor, type EnvioSaida, type EstadoConexao, type EventoEntrada, type FormatoMensagem,
  type ProvedorWhatsApp, type RequisicaoWebhook } from './tipos';

const CABECALHO = 'x-simulado-assinatura';

async function hmacHex(segredo: string, corpo: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', chave, enc.encode(corpo));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const novoId = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Corpo do webhook no formato (inventado) do provedor simulado. */
interface CorpoSimulado {
  provedor: 'simulado';
  evento:
    | { id: string; tipo: 'mensagem'; chat: string; de: { telefone: string; nome: string | null };
        mensagem: { id: string; formato: FormatoMensagem; texto: string | null; midia: string | null }; em: string }
    | { id: string; tipo: 'status'; mensagem_id: string; status: 'delivered' | 'read' | 'failed' }
    | { id: string; tipo: 'conexao'; estado: EstadoConexao; erro: string | null };
}

export interface MensagemNoAparelho {
  id: string;
  de: 'cliente' | 'loja';
  texto: string;
  formato: FormatoMensagem;
  em: string;
}

export type EntregarWebhook = (req: RequisicaoWebhook) => Promise<{ status: number }>;

export class ProvedorSimulado implements ProvedorWhatsApp {
  readonly id = 'simulado';
  readonly nome = 'WhatsApp simulado';
  readonly real = false;

  /** Na vida real o segredo fica só no servidor. Aqui é fictício, só para exercitar a validação. */
  private segredo = 'segredo-de-demonstracao';
  private conectado = true;
  private falhasProgramadas = 0;
  private ultimoWebhook: RequisicaoWebhook | null = null;
  private aparelhos = new Map<string, MensagemNoAparelho[]>();
  private ouvintes = new Set<() => void>();
  /** Atrasos das confirmações (ms). Em testes podem ser 0. */
  atrasoEntregue = 700;
  atrasoLida = 2000;

  /** Para onde o "provedor" manda os webhooks (o serviço de integração). */
  entregar: EntregarWebhook | null = null;

  // ------------------------------------------------------------ ProvedorWhatsApp
  async validarWebhook(req: RequisicaoWebhook): Promise<boolean> {
    const recebida = req.cabecalhos[CABECALHO] ?? '';
    const esperada = 'sha256=' + (await hmacHex(this.segredo, req.corpo));
    return iguaisTempoConstante(recebida, esperada);
  }

  interpretarWebhook(req: RequisicaoWebhook): EventoEntrada[] {
    const c = JSON.parse(req.corpo) as CorpoSimulado;
    if (c?.provedor !== 'simulado' || !c.evento?.id) throw new Error('Webhook em formato desconhecido');
    const e = c.evento;
    if (e.tipo === 'mensagem') {
      return [{
        tipo: 'mensagem', provedor: this.id, eventoId: e.id, chatId: e.chat, telefone: e.de.telefone, nome: e.de.nome,
        mensagemId: e.mensagem.id, formato: e.mensagem.formato, corpo: e.mensagem.texto, midiaUrl: e.mensagem.midia, recebidoEm: e.em,
      }];
    }
    if (e.tipo === 'status') {
      const estado = ({ delivered: 'entregue', read: 'lida', failed: 'falhou' } as const)[e.status];
      return [{ tipo: 'status', provedor: this.id, eventoId: e.id, idExterno: e.mensagem_id, estado }];
    }
    if (e.tipo === 'conexao') return [{ tipo: 'conexao', provedor: this.id, eventoId: e.id, estado: e.estado, erro: e.erro }];
    throw new Error('Tipo de evento desconhecido');
  }

  async enviar(msg: EnvioSaida): Promise<{ idExterno: string }> {
    await new Promise((r) => setTimeout(r, 120)); // latência de rede simulada
    if (!this.conectado) throw new ErroProvedor('Sem conexão com o WhatsApp (simulado)', true);
    if (this.falhasProgramadas > 0) {
      this.falhasProgramadas--;
      this.avisar();
      throw new ErroProvedor('O provedor recusou o envio (falha simulada)', true);
    }
    const idExterno = novoId('sim-out');
    this.guardar(msg.chatId, { id: idExterno, de: 'loja', texto: msg.texto, formato: 'texto', em: new Date().toISOString() });
    // confirmações chegam depois, como no provedor real
    setTimeout(() => void this.emitir({ id: novoId('sim-st'), tipo: 'status', mensagem_id: idExterno, status: 'delivered' }), this.atrasoEntregue);
    setTimeout(() => void this.emitir({ id: novoId('sim-st'), tipo: 'status', mensagem_id: idExterno, status: 'read' }), this.atrasoLida);
    return { idExterno };
  }

  async estadoConexao() {
    return this.conectado ? { estado: 'simulado' as const, erro: null } : { estado: 'desconectado' as const, erro: 'Conexão desligada no simulador' };
  }

  // ------------------------------------------------------------ controles do simulador
  /** O "cliente" manda uma mensagem pelo WhatsApp. */
  async mensagemDoCliente(p: { telefone: string; nome: string | null; texto: string | null; formato?: FormatoMensagem }) {
    const formato = p.formato ?? 'texto';
    const chat = `sim-${p.telefone}`;
    const msg = {
      id: novoId('sim-msg'), formato, texto: formato === 'texto' ? p.texto : null,
      midia: formato === 'audio' ? 'simulado://audio/mensagem-de-voz.ogg' : null,
    };
    this.guardar(chat, { id: msg.id, de: 'cliente', texto: p.texto ?? '', formato, em: new Date().toISOString() });
    return this.emitir({ id: novoId('sim-ev'), tipo: 'mensagem', chat, de: { telefone: p.telefone, nome: p.nome }, mensagem: msg, em: new Date().toISOString() });
  }

  /** Reentrega o último webhook, idêntico (o que provedores fazem quando não recebem resposta a tempo). */
  async reenviarUltimoWebhook() {
    if (!this.ultimoWebhook || !this.entregar) return null;
    return this.entregar(this.ultimoWebhook);
  }

  /** Webhook com assinatura errada, como um terceiro tentando se passar pelo provedor. */
  async webhookFalsificado(telefone: string, texto: string) {
    const corpo = JSON.stringify({ provedor: 'simulado', evento: { id: novoId('sim-ev'), tipo: 'mensagem', chat: `sim-${telefone}`,
      de: { telefone, nome: 'Falsificado' }, mensagem: { id: novoId('sim-msg'), formato: 'texto', texto, midia: null }, em: new Date().toISOString() } });
    return this.entregar?.({ cabecalhos: { [CABECALHO]: 'sha256=' + '0'.repeat(64) }, corpo }) ?? null;
  }

  definirConexao(conectado: boolean) {
    this.conectado = conectado;
    void this.emitir({ id: novoId('sim-cx'), tipo: 'conexao', estado: conectado ? 'simulado' : 'desconectado',
      erro: conectado ? null : 'Conexão desligada no simulador' });
  }

  programarFalhas(n: number) { this.falhasProgramadas = n; this.avisar(); }
  get estaConectado() { return this.conectado; }
  get falhasPendentes() { return this.falhasProgramadas; }
  aparelho(telefone: string): MensagemNoAparelho[] { return this.aparelhos.get(`sim-${telefone}`) ?? []; }

  aoMudar(f: () => void) { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; }

  // ------------------------------------------------------------ interno
  private guardar(chat: string, m: MensagemNoAparelho) {
    this.aparelhos.set(chat, [...(this.aparelhos.get(chat) ?? []), m]);
    this.avisar();
  }
  private avisar() { this.ouvintes.forEach((f) => f()); }

  private async emitir(evento: CorpoSimulado['evento']) {
    const corpo = JSON.stringify({ provedor: 'simulado', evento } satisfies CorpoSimulado);
    const req = { cabecalhos: { [CABECALHO]: 'sha256=' + (await hmacHex(this.segredo, corpo)) }, corpo };
    if (evento.tipo === 'mensagem') this.ultimoWebhook = req;
    return this.entregar ? this.entregar(req) : null;
  }
}
