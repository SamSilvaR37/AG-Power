// Operações do lado SERVIDOR do atendimento (webhook, despachante, assistente).
// Em produção rodam em funções de servidor com papéis restritos do banco:
//   IntegracaoBackend → obraloc_integracao   FerramentasBot → obraloc_bot
// Nenhum dos dois tem acesso direto a tabelas; só às funções listadas aqui.

export interface ResultadoEntrada {
  ok: boolean;
  duplicado: boolean;
  motivo?: string;
  conversa_id?: string;
  mensagem_id?: string;
  modo?: 'bot' | 'aguardando_equipe' | 'humano';
  epoca_bot?: number;
  acionar_bot?: boolean;
}

export interface ReservaEnvio {
  ok: boolean;
  enviar: boolean;
  motivo?: string;
  provedor?: string;
  chat_id?: string;
  telefone?: string;
  corpo?: string;
}

export interface IntegracaoBackend {
  registrarMensagemRecebida(evento: {
    provedor: string; evento_id: string; chat_id: string; telefone: string; nome: string | null;
    mensagem_id: string; tipo: string; corpo: string | null; midia_url: string | null; recebido_em: string;
  }): Promise<ResultadoEntrada>;
  atualizarTranscricao(mensagemId: string, estado: 'indisponivel' | 'concluida' | 'falhou', texto?: string): Promise<void>;
  registrarStatusEntrega(provedor: string, eventoId: string, idExterno: string, estado: 'entregue' | 'lida' | 'falhou'): Promise<{ duplicado: boolean }>;
  atualizarConexao(provedor: string, estado: string, erro: string | null): Promise<void>;
  mensagensParaEnvio(limite: number): Promise<{ mensagem_id: string; conversa_id: string }[]>;
  reservarEnvio(mensagemId: string): Promise<ReservaEnvio>;
  confirmarEnvio(mensagemId: string, idExterno: string): Promise<void>;
  registrarFalhaEnvio(mensagemId: string, erro: string): Promise<void>;
  expirarPreReservas(): Promise<number>;
}

/** Ferramentas do assistente (só as funções bot_*). Respostas sempre {ok, codigo?, mensagem?, ...}. */
export interface RespostaFerramenta {
  ok: boolean;
  codigo?: string;
  mensagem?: string;
  [k: string]: unknown;
}

export interface FerramentasBot {
  lerConversa(conversaId: string, limite?: number): Promise<RespostaFerramenta>;
  salvarContexto(conversaId: string, epoca: number, contexto: Record<string, unknown>): Promise<RespostaFerramenta>;
  enfileirarResposta(conversaId: string, epoca: number, texto: string, chave: string): Promise<RespostaFerramenta>;
  buscarEquipamentos(texto: string, limite?: number): Promise<RespostaFerramenta>;
  consultarDisponibilidade(equipamentoId: string, inicio: string, fim: string, quantidade: number): Promise<RespostaFerramenta>;
  calcularOrcamento(itens: { equipamento_id: string; quantidade: number }[], inicio: string, fim: string, modalidade: string): Promise<RespostaFerramenta>;
  salvarOrcamento(conversaId: string, epoca: number, itens: { equipamento_id: string; quantidade: number }[], inicio: string, fim: string,
    modalidade: string, endereco: string | null, chave: string): Promise<RespostaFerramenta>;
  criarPreReserva(conversaId: string, epoca: number, orcamentoId: string, chave: string): Promise<RespostaFerramenta>;
  consultarLocacao(conversaId: string): Promise<RespostaFerramenta>;
  solicitarAtendimentoHumano(conversaId: string, epoca: number, motivo: string, aviso: string | null, chave: string | null): Promise<RespostaFerramenta>;
}
