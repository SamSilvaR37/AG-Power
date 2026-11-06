// Contrato entre as telas e o backend.
// Hoje: PgliteBackend (Postgres rodando no navegador, dados fictícios).
// Depois: SupabaseBackend com as mesmas funções SQL via supabase-js (rpc/select),
// sem mudar as telas.
import type {
  Categoria, ClienteDetalhe, ClienteInput, ClienteResumo, Configuracoes, DisponibilidadeLinha,
  EntradaHistorico, EquipamentoDetalhe, EquipamentoInput, EquipamentoResumo, LocacaoResumo, Ocupacao,
  Painel, Preco, RegraCobranca, Sessao, StatusLocacao, UsuarioDemo, CondicaoUnidade,
  ConversaResumo, ConversaDetalhe, ConexaoWhatsApp, LocacaoDetalhe, ItemChecklist, FormaPagamento,
} from './types';

export interface Backend {
  /** Como os dados estão sendo servidos — aparece na interface. */
  readonly ambiente: { tipo: 'demo-local' | 'supabase'; descricao: string };

  // sessão
  usuariosDemo(): Promise<UsuarioDemo[]>;
  entrar(userId: string): Promise<Sessao>;

  // painel
  painel(): Promise<Painel>;

  // catálogo
  categorias(): Promise<Categoria[]>;
  equipamentos(): Promise<EquipamentoResumo[]>;
  equipamento(id: string): Promise<EquipamentoDetalhe>;
  ocupacao(equipamentoId: string, de: string, ate: string): Promise<Ocupacao[]>;
  salvarEquipamento(input: EquipamentoInput): Promise<string>;
  salvarPrecos(equipamentoId: string, precos: Preco[]): Promise<void>;
  adicionarUnidade(equipamentoId: string, codigo: string, numeroSerie: string): Promise<void>;
  alterarCondicaoUnidade(unidadeId: string, condicao: CondicaoUnidade, observacao: string): Promise<void>;

  // disponibilidade
  disponibilidade(inicio: string, fim: string): Promise<DisponibilidadeLinha[]>;

  // clientes
  clientes(busca: string): Promise<ClienteResumo[]>;
  cliente(id: string): Promise<ClienteDetalhe>;
  salvarCliente(input: ClienteInput): Promise<string>;

  // locações
  locacoes(status: StatusLocacao[] | null): Promise<LocacaoResumo[]>;

  locacao(id: string): Promise<LocacaoDetalhe>;
  /** ok=false quando a pré-reserva expirou antes da aprovação (unidades liberadas). */
  aprovarPreReserva(id: string): Promise<{ ok: boolean; mensagem?: string }>;
  cancelarLocacao(id: string, motivo: string): Promise<void>;
  definirFrete(id: string, valor: number): Promise<void>;
  realocarUnidade(id: string, unidadeId: string): Promise<void>;
  registrarRetirada(id: string, checklist: ItemChecklist[], observacoes: string): Promise<void>;
  registrarDevolucao(id: string, checklist: ItemChecklist[], observacoes: string, unidadesManutencao: string[]): Promise<{ atrasada: boolean; atrasoHoras: number }>;
  registrarRecebimento(id: string, valor: number, forma: FormaPagamento, observacao: string): Promise<{ saldo: number }>;
  /** Mensagem ao cliente pelo WhatsApp da locação, sem pausar o assistente. */
  notificarCliente(id: string, texto: string): Promise<{ ok: boolean; mensagem?: string }>;

  // configurações
  regrasCobranca(): Promise<RegraCobranca[]>;
  configuracoes(): Promise<Configuracoes>;
  salvarConfiguracoes(c: Configuracoes): Promise<void>;

  historico(limite: number): Promise<EntradaHistorico[]>;

  // caixa de atendimento
  conversas(): Promise<ConversaResumo[]>;
  conversa(id: string): Promise<ConversaDetalhe>;
  assumirAtendimento(conversaId: string): Promise<{ respostasCanceladas: number }>;
  devolverAoAssistente(conversaId: string): Promise<void>;
  enviarMensagem(conversaId: string, texto: string): Promise<void>;
  reenviarMensagem(mensagemId: string): Promise<void>;
  marcarLida(conversaId: string): Promise<void>;
  vincularCliente(conversaId: string, clienteId: string): Promise<void>;
  conexoes(): Promise<ConexaoWhatsApp[]>;

  /** Só na demonstração: apaga o banco local e recria com os dados fictícios. */
  reiniciarDemo?(): Promise<void>;
}
