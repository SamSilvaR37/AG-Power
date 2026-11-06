// Camada independente de provedores de WhatsApp.
//
// A lógica de negócio (banco, caixa de atendimento, assistente) só conhece estes tipos.
// Cada provedor (o simulado hoje; um não oficial ou a API oficial no futuro) implementa
// ProvedorWhatsApp e traduz o formato dele para EventoEntrada. Trocar de provedor = escrever
// um novo adaptador; nada mais muda.
//
// Antes de integrar um fornecedor real: definir qual será usado e seguir a documentação
// ATUAL dele (formato do webhook, validação de assinatura, limites de envio, janela de 24 h etc.).

export type EstadoConexao = 'simulado' | 'conectado' | 'desconectado' | 'erro';
export type FormatoMensagem = 'texto' | 'audio' | 'imagem' | 'documento' | 'outro';

/** Requisição HTTP recebida no endpoint de webhook, com o corpo bruto (necessário para validar assinatura). */
export interface RequisicaoWebhook {
  cabecalhos: Record<string, string>;
  corpo: string;
}

export type EventoEntrada =
  | {
      tipo: 'mensagem';
      provedor: string;
      eventoId: string;
      chatId: string;
      telefone: string;
      nome: string | null;
      mensagemId: string;
      formato: FormatoMensagem;
      corpo: string | null;
      midiaUrl: string | null;
      recebidoEm: string;
    }
  | { tipo: 'status'; provedor: string; eventoId: string; idExterno: string; estado: 'entregue' | 'lida' | 'falhou' }
  | { tipo: 'conexao'; provedor: string; eventoId: string; estado: EstadoConexao; erro: string | null };

export interface EnvioSaida {
  chatId: string;
  telefone: string;
  texto: string;
}

/** Falha do provedor. `temporaria` = vale tentar de novo (rede, limite); senão, erro definitivo. */
export class ErroProvedor extends Error {
  constructor(mensagem: string, public temporaria: boolean) {
    super(mensagem);
    this.name = 'ErroProvedor';
  }
}

export interface ProvedorWhatsApp {
  /** Identificador gravado nas conversas/mensagens (ex.: 'simulado'). */
  readonly id: string;
  readonly nome: string;
  /** false = simulação; a interface mostra o selo correspondente. */
  readonly real: boolean;

  /** Confere a autenticidade do webhook (assinatura/token), conforme o provedor. */
  validarWebhook(req: RequisicaoWebhook): Promise<boolean>;
  /** Traduz o corpo do webhook. Lança erro se o formato for inválido. */
  interpretarWebhook(req: RequisicaoWebhook): EventoEntrada[];
  /** Envia texto. Lança ErroProvedor em caso de falha. */
  enviar(msg: EnvioSaida): Promise<{ idExterno: string }>;
  estadoConexao(): Promise<{ estado: EstadoConexao; erro: string | null }>;
}

/** Transcrição de áudio. Sem serviço configurado, `disponivel` é false e nada é "entendido". */
export interface Transcritor {
  readonly disponivel: boolean;
  readonly descricao: string;
  transcrever(midiaUrl: string): Promise<string>;
}

export const transcritorIndisponivel: Transcritor = {
  disponivel: false,
  descricao: 'Nenhum serviço de transcrição configurado.',
  transcrever: () => Promise.reject(new Error('Transcrição indisponível')),
};
