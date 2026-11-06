// Testes da camada de dados do app sobre o Postgres local (PGlite), em Node.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { abrirBanco } from './db';
import { PgliteBackend } from './backend';
import { ErroNegocio } from '../types';

const ADMIN = '10000000-0000-4000-a000-000000000001';
const ATENDENTE = '10000000-0000-4000-a000-000000000002';

/** Data no fuso da loja (Brasil, -03:00): hoje + n dias, na hora indicada. */
function dia(n: number, hora = 8): string {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const d = new Date(`${hoje}T${String(hora).padStart(2, '0')}:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

describe('suíte SQL dentro do PGlite (mesmo banco do navegador)', () => {
  // Os mesmos testes que rodam no Postgres 16 rodam aqui, provando que o banco
  // do navegador se comporta igual. (Concorrência real só no Postgres: PGlite tem uma conexão.)
  const pasta = join(__dirname, '../../../supabase/tests');
  const arquivos = readdirSync(pasta).filter((f) => /^[1-9].*\.sql$/.test(f)).sort();

  for (const arquivo of arquivos) {
    it(arquivo, async () => {
      const db = await abrirBanco({ persistir: false });
      await db.exec(readFileSync(join(pasta, '01_fixtures.sql'), 'utf8'));
      await db.exec(readFileSync(join(pasta, arquivo), 'utf8'));
      await db.close();
    });
  }
});

describe('PgliteBackend', () => {
  let admin: PgliteBackend;
  let atendente: PgliteBackend;
  let db: Awaited<ReturnType<typeof abrirBanco>>;

  beforeAll(async () => {
    db = await abrirBanco({ persistir: false });
    admin = new PgliteBackend(db);
    atendente = new PgliteBackend(db);
    await admin.entrar(ADMIN);
    await atendente.entrar(ATENDENTE);
  });

  it('lista os usuários de demonstração e carrega permissões', async () => {
    const usuarios = await admin.usuariosDemo();
    expect(usuarios.map((u) => u.papel).sort()).toEqual(['admin', 'atendente']);
    const s = await new PgliteBackend(db).entrar(ATENDENTE);
    expect(s.permissoes).toContain('aprovar_locacao');
    expect(s.permissoes).not.toContain('registrar_pagamento');
  });

  it('exige sessão', async () => {
    const semSessao = new PgliteBackend(db);
    await expect(semSessao.painel()).rejects.toBeInstanceOf(ErroNegocio);
  });

  it('painel traz atrasos, pré-reservas, riscos e valores a receber', async () => {
    const p = await atendente.painel();
    expect(p.locacoes_ativas).toBe(2);
    expect(p.atrasadas[0].numero).toBe(502);
    expect(p.pre_reservas).toHaveLength(1);
    expect(p.em_risco).toHaveLength(1);
    expect(p.a_receber.total).toBeGreaterThan(0);
    expect(p.disponibilidade_agora.length).toBe(11);
  });

  it('catálogo com preços, unidades e estados', async () => {
    const lista = await atendente.equipamentos();
    const compactador = lista.find((e) => e.nome.startsWith('Compactador'))!;
    expect(compactador.alugado).toBe(1);
    expect(compactador.precos.find((p) => p.dias === 1)?.valor).toBe(140);
    const det = await atendente.equipamento(compactador.id);
    expect(det.unidades[0].codigo).toBe('CPS-001');
    expect(det.unidades[0].situacao).toBe('alugado');
    const ocup = await atendente.ocupacao(compactador.id, dia(-7), dia(7));
    expect(ocup.some((o) => o.atrasada)).toBe(true);
  });

  it('disponibilidade por período', async () => {
    const d = await atendente.disponibilidade(dia(1, 9), dia(2, 17));
    expect(d.find((x) => x.equipamento.startsWith('Compactador'))?.livres).toBe(0);
    expect(d.find((x) => x.equipamento.startsWith('Furadeira'))?.livres).toBe(2);
    await expect(atendente.disponibilidade(dia(2), dia(1))).rejects.toMatchObject({ codigo: 'periodo_invalido' });
  });

  it('atendente não altera preços nem configurações; admin altera', async () => {
    const eq = (await admin.equipamentos()).find((e) => e.nome.startsWith('Betoneira'))!;
    await expect(atendente.salvarPrecos(eq.id, [{ dias: 1, valor: 1 }])).rejects.toMatchObject({ codigo: 'sem_permissao' });
    expect((await admin.equipamento(eq.id)).precos.find((p) => p.dias === 1)?.valor).toBe(70);

    await admin.salvarPrecos(eq.id, [{ dias: 1, valor: 75 }, { dias: 7, valor: 300 }]);
    expect((await admin.equipamento(eq.id)).precos).toEqual([{ dias: 1, valor: 75 }, { dias: 7, valor: 300 }]);

    const cfg = await atendente.configuracoes();
    await expect(atendente.salvarConfiguracoes({ ...cfg, preReservaMinutos: 10 })).rejects.toMatchObject({ codigo: 'sem_permissao' });
    await admin.salvarConfiguracoes({ ...cfg, preReservaMinutos: 60 });
    expect((await admin.configuracoes()).preReservaMinutos).toBe(60);
  });

  it('cadastro de equipamento e unidade (admin) e bloqueio para atendente', async () => {
    const cats = await admin.categorias();
    const id = await admin.salvarEquipamento({ categoriaId: cats[0].id, nome: 'Rompedor 30 kg', descricao: '', palavrasChave: 'rompedor', fotos: [], ativo: true });
    await admin.adicionarUnidade(id, 'rmp-001', '');
    const det = await admin.equipamento(id);
    expect(det.unidades.map((u) => u.codigo)).toEqual(['RMP-001']);
    await expect(admin.adicionarUnidade(id, 'RMP-001', '')).rejects.toMatchObject({ codigo: 'duplicado' });
    await expect(atendente.salvarEquipamento({ categoriaId: cats[0].id, nome: 'X', descricao: '', palavrasChave: '', fotos: [], ativo: true }))
      .rejects.toMatchObject({ codigo: 'sem_permissao' });
  });

  it('unidade em manutenção sai da disponibilidade', async () => {
    const eq = (await atendente.equipamentos()).find((e) => e.nome.startsWith('Lavadora'))!;
    const det = await atendente.equipamento(eq.id);
    await atendente.alterarCondicaoUnidade(det.unidades[0].id, 'manutencao', 'Vazamento');
    const d = await atendente.disponibilidade(dia(3), dia(4));
    expect(d.find((x) => x.equipamentoId === eq.id)?.livres).toBe(1);
  });

  it('clientes: busca, cadastro com contato e telefone normalizado', async () => {
    expect((await atendente.clientes('horizonte'))[0].nome).toBe('Construtora Horizonte Ltda');
    expect((await atendente.clientes('99001-0004'))[0].nome).toBe('Pedro Henrique Costa');
    const id = await atendente.salvarCliente({
      nome: 'Marmoraria Pedra Fina', tipo: 'pj', documento: '', email: '', endereco: '', observacoes: '',
      contatos: [{ nome: 'Rita', telefone: '(11) 96666-1234', whatsapp: true, funcao: 'Compras' }],
    });
    const c = await atendente.cliente(id);
    expect(c.contatos[0].telefone).toBe('5511966661234');
    await expect(atendente.salvarCliente({
      nome: 'Outro', tipo: 'pf', documento: '', email: '', endereco: '', observacoes: '',
      contatos: [{ nome: 'Rita', telefone: '11966661234', whatsapp: true, funcao: null }],
    })).rejects.toMatchObject({ codigo: 'duplicado' });
    await expect(atendente.salvarCliente({
      nome: 'Sem DDD', tipo: 'pf', documento: '', email: '', endereco: '', observacoes: '',
      contatos: [{ nome: 'Zé', telefone: '9999', whatsapp: true, funcao: null }],
    })).rejects.toMatchObject({ codigo: 'dados_invalidos' });
  });

  it('locações filtradas por status e histórico', async () => {
    const pre = await atendente.locacoes(['pre_reserva']);
    expect(pre.map((l) => l.numero)).toEqual([504]);
    expect(pre[0].origem).toBe('bot');
    expect((await atendente.locacoes(null)).length).toBe(6);
    const h = await admin.historico(20);
    expect(h.some((x) => x.acao === 'condicao_unidade_alterada')).toBe(true);
  });
});
