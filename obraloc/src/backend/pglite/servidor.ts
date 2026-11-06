// Implementações de IntegracaoBackend e FerramentasBot sobre o PGlite.
// Cada chamada troca para o papel restrito correspondente (como o servidor faria no Supabase).
import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { FerramentasBot, IntegracaoBackend, ReservaEnvio, RespostaFerramenta, ResultadoEntrada } from '../integracao';
import { traduzirErro } from './backend';

async function comoPapel<T>(db: PGlite, papel: 'obraloc_integracao' | 'obraloc_bot', fn: (tx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      await tx.exec(`set local role ${papel}`);
      return fn(tx);
    });
  } catch (e) {
    throw traduzirErro(e);
  }
}

async function chamar<T>(db: PGlite, papel: 'obraloc_integracao' | 'obraloc_bot', sql: string, params: unknown[]): Promise<T> {
  return comoPapel(db, papel, async (tx) => (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T);
}

export class PgliteIntegracao implements IntegracaoBackend {
  constructor(private db: PGlite) {}
  private c<T>(sql: string, params: unknown[] = []) { return chamar<T>(this.db, 'obraloc_integracao', sql, params); }

  registrarMensagemRecebida(evento: Parameters<IntegracaoBackend['registrarMensagemRecebida']>[0]) {
    return this.c<ResultadoEntrada>('select public.registrar_mensagem_recebida($1::jsonb) as r', [JSON.stringify(evento)]);
  }
  async atualizarTranscricao(mensagemId: string, estado: 'indisponivel' | 'concluida' | 'falhou', texto?: string) {
    await this.c('select public.atualizar_transcricao($1, $2, $3) as r', [mensagemId, estado, texto ?? null]);
  }
  registrarStatusEntrega(provedor: string, eventoId: string, idExterno: string, estado: 'entregue' | 'lida' | 'falhou') {
    return this.c<{ duplicado: boolean }>('select public.registrar_status_entrega($1, $2, $3, $4) as r', [provedor, eventoId, idExterno, estado]);
  }
  async atualizarConexao(provedor: string, estado: string, erro: string | null) {
    await this.c('select public.atualizar_conexao($1, $2, $3) as r', [provedor, estado, erro]);
  }
  mensagensParaEnvio(limite: number) {
    return comoPapel(this.db, 'obraloc_integracao', async (tx) =>
      (await tx.query<{ mensagem_id: string; conversa_id: string }>('select * from public.mensagens_para_envio($1)', [limite])).rows);
  }
  reservarEnvio(mensagemId: string) {
    return this.c<ReservaEnvio>('select public.reservar_envio($1) as r', [mensagemId]);
  }
  async confirmarEnvio(mensagemId: string, idExterno: string) {
    await this.c('select public.confirmar_envio($1, $2) as r', [mensagemId, idExterno]);
  }
  async registrarFalhaEnvio(mensagemId: string, erro: string) {
    await this.c('select public.registrar_falha_envio($1, $2) as r', [mensagemId, erro]);
  }
  expirarPreReservas() {
    return this.c<number>('select public.expirar_pre_reservas() as r');
  }
}

export class PgliteFerramentasBot implements FerramentasBot {
  constructor(private db: PGlite) {}
  private c(sql: string, params: unknown[]) {
    // Falha inesperada (banco fora do ar etc.) também vira {ok:false}: o assistente nunca recebe "sucesso" inventado.
    return chamar<RespostaFerramenta>(this.db, 'obraloc_bot', sql, params)
      .then((r) => r ?? { ok: false, codigo: 'sem_resposta', mensagem: 'Sem resposta do sistema.' })
      .catch((): RespostaFerramenta => ({ ok: false, codigo: 'falha_sistema', mensagem: 'Não consegui acessar o sistema agora.' }));
  }

  lerConversa(conversaId: string, limite = 20) { return this.c('select public.bot_ler_conversa($1, $2) as r', [conversaId, limite]); }
  salvarContexto(conversaId: string, epoca: number, contexto: Record<string, unknown>) {
    return this.c('select public.bot_salvar_contexto($1, $2, $3::jsonb) as r', [conversaId, epoca, JSON.stringify(contexto)]);
  }
  enfileirarResposta(conversaId: string, epoca: number, texto: string, chave: string) {
    return this.c('select public.bot_enfileirar_resposta($1, $2, $3, $4) as r', [conversaId, epoca, texto, chave]);
  }
  buscarEquipamentos(texto: string, limite = 5) { return this.c('select public.bot_buscar_equipamentos($1, $2) as r', [texto, limite]); }
  consultarDisponibilidade(equipamentoId: string, inicio: string, fim: string, quantidade: number) {
    return this.c('select public.bot_consultar_disponibilidade($1, $2, $3, $4) as r', [equipamentoId, inicio, fim, quantidade]);
  }
  calcularOrcamento(itens: { equipamento_id: string; quantidade: number }[], inicio: string, fim: string, modalidade: string) {
    return this.c('select public.bot_calcular_orcamento($1::jsonb, $2, $3, $4) as r', [JSON.stringify(itens), inicio, fim, modalidade]);
  }
  salvarOrcamento(conversaId: string, epoca: number, itens: { equipamento_id: string; quantidade: number }[], inicio: string, fim: string,
    modalidade: string, endereco: string | null, chave: string) {
    return this.c('select public.bot_salvar_orcamento($1, $2, $3::jsonb, $4, $5, $6, $7, $8) as r',
      [conversaId, epoca, JSON.stringify(itens), inicio, fim, modalidade, endereco, chave]);
  }
  criarPreReserva(conversaId: string, epoca: number, orcamentoId: string, chave: string) {
    return this.c('select public.bot_criar_pre_reserva($1, $2, $3, $4) as r', [conversaId, epoca, orcamentoId, chave]);
  }
  consultarLocacao(conversaId: string) { return this.c('select public.bot_consultar_locacao($1) as r', [conversaId]); }
  solicitarAtendimentoHumano(conversaId: string, epoca: number, motivo: string, aviso: string | null, chave: string | null) {
    return this.c('select public.bot_solicitar_atendimento_humano($1, $2, $3, $4, $5) as r', [conversaId, epoca, motivo, aviso, chave]);
  }
}
