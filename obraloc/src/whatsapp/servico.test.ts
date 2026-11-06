// Serviço de integração + provedor simulado, sobre o banco real (PGlite).
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { abrirBanco } from '../backend/pglite/db';
import { PgliteBackend } from '../backend/pglite/backend';
import { PgliteFerramentasBot, PgliteIntegracao } from '../backend/pglite/servidor';
import { ProvedorSimulado } from './simulado';
import { ServicoAtendimento } from './servico';
import type { Transcritor } from './tipos';

const ATENDENTE = '10000000-0000-4000-a000-000000000002';
const TEL = '5511955550001';

let db: PGlite;
let equipe: PgliteBackend;
let provedor: ProvedorSimulado;
let servico: ServicoAtendimento;
let bot: PgliteFerramentasBot;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function conversaDe(tel: string) {
  return (await equipe.conversas()).find((c) => c.telefone === tel)!;
}

beforeEach(async () => {
  db = await abrirBanco({ persistir: false });
  equipe = new PgliteBackend(db);
  await equipe.entrar(ATENDENTE);
  provedor = new ProvedorSimulado();
  provedor.atrasoEntregue = 10;
  provedor.atrasoLida = 20;
  servico = new ServicoAtendimento(new PgliteIntegracao(db), provedor);
  provedor.entregar = (req) => servico.receberWebhook(req);
  bot = new PgliteFerramentasBot(db);
});

describe('entrada por webhook', () => {
  it('registra a mensagem e cria a conversa com o bot ativo', async () => {
    const r = await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi, tem betoneira?' });
    expect(r).toMatchObject({ status: 200, processados: 1 });
    const c = await conversaDe(TEL);
    expect(c.modo).toBe('bot');
    expect(c.ultimaMensagem).toBe('Oi, tem betoneira?');
    expect(c.naoLidas).toBe(1);
  });

  it('webhook reenviado idêntico não duplica', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const r = await provedor.reenviarUltimoWebhook();
    expect(r).toMatchObject({ status: 200, processados: 0, duplicados: 1 });
    const d = await equipe.conversa((await conversaDe(TEL)).id);
    expect(d.mensagens).toHaveLength(1);
  });

  it('rejeita webhook com assinatura inválida sem gravar nada', async () => {
    const r = await provedor.webhookFalsificado(TEL, 'mensagem falsa');
    expect(r).toMatchObject({ status: 401 });
    expect(await conversaDe(TEL)).toBeUndefined();
  });

  it('rejeita corpo malformado com assinatura válida', async () => {
    const corpo = '{"provedor":"outro"}';
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey('raw', enc.encode('segredo-de-demonstracao'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(corpo)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await servico.receberWebhook({ cabecalhos: { 'x-simulado-assinatura': 'sha256=' + sig }, corpo })).toMatchObject({ status: 400 });
  });

  it('reconhece cliente cadastrado pelo telefone', async () => {
    await provedor.mensagemDoCliente({ telefone: '5511990010004', nome: 'Pedro', texto: 'Já devolvo o compactador' });
    expect((await conversaDe('5511990010004')).cliente).toBe('Pedro Henrique Costa');
  });

  it('áudio sem serviço de transcrição fica marcado, sem texto inventado', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: null, formato: 'audio' });
    const d = await equipe.conversa((await conversaDe(TEL)).id);
    expect(d.mensagens[0]).toMatchObject({ tipo: 'audio', transcricaoEstado: 'indisponivel', transcricao: null });
    expect(d.conversa.audiosSemTexto).toBe(1);
  });

  it('com transcritor configurado, guarda a transcrição; se falhar, marca falha', async () => {
    const ok: Transcritor = { disponivel: true, descricao: 'teste', transcrever: async () => 'preciso de andaime' };
    servico = new ServicoAtendimento(new PgliteIntegracao(db), provedor, ok);
    provedor.entregar = (req) => servico.receberWebhook(req);
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: null, formato: 'audio' });
    const falho: Transcritor = { disponivel: true, descricao: 'teste', transcrever: async () => { throw new Error('x'); } };
    servico = new ServicoAtendimento(new PgliteIntegracao(db), provedor, falho);
    provedor.entregar = (req) => servico.receberWebhook(req);
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: null, formato: 'audio' });
    const m = (await equipe.conversa((await conversaDe(TEL)).id)).mensagens;
    expect(m.map((x) => x.transcricaoEstado)).toEqual(['concluida', 'falhou']);
    expect(m[0].transcricao).toBe('preciso de andaime');
  });

  it('aciona o bot só quando a conversa está com o bot', async () => {
    const chamadas: string[] = [];
    servico.aoAcionarBot = ({ mensagemId }) => { chamadas.push(mensagemId); };
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    await equipe.assumirAtendimento((await conversaDe(TEL)).id);
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Alô?' });
    expect(chamadas).toHaveLength(1);
  });
});

describe('saída (despachante)', () => {
  it('resposta manual: assume, envia, chega ao aparelho e recebe entregue/lida', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const c = await conversaDe(TEL);
    await equipe.enviarMensagem(c.id, 'Olá, Joana! Aqui é o Carlos.');
    expect((await conversaDe(TEL)).modo).toBe('humano');
    expect((await servico.despachar()).enviadas).toBe(1);
    expect(provedor.aparelho(TEL).at(-1)).toMatchObject({ de: 'loja', texto: 'Olá, Joana! Aqui é o Carlos.' });
    await espera(60);
    const m = (await equipe.conversa(c.id)).mensagens.at(-1)!;
    expect(m.estado).toBe('lida');
  });

  it('falha do provedor fica visível e pode ser reenviada', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const c = await conversaDe(TEL);
    provedor.programarFalhas(1);
    await equipe.enviarMensagem(c.id, 'Teste de falha');
    expect((await servico.despachar()).falhas).toBe(1);
    let m = (await equipe.conversa(c.id)).mensagens.at(-1)!;
    expect(m).toMatchObject({ estado: 'falhou', erro: 'O provedor recusou o envio (falha simulada)' });
    expect((await conversaDe(TEL)).falhas).toBe(1);
    expect((await equipe.conexoes())[0].estado).toBe('erro');

    await equipe.reenviarMensagem(m.id);
    expect((await servico.despachar()).enviadas).toBe(1);
    m = (await equipe.conversa(c.id)).mensagens.at(-1)!;
    expect(m.estado).toBe('enviada');
  });

  it('sem conexão: envio falha, estado da conexão aparece desconectado', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const c = await conversaDe(TEL);
    provedor.definirConexao(false);
    await espera(10);
    await equipe.enviarMensagem(c.id, 'Você está aí?');
    expect((await servico.despachar()).falhas).toBe(1);
    expect((await equipe.conexoes())[0]).toMatchObject({ estado: 'desconectado' });
    provedor.definirConexao(true);
    await espera(10);
    expect((await equipe.conexoes())[0].estado).toBe('simulado');
  });

  it('assumir o atendimento cancela a resposta do bot ainda na fila; nada sai', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Quero um gerador' });
    const c = await conversaDe(TEL);
    servico.filaPausada = true;
    const r = await bot.enfileirarResposta(c.id, c.epocaBot, 'Claro! Para quais datas?', 'teste:1');
    expect(r.ok).toBe(true);
    await servico.despachar();
    expect((await conversaDe(TEL)).pendentes).toBe(1);

    expect((await equipe.assumirAtendimento(c.id)).respostasCanceladas).toBe(1);
    servico.filaPausada = false;
    await servico.despachar();
    expect(provedor.aparelho(TEL).filter((m) => m.de === 'loja')).toHaveLength(0);
    const msgs = (await equipe.conversa(c.id)).mensagens;
    expect(msgs.at(-1)).toMatchObject({ autor: 'bot', estado: 'cancelada' });
    // processamento antigo do bot tenta de novo: recusado
    expect((await bot.enfileirarResposta(c.id, c.epocaBot, 'Atrasada', 'teste:2')).codigo).toBe('bot_pausado');
  });

  it('devolver ao assistente libera o bot na nova época', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const c = await conversaDe(TEL);
    await equipe.assumirAtendimento(c.id);
    await equipe.devolverAoAssistente(c.id);
    const nova = await conversaDe(TEL);
    expect(nova.modo).toBe('bot');
    expect((await bot.enfileirarResposta(c.id, nova.epocaBot, 'Voltei!', 'teste:3')).ok).toBe(true);
    expect((await servico.despachar()).enviadas).toBe(1);
  });

  it('marcar como lida zera o contador', async () => {
    await provedor.mensagemDoCliente({ telefone: TEL, nome: 'Joana', texto: 'Oi' });
    const c = await conversaDe(TEL);
    await equipe.marcarLida(c.id);
    expect((await conversaDe(TEL)).naoLidas).toBe(0);
  });
});
