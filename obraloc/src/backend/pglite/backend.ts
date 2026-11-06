// Implementação do Backend sobre o Postgres local (PGlite).
// Cada chamada roda numa transação com o papel `authenticated` e o usuário da sessão,
// do mesmo jeito que o PostgREST do Supabase faz. Assim o RLS e as permissões valem aqui também.
import type { PGlite, Transaction } from '@electric-sql/pglite';
import type { Backend } from '../backend';
import {
  ErroNegocio,
  type Categoria, type ClienteDetalhe, type ClienteInput, type ClienteResumo, type CondicaoUnidade,
  type Configuracoes, type DisponibilidadeLinha, type EntradaHistorico, type EquipamentoDetalhe,
  type EquipamentoInput, type EquipamentoResumo, type LocacaoResumo, type Ocupacao, type Painel,
  type Permissao, type Preco, type RegraCobranca, type Sessao, type StatusLocacao, type UsuarioDemo,
} from '../types';
import { reiniciarBanco } from './db';

type Linha = Record<string, unknown>;

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOuNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
const txt = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Traduz erros do Postgres em mensagens para pessoas, sem expor detalhes técnicos. */
export function traduzirErro(e: unknown): Error {
  const err = e as { code?: string; message?: string; detail?: string };
  if (err?.code === 'P0001') return new ErroNegocio(err.message ?? 'erro', err.detail ?? 'Não foi possível concluir.');
  if (err?.code === '42501') return new ErroNegocio('sem_permissao', 'Você não tem permissão para esta ação.');
  if (err?.code === '23505') return new ErroNegocio('duplicado', 'Já existe um cadastro com esses dados (código ou telefone repetido).');
  if (err?.code === '23514' || err?.code === '22P02') return new ErroNegocio('dados_invalidos', 'Algum dado está em formato inválido.');
  if (e instanceof ErroNegocio) return e;
  console.error('[obraloc] falha inesperada no banco', err?.code);
  return new ErroNegocio('falha', 'Não foi possível concluir agora. Tente novamente.');
}

function mapLocacao(r: Linha): LocacaoResumo {
  return {
    id: String(r.id), numero: num(r.numero), status: r.status as StatusLocacao,
    clienteId: String(r.cliente_id), cliente: String(r.cliente),
    inicio: iso(r.inicio), fim: iso(r.fim), modalidade: r.modalidade as LocacaoResumo['modalidade'],
    valorItens: num(r.valor_itens), valorFrete: numOuNull(r.valor_frete), valorTotal: num(r.valor_total),
    recebido: num(r.recebido), saldo: num(r.saldo), atrasada: Boolean(r.atrasada),
    expiraEm: isoOuNull(r.expira_em), itens: txt(r.itens), origem: r.criado_por_tipo as LocacaoResumo['origem'],
  };
}

export class PgliteBackend implements Backend {
  readonly ambiente = {
    tipo: 'demo-local' as const,
    descricao: 'Banco de demonstração no seu navegador, com dados fictícios. Nada é enviado para servidores.',
  };
  private userId: string | null = null;

  constructor(private db: PGlite) {}

  /** Executa como o usuário logado (papel authenticated + claims), como no Supabase. */
  private async comoUsuario<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    if (!this.userId) throw new ErroNegocio('sem_sessao', 'Entre no sistema para continuar.');
    const claims = JSON.stringify({ sub: this.userId, role: 'authenticated' });
    try {
      return await this.db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        await tx.exec('set local role authenticated');
        return fn(tx);
      });
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  private async rpc<T = unknown>(sql: string, params: unknown[] = []): Promise<T> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query<{ r: T }>(sql, params);
      return r.rows[0]?.r as T;
    });
  }

  // ------------------------------------------------------------ sessão
  async usuariosDemo(): Promise<UsuarioDemo[]> {
    // leitura administrativa só para montar a tela de login de demonstração
    const r = await this.db.query<Linha>(
      `select p.user_id, p.nome, p.papel, u.email from public.perfis p join auth.users u on u.id = p.user_id
       where p.ativo order by p.papel, p.nome`);
    return r.rows.map((x) => ({ userId: String(x.user_id), nome: String(x.nome), papel: x.papel as UsuarioDemo['papel'], email: String(x.email) }));
  }

  async entrar(userId: string): Promise<Sessao> {
    this.userId = userId;
    try {
      return await this.comoUsuario(async (tx) => {
        const p = await tx.query<Linha>(`select p.user_id, p.nome, p.papel from public.perfis p
          where p.user_id = auth.uid() and p.ativo`);
        if (!p.rows[0]) throw new ErroNegocio('sem_perfil', 'Usuário sem acesso ao sistema.');
        const perms = await tx.query<{ permissao: Permissao }>(
          `select permissao from public.permissoes_papel where papel = $1 order by 1`, [p.rows[0].papel]);
        return {
          userId: String(p.rows[0].user_id), nome: String(p.rows[0].nome), papel: p.rows[0].papel as Sessao['papel'],
          email: '', permissoes: perms.rows.map((x) => x.permissao),
        };
      });
    } catch (e) {
      this.userId = null;
      throw e;
    }
  }

  // ------------------------------------------------------------ painel
  painel(): Promise<Painel> {
    return this.rpc<Painel>('select public.painel_resumo() as r').then((p) => ({
      ...p,
      a_receber: { ...p.a_receber, total: num(p.a_receber.total) },
    }));
  }

  // ------------------------------------------------------------ catálogo
  categorias(): Promise<Categoria[]> {
    return this.comoUsuario(async (tx) =>
      (await tx.query<Categoria>('select id, nome, ordem from public.categorias order by ordem, nome')).rows);
  }

  private sqlEquipamentos(where: string) {
    return `
      select e.id, e.nome, e.categoria_id, c.nome as categoria, e.descricao, e.palavras_chave, e.fotos, e.ativo,
        coalesce((select jsonb_agg(jsonb_build_object('dias', p.dias, 'valor', p.valor) order by p.dias)
                  from public.equipamento_precos p where p.equipamento_id = e.id), '[]'::jsonb) as precos,
        count(v.unidade_id) filter (where v.situacao <> 'baixada') as total,
        count(v.unidade_id) filter (where v.situacao = 'disponivel') as disponivel,
        count(v.unidade_id) filter (where v.situacao = 'reservado') as reservado,
        count(v.unidade_id) filter (where v.situacao = 'alugado') as alugado,
        count(v.unidade_id) filter (where v.situacao = 'manutencao') as manutencao
      from public.equipamentos e
      join public.categorias c on c.id = e.categoria_id
      left join public.v_unidades_situacao v on v.equipamento_id = e.id
      ${where}
      group by e.id, c.nome, c.ordem
      order by c.ordem, e.nome`;
  }

  private mapEquipamento(r: Linha): EquipamentoResumo {
    return {
      id: String(r.id), nome: String(r.nome), categoriaId: String(r.categoria_id), categoria: String(r.categoria),
      descricao: txt(r.descricao), palavrasChave: txt(r.palavras_chave), fotos: (r.fotos as string[]) ?? [],
      ativo: Boolean(r.ativo),
      precos: ((r.precos as { dias: number; valor: number }[]) ?? []).map((p) => ({ dias: num(p.dias), valor: num(p.valor) })),
      total: num(r.total), disponivel: num(r.disponivel), reservado: num(r.reservado),
      alugado: num(r.alugado), manutencao: num(r.manutencao),
    };
  }

  equipamentos(): Promise<EquipamentoResumo[]> {
    return this.comoUsuario(async (tx) => (await tx.query<Linha>(this.sqlEquipamentos(''))).rows.map((r) => this.mapEquipamento(r)));
  }

  equipamento(id: string): Promise<EquipamentoDetalhe> {
    return this.comoUsuario(async (tx) => {
      const e = await tx.query<Linha>(this.sqlEquipamentos('where e.id = $1'), [id]);
      if (!e.rows[0]) throw new ErroNegocio('nao_encontrado', 'Equipamento não encontrado.');
      const u = await tx.query<Linha>(`
        select u.id, u.codigo, u.numero_serie, u.condicao, u.observacoes, v.situacao, v.proxima_reserva_em
        from public.unidades u join public.v_unidades_situacao v on v.unidade_id = u.id
        where u.equipamento_id = $1 order by u.codigo`, [id]);
      return {
        ...this.mapEquipamento(e.rows[0]),
        unidades: u.rows.map((x) => ({
          id: String(x.id), codigo: String(x.codigo), numeroSerie: txt(x.numero_serie),
          condicao: x.condicao as CondicaoUnidade, situacao: x.situacao as EquipamentoDetalhe['unidades'][number]['situacao'],
          observacoes: txt(x.observacoes), proximaReservaEm: isoOuNull(x.proxima_reserva_em),
        })),
      };
    });
  }

  ocupacao(equipamentoId: string, de: string, ate: string): Promise<Ocupacao[]> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query<Linha>('select * from public.ocupacao_equipamento($1, $2, $3)', [equipamentoId, de, ate]);
      return r.rows.map((x) => ({
        unidadeId: String(x.unidade_id), unidade: String(x.unidade), tipo: x.tipo as Ocupacao['tipo'],
        locacaoId: txt(x.locacao_id), numero: numOuNull(x.numero), status: (x.status as StatusLocacao) ?? null,
        cliente: txt(x.cliente), inicio: iso(x.inicio), fim: iso(x.fim), atrasada: Boolean(x.atrasada), motivo: txt(x.motivo),
      }));
    });
  }

  salvarEquipamento(i: EquipamentoInput): Promise<string> {
    if (!i.nome.trim()) return Promise.reject(new ErroNegocio('dados_invalidos', 'Informe o nome do equipamento.'));
    return this.comoUsuario(async (tx) => {
      const params = [i.categoriaId, i.nome.trim(), i.descricao.trim() || null, i.palavrasChave.trim() || null,
        i.fotos.filter((f) => f.trim()), i.ativo];
      const r = i.id
        ? await tx.query<{ id: string }>(`update public.equipamentos set categoria_id = $1, nome = $2, descricao = $3,
             palavras_chave = $4, fotos = $5, ativo = $6 where id = $7 returning id`, [...params, i.id])
        : await tx.query<{ id: string }>(`insert into public.equipamentos (categoria_id, nome, descricao, palavras_chave, fotos, ativo)
             values ($1, $2, $3, $4, $5, $6) returning id`, params);
      // RLS bloqueia em silêncio (0 linhas) quando falta permissão
      if (!r.rows[0]) throw new ErroNegocio('sem_permissao', 'Você não tem permissão para alterar o catálogo.');
      return r.rows[0].id;
    });
  }

  salvarPrecos(equipamentoId: string, precos: Preco[]): Promise<void> {
    const validos = precos.filter((p) => p.dias > 0 && p.valor > 0);
    if (new Set(validos.map((p) => p.dias)).size !== validos.length) {
      return Promise.reject(new ErroNegocio('dados_invalidos', 'Há dois preços para o mesmo número de dias.'));
    }
    return this.comoUsuario(async (tx) => {
      const del = await tx.query('delete from public.equipamento_precos where equipamento_id = $1 returning dias', [equipamentoId]);
      const tinha = await tx.query<{ n: number }>('select count(*)::int n from public.equipamento_precos where equipamento_id = $1', [equipamentoId]);
      if (tinha.rows[0].n > 0 && del.rows.length === 0) throw new ErroNegocio('sem_permissao', 'Você não tem permissão para alterar preços.');
      for (const p of validos) {
        await tx.query('insert into public.equipamento_precos (equipamento_id, dias, valor) values ($1, $2, $3)', [equipamentoId, p.dias, p.valor]);
      }
    });
  }

  adicionarUnidade(equipamentoId: string, codigo: string, numeroSerie: string): Promise<void> {
    if (!codigo.trim()) return Promise.reject(new ErroNegocio('dados_invalidos', 'Informe o código de patrimônio.'));
    return this.comoUsuario(async (tx) => {
      await tx.query('insert into public.unidades (equipamento_id, codigo, numero_serie) values ($1, $2, $3)',
        [equipamentoId, codigo.trim().toUpperCase(), numeroSerie.trim() || null]);
    });
  }

  async alterarCondicaoUnidade(unidadeId: string, condicao: CondicaoUnidade, observacao: string): Promise<void> {
    await this.rpc('select public.alterar_condicao_unidade($1, $2, $3) as r', [unidadeId, condicao, observacao.trim() || null]);
  }

  // ------------------------------------------------------------ disponibilidade
  async disponibilidade(inicio: string, fim: string): Promise<DisponibilidadeLinha[]> {
    const r = await this.rpc<Linha[]>('select public.disponibilidade_periodo($1, $2) as r', [inicio, fim]);
    return r.map((x) => ({
      equipamentoId: String(x.equipamento_id), equipamento: String(x.equipamento), categoria: String(x.categoria),
      ativas: num(x.ativas), livres: num(x.livres), diaria: numOuNull(x.diaria),
    }));
  }

  // ------------------------------------------------------------ clientes
  clientes(busca: string): Promise<ClienteResumo[]> {
    return this.comoUsuario(async (tx) => {
      const termo = `%${busca.trim().toLowerCase()}%`;
      const digitos = busca.replace(/\D/g, '');
      const r = await tx.query<Linha>(`
        select c.id, c.nome, c.tipo, c.documento, c.origem, c.cadastro_incompleto,
          (select telefone from public.cliente_contatos k where k.cliente_id = c.id order by k.criado_em limit 1) as telefone,
          (select count(*) from public.locacoes l where l.cliente_id = c.id and l.status in ('pre_reserva','confirmada','em_andamento')) as ativas,
          coalesce((select sum(saldo) from public.v_locacoes_resumo v where v.cliente_id = c.id and v.status in ('confirmada','em_andamento','devolvida')), 0) as saldo
        from public.clientes c
        where $1 = '%%' or lower(c.nome) like $1 or lower(coalesce(c.documento, '')) like $1
           or ($2 <> '' and exists (select 1 from public.cliente_contatos k where k.cliente_id = c.id and k.telefone like '%' || $2 || '%'))
           or exists (select 1 from public.cliente_contatos k where k.cliente_id = c.id and lower(k.nome) like $1)
        order by c.cadastro_incompleto desc, c.nome`, [termo, digitos]);
      return r.rows.map((x) => ({
        id: String(x.id), nome: String(x.nome), tipo: x.tipo as 'pf' | 'pj', documento: txt(x.documento),
        origem: String(x.origem), cadastroIncompleto: Boolean(x.cadastro_incompleto), telefonePrincipal: txt(x.telefone),
        locacoesAtivas: num(x.ativas), saldo: num(x.saldo),
      }));
    });
  }

  cliente(id: string): Promise<ClienteDetalhe> {
    return this.comoUsuario(async (tx) => {
      const c = await tx.query<Linha>('select * from public.clientes where id = $1', [id]);
      if (!c.rows[0]) throw new ErroNegocio('nao_encontrado', 'Cliente não encontrado.');
      const k = await tx.query<Linha>('select id, nome, telefone, whatsapp, funcao from public.cliente_contatos where cliente_id = $1 order by criado_em', [id]);
      const l = await tx.query<Linha>('select * from public.v_locacoes_resumo where cliente_id = $1 order by inicio desc', [id]);
      const x = c.rows[0];
      return {
        id: String(x.id), nome: String(x.nome), tipo: x.tipo as 'pf' | 'pj', documento: txt(x.documento), email: txt(x.email),
        endereco: txt(x.endereco), observacoes: txt(x.observacoes), origem: String(x.origem),
        cadastroIncompleto: Boolean(x.cadastro_incompleto),
        contatos: k.rows.map((y) => ({ id: String(y.id), nome: String(y.nome), telefone: String(y.telefone), whatsapp: Boolean(y.whatsapp), funcao: txt(y.funcao) })),
        locacoes: l.rows.map(mapLocacao),
      };
    });
  }

  salvarCliente(i: ClienteInput): Promise<string> {
    if (!i.nome.trim()) return Promise.reject(new ErroNegocio('dados_invalidos', 'Informe o nome do cliente.'));
    for (const k of i.contatos) {
      const tel = k.telefone.replace(/\D/g, '');
      if (!k.nome.trim() || !/^[0-9]{10,15}$/.test(tel)) {
        return Promise.reject(new ErroNegocio('dados_invalidos', 'Cada contato precisa de nome e telefone com DDD (ex.: 11 98765-4321).'));
      }
    }
    return this.comoUsuario(async (tx) => {
      const params = [i.nome.trim(), i.tipo, i.documento.trim() || null, i.email.trim() || null, i.endereco.trim() || null, i.observacoes.trim() || null];
      const r = i.id
        ? await tx.query<{ id: string }>(`update public.clientes set nome = $1, tipo = $2, documento = $3, email = $4, endereco = $5,
             observacoes = $6, cadastro_incompleto = false where id = $7 returning id`, [...params, i.id])
        : await tx.query<{ id: string }>(`insert into public.clientes (nome, tipo, documento, email, endereco, observacoes, origem)
             values ($1, $2, $3, $4, $5, $6, 'balcao') returning id`, params);
      if (!r.rows[0]) throw new ErroNegocio('sem_permissao', 'Você não tem permissão para alterar clientes.');
      const clienteId = r.rows[0].id;
      const manter = i.contatos.filter((k) => k.id).map((k) => k.id);
      await tx.query('delete from public.cliente_contatos where cliente_id = $1 and not (id = any($2::uuid[]))', [clienteId, manter]);
      for (const k of i.contatos) {
        // telefone guardado só com dígitos; sem DDI, assume Brasil (55)
        let tel = k.telefone.replace(/\D/g, '');
        if (tel.length <= 11) tel = '55' + tel;
        if (k.id) {
          await tx.query('update public.cliente_contatos set nome = $1, telefone = $2, whatsapp = $3, funcao = $4 where id = $5',
            [k.nome.trim(), tel, k.whatsapp, k.funcao?.trim() || null, k.id]);
        } else {
          await tx.query('insert into public.cliente_contatos (cliente_id, nome, telefone, whatsapp, funcao) values ($1, $2, $3, $4, $5)',
            [clienteId, k.nome.trim(), tel, k.whatsapp, k.funcao?.trim() || null]);
        }
      }
      return clienteId;
    });
  }

  // ------------------------------------------------------------ locações
  locacoes(status: StatusLocacao[] | null): Promise<LocacaoResumo[]> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query<Linha>(
        `select * from public.v_locacoes_resumo where $1::text[] is null or status::text = any($1::text[])
         order by case status when 'pre_reserva' then 0 when 'em_andamento' then 1 when 'confirmada' then 2 else 3 end, inicio desc`,
        [status]);
      return r.rows.map(mapLocacao);
    });
  }

  // ------------------------------------------------------------ configurações
  regrasCobranca(): Promise<RegraCobranca[]> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query<Linha>('select * from public.regras_cobranca order by nome');
      return r.rows.map((x) => ({
        id: String(x.id), codigo: String(x.codigo), nome: String(x.nome), metodo: x.metodo as RegraCobranca['metodo'],
        contagem: x.contagem as RegraCobranca['contagem'], minimoDias: num(x.minimo_dias), descricao: String(x.descricao),
        demonstrativa: Boolean(x.demonstrativa), ativa: Boolean(x.ativa),
      }));
    });
  }

  configuracoes(): Promise<Configuracoes> {
    return this.comoUsuario(async (tx) => {
      const x = (await tx.query<Linha>('select * from public.configuracoes where id')).rows[0];
      return {
        fusoHorario: String(x.fuso_horario), preReservaMinutos: num(x.pre_reserva_minutos),
        orcamentoValidadeHoras: num(x.orcamento_validade_horas), atrasoBloqueioHoras: num(x.atraso_bloqueio_horas),
        periodoMaximoDias: num(x.periodo_maximo_dias), regraCobrancaId: txt(x.regra_cobranca_id),
      };
    });
  }

  salvarConfiguracoes(c: Configuracoes): Promise<void> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query(`update public.configuracoes set pre_reserva_minutos = $1, orcamento_validade_horas = $2,
          atraso_bloqueio_horas = $3, periodo_maximo_dias = $4, regra_cobranca_id = $5, atualizado_em = now()
        where id returning id`,
        [c.preReservaMinutos, c.orcamentoValidadeHoras, c.atrasoBloqueioHoras, c.periodoMaximoDias, c.regraCobrancaId]);
      if (!r.rows[0]) throw new ErroNegocio('sem_permissao', 'Só o administrador altera as configurações.');
    });
  }

  historico(limite: number): Promise<EntradaHistorico[]> {
    return this.comoUsuario(async (tx) => {
      const r = await tx.query<Linha>(`select h.*, p.nome as ator from public.historico h
        left join public.perfis p on p.user_id = h.ator_id order by h.em desc limit $1`, [limite]);
      return r.rows.map((x) => ({
        id: num(x.id), em: iso(x.em), atorTipo: String(x.ator_tipo), ator: txt(x.ator), acao: String(x.acao),
        entidade: String(x.entidade), dados: (x.dados as Record<string, unknown>) ?? {},
      }));
    });
  }

  async reiniciarDemo(): Promise<void> {
    await reiniciarBanco(this.db);
  }
}
