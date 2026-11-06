// Contrato entre as telas e o backend.
// Hoje: PgliteBackend (Postgres rodando no navegador, dados fictícios).
// Depois: SupabaseBackend com as mesmas funções SQL via supabase-js (rpc/select),
// sem mudar as telas.
import type {
  Categoria, ClienteDetalhe, ClienteInput, ClienteResumo, Configuracoes, DisponibilidadeLinha,
  EntradaHistorico, EquipamentoDetalhe, EquipamentoInput, EquipamentoResumo, LocacaoResumo, Ocupacao,
  Painel, Preco, RegraCobranca, Sessao, StatusLocacao, UsuarioDemo, CondicaoUnidade,
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

  // configurações
  regrasCobranca(): Promise<RegraCobranca[]>;
  configuracoes(): Promise<Configuracoes>;
  salvarConfiguracoes(c: Configuracoes): Promise<void>;

  historico(limite: number): Promise<EntradaHistorico[]>;

  /** Só na demonstração: apaga o banco local e recria com os dados fictícios. */
  reiniciarDemo?(): Promise<void>;
}
