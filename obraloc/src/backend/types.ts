// Tipos do domínio, iguais aos retornos das funções do banco.

export type Papel = 'admin' | 'atendente';

export type Permissao =
  | 'atender_conversas' | 'gerenciar_clientes' | 'orcamentos' | 'aprovar_locacao'
  | 'registrar_retirada' | 'registrar_devolucao' | 'registrar_pagamento'
  | 'manutencao' | 'gerenciar_catalogo' | 'gerenciar_configuracoes' | 'gerenciar_equipe';

export interface UsuarioDemo {
  userId: string;
  nome: string;
  papel: Papel;
  email: string;
}

export interface Sessao extends UsuarioDemo {
  permissoes: Permissao[];
}

export type StatusLocacao = 'pre_reserva' | 'confirmada' | 'em_andamento' | 'devolvida' | 'expirada' | 'cancelada';
export type SituacaoUnidade = 'disponivel' | 'reservado' | 'alugado' | 'manutencao' | 'baixada';
export type CondicaoUnidade = 'ativa' | 'manutencao' | 'baixada';
export type Modalidade = 'retirada' | 'entrega';

export interface Categoria { id: string; nome: string; ordem: number }

export interface Preco { dias: number; valor: number }

export interface EquipamentoResumo {
  id: string;
  nome: string;
  categoriaId: string;
  categoria: string;
  descricao: string | null;
  palavrasChave: string | null;
  fotos: string[];
  ativo: boolean;
  precos: Preco[];
  total: number;
  disponivel: number;
  reservado: number;
  alugado: number;
  manutencao: number;
}

export interface Unidade {
  id: string;
  codigo: string;
  numeroSerie: string | null;
  condicao: CondicaoUnidade;
  situacao: SituacaoUnidade;
  observacoes: string | null;
  proximaReservaEm: string | null;
}

export interface Ocupacao {
  unidadeId: string;
  unidade: string;
  tipo: 'locacao' | 'manutencao';
  locacaoId: string | null;
  numero: number | null;
  status: StatusLocacao | null;
  cliente: string | null;
  inicio: string;
  fim: string;
  atrasada: boolean;
  motivo: string | null;
}

export interface EquipamentoDetalhe extends EquipamentoResumo {
  unidades: Unidade[];
}

export interface EquipamentoInput {
  id?: string;
  categoriaId: string;
  nome: string;
  descricao: string;
  palavrasChave: string;
  fotos: string[];
  ativo: boolean;
}

export interface Contato {
  id?: string;
  nome: string;
  telefone: string;
  whatsapp: boolean;
  funcao: string | null;
}

export interface ClienteResumo {
  id: string;
  nome: string;
  tipo: 'pf' | 'pj';
  documento: string | null;
  origem: string;
  cadastroIncompleto: boolean;
  telefonePrincipal: string | null;
  locacoesAtivas: number;
  saldo: number;
}

export interface LocacaoResumo {
  id: string;
  numero: number;
  status: StatusLocacao;
  clienteId: string;
  cliente: string;
  inicio: string;
  fim: string;
  modalidade: Modalidade;
  valorItens: number;
  valorFrete: number | null;
  valorTotal: number;
  recebido: number;
  saldo: number;
  atrasada: boolean;
  expiraEm: string | null;
  itens: string | null;
  origem: 'equipe' | 'bot' | 'sistema' | 'cliente';
}

export interface ClienteDetalhe {
  id: string;
  nome: string;
  tipo: 'pf' | 'pj';
  documento: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  origem: string;
  cadastroIncompleto: boolean;
  contatos: Contato[];
  locacoes: LocacaoResumo[];
}

export interface ClienteInput {
  id?: string;
  nome: string;
  tipo: 'pf' | 'pj';
  documento: string;
  email: string;
  endereco: string;
  observacoes: string;
  contatos: Contato[];
}

export interface DisponibilidadeLinha {
  equipamentoId: string;
  equipamento: string;
  categoria: string;
  ativas: number;
  livres: number;
  diaria: number | null;
}

export interface ItemPainelLocacao {
  locacao_id: string;
  numero: number;
  cliente: string;
  inicio?: string;
  fim?: string;
  itens?: string;
  horas_atraso?: number;
  expira_em?: string;
  valor_total?: number;
  origem?: string;
  modalidade?: Modalidade;
}

export interface Painel {
  gerado_em: string;
  locacoes_ativas: number;
  atrasadas: ItemPainelLocacao[];
  devolucoes_proximas: ItemPainelLocacao[];
  retiradas_proximas: ItemPainelLocacao[];
  pre_reservas: ItemPainelLocacao[];
  em_risco: { locacao_id: string; numero: number; inicio: string; unidade: string; motivo: string; locacao_bloqueadora: number | null }[];
  a_receber: { total: number; locacoes: number; frete_a_definir: number };
  disponibilidade_agora: {
    equipamento_id: string; equipamento: string; categoria: string;
    total: number; disponivel: number; reservado: number; alugado: number; manutencao: number;
  }[];
  conversas_aguardando: number;
}

export interface RegraCobranca {
  id: string;
  codigo: string;
  nome: string;
  metodo: 'diaria' | 'pacotes';
  contagem: 'periodos_24h' | 'dias_calendario';
  minimoDias: number;
  descricao: string;
  demonstrativa: boolean;
  ativa: boolean;
}

export interface Configuracoes {
  fusoHorario: string;
  preReservaMinutos: number;
  orcamentoValidadeHoras: number;
  atrasoBloqueioHoras: number;
  periodoMaximoDias: number;
  regraCobrancaId: string | null;
}

export interface EntradaHistorico {
  id: number;
  em: string;
  atorTipo: string;
  ator: string | null;
  acao: string;
  entidade: string;
  dados: Record<string, unknown>;
}

/** Erro de negócio devolvido pelo banco (código + mensagem para pessoas). */
export class ErroNegocio extends Error {
  constructor(public codigo: string, mensagem: string) {
    super(mensagem);
    this.name = 'ErroNegocio';
  }
}

// ------------------------------------------------------------ atendimento
export type ModoConversa = 'bot' | 'aguardando_equipe' | 'humano';
export type EstadoMensagem = 'recebida' | 'pendente' | 'enviando' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'cancelada';

export interface ConversaResumo {
  id: string;
  provedor: string;
  telefone: string;
  nomeContato: string | null;
  clienteId: string | null;
  cliente: string | null;
  cadastroIncompleto: boolean;
  modo: ModoConversa;
  atendente: string | null;
  atendenteId: string | null;
  epocaBot: number;
  motivoEscalonamento: string | null;
  naoLidas: number;
  ultimaMensagemEm: string | null;
  ultimaMensagem: string | null;
  ultimaTipo: string | null;
  ultimoAutor: string | null;
  pendentes: number;
  falhas: number;
  audiosSemTexto: number;
}

export interface Mensagem {
  id: string;
  direcao: 'entrada' | 'saida';
  autor: 'cliente' | 'bot' | 'equipe' | 'sistema';
  autorNome: string | null;
  tipo: 'texto' | 'audio' | 'imagem' | 'documento' | 'outro';
  corpo: string | null;
  transcricaoEstado: 'nao_aplica' | 'pendente' | 'indisponivel' | 'concluida' | 'falhou';
  transcricao: string | null;
  estado: EstadoMensagem;
  erro: string | null;
  criadoEm: string;
}

export interface OrcamentoResumo {
  id: string;
  numero: number;
  status: 'enviado' | 'aceito' | 'recusado' | 'expirado' | 'convertido';
  inicio: string;
  fim: string;
  valorTotal: number;
  validadeAte: string;
  regra: string;
  itens: string | null;
}

export interface ConversaDetalhe {
  conversa: ConversaResumo;
  mensagens: Mensagem[];
  orcamentos: OrcamentoResumo[];
  locacoes: LocacaoResumo[];
}

export interface ConexaoWhatsApp {
  provedor: string;
  estado: 'simulado' | 'conectado' | 'desconectado' | 'erro';
  ultimoErro: string | null;
  atualizadoEm: string;
}
