// Serviço de integração do atendimento: o que, em produção, roda no SERVIDOR.
//  * receberWebhook: valida a origem, traduz o formato do provedor e registra no banco
//    (o banco deduplica por id do evento e por id da mensagem: reenvios não duplicam nada).
//  * despachar: envia a fila de saída. Antes de cada envio o banco confere se a resposta do
//    bot ainda vale (a equipe pode ter assumido a conversa enquanto ela era gerada).
// Logs: só códigos e contagens. Nunca corpo de mensagem, telefone, cabeçalho ou segredo.
import type { IntegracaoBackend } from '../backend/integracao';
import { ErroProvedor, transcritorIndisponivel, type EventoEntrada, type ProvedorWhatsApp, type RequisicaoWebhook, type Transcritor } from './tipos';

export interface ResultadoWebhook {
  status: 200 | 400 | 401 | 500;
  processados: number;
  duplicados: number;
}

/** Chamado quando uma mensagem nova chega numa conversa com o bot ativo (o assistente entra na etapa 4). */
export type AoAcionarBot = (p: { conversaId: string; epoca: number; mensagemId: string }) => Promise<void> | void;

export class ServicoAtendimento {
  private ouvintes = new Set<() => void>();
  private despachando = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Pausar a fila deixa as mensagens "pendentes" visíveis (útil para testar a tomada de atendimento). */
  filaPausada = false;
  aoAcionarBot: AoAcionarBot | null = null;

  constructor(
    private integracao: IntegracaoBackend,
    readonly provedor: ProvedorWhatsApp,
    readonly transcritor: Transcritor = transcritorIndisponivel,
  ) {}

  aoMudar(f: () => void) { this.ouvintes.add(f); return () => { this.ouvintes.delete(f); }; }
  private avisar() { this.ouvintes.forEach((f) => f()); }

  // ------------------------------------------------------------ entrada
  async receberWebhook(req: RequisicaoWebhook): Promise<ResultadoWebhook> {
    if (!(await this.provedor.validarWebhook(req))) {
      console.warn('[webhook] assinatura inválida rejeitada', { provedor: this.provedor.id });
      return { status: 401, processados: 0, duplicados: 0 };
    }
    let eventos: EventoEntrada[];
    try {
      eventos = this.provedor.interpretarWebhook(req);
    } catch {
      console.warn('[webhook] corpo em formato inválido', { provedor: this.provedor.id });
      return { status: 400, processados: 0, duplicados: 0 };
    }
    let processados = 0;
    let duplicados = 0;
    try {
      for (const ev of eventos) {
        if (await this.processar(ev)) processados++; else duplicados++;
      }
    } catch (e) {
      // 500 faz o provedor reenviar depois; como tudo é idempotente, o reenvio é seguro.
      console.error('[webhook] falha ao processar evento', { provedor: this.provedor.id, codigo: (e as { codigo?: string }).codigo });
      return { status: 500, processados, duplicados };
    } finally {
      this.avisar();
    }
    return { status: 200, processados, duplicados };
  }

  /** true = evento novo; false = repetido. */
  private async processar(ev: EventoEntrada): Promise<boolean> {
    if (ev.tipo === 'status') {
      return !(await this.integracao.registrarStatusEntrega(ev.provedor, ev.eventoId, ev.idExterno, ev.estado)).duplicado;
    }
    if (ev.tipo === 'conexao') {
      await this.integracao.atualizarConexao(ev.provedor, ev.estado, ev.erro);
      return true;
    }
    const r = await this.integracao.registrarMensagemRecebida({
      provedor: ev.provedor, evento_id: ev.eventoId, chat_id: ev.chatId, telefone: ev.telefone, nome: ev.nome,
      mensagem_id: ev.mensagemId, tipo: ev.formato, corpo: ev.corpo, midia_url: ev.midiaUrl, recebido_em: ev.recebidoEm,
    });
    if (r.duplicado) return false;

    if (ev.formato === 'audio' && r.mensagem_id) {
      // Sem serviço de transcrição: marca como indisponível. Nunca finge ter entendido o áudio.
      if (!this.transcritor.disponivel || !ev.midiaUrl) {
        await this.integracao.atualizarTranscricao(r.mensagem_id, 'indisponivel');
      } else {
        try {
          const texto = await this.transcritor.transcrever(ev.midiaUrl);
          await this.integracao.atualizarTranscricao(r.mensagem_id, 'concluida', texto);
        } catch {
          await this.integracao.atualizarTranscricao(r.mensagem_id, 'falhou');
        }
      }
    }
    if (r.acionar_bot && this.aoAcionarBot && r.conversa_id && r.mensagem_id) {
      await this.aoAcionarBot({ conversaId: r.conversa_id, epoca: r.epoca_bot ?? 0, mensagemId: r.mensagem_id });
    }
    return true;
  }

  // ------------------------------------------------------------ saída
  async despachar(): Promise<{ enviadas: number; falhas: number; canceladas: number }> {
    const res = { enviadas: 0, falhas: 0, canceladas: 0 };
    if (this.despachando || this.filaPausada) return res;
    this.despachando = true;
    try {
      const fila = await this.integracao.mensagensParaEnvio(20);
      for (const { mensagem_id } of fila) {
        const reserva = await this.integracao.reservarEnvio(mensagem_id);
        if (!reserva.enviar) { res.canceladas++; continue; }
        try {
          const { idExterno } = await this.provedor.enviar({ chatId: reserva.chat_id!, telefone: reserva.telefone!, texto: reserva.corpo ?? '' });
          await this.integracao.confirmarEnvio(mensagem_id, idExterno);
          res.enviadas++;
        } catch (e) {
          const motivo = e instanceof ErroProvedor ? e.message : 'Falha inesperada no envio';
          await this.integracao.registrarFalhaEnvio(mensagem_id, motivo);
          res.falhas++;
        }
      }
      if (fila.length) {
        const cx = await this.provedor.estadoConexao();
        await this.integracao.atualizarConexao(this.provedor.id, res.falhas && cx.estado !== 'desconectado' ? 'erro' : cx.estado,
          res.falhas ? 'Último envio falhou' : cx.erro);
      }
    } finally {
      this.despachando = false;
      if (res.enviadas + res.falhas + res.canceladas > 0) this.avisar();
    }
    return res;
  }

  iniciar(intervaloMs = 800) {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.despachar().catch(() => undefined); }, intervaloMs);
  }
  parar() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
