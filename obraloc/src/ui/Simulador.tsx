// Simulador de WhatsApp: faz o papel do CLIENTE e do PROVEDOR. Nada sai deste navegador.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ClienteResumo } from '../backend/types';
import { hora, telefone } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Icone, Selo } from './componentes';

interface Contato { telefone: string; nome: string }

const NOVOS: Contato[] = [
  { telefone: '5511955550101', nome: 'Rodrigo (número novo)' },
  { telefone: '5511955550102', nome: 'Patrícia (número novo)' },
];

export function Simulador({ fechar }: { fechar: () => void }) {
  const { backend, atendimento } = useApp();
  const { provedor, servico, bot } = atendimento;
  const [, atualizar] = useReducer((x: number) => x + 1, 0);
  useEffect(() => provedor.aoMudar(atualizar), [provedor]);

  const clientes = useCarregar<ClienteResumo[]>(() => backend.clientes(''), [backend]);
  const contatos = useMemo<Contato[]>(() => [
    ...NOVOS,
    ...(clientes.dados ?? []).filter((c) => c.telefonePrincipal).map((c) => ({ telefone: c.telefonePrincipal!, nome: c.nome })),
  ], [clientes.dados]);

  const [tel, setTel] = useState(NOVOS[0].telefone);
  const [texto, setTexto] = useState('');
  const [registro, setRegistro] = useState<string[]>([]);
  const [filaPausada, setFilaPausada] = useState(servico.filaPausada);
  const contato = contatos.find((c) => c.telefone === tel) ?? NOVOS[0];
  const mensagens = provedor.aparelho(tel);
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [mensagens.length, tel]);

  const log = (t: string) => setRegistro((r) => [`${hora(new Date().toISOString())} ${t}`, ...r].slice(0, 6));
  const descrever = (r: { status: number; processados?: number; duplicados?: number } | null) => {
    if (!r) return 'sem resposta';
    if (r.status === 401) return 'webhook rejeitado (401): assinatura inválida';
    if (r.status !== 200) return `webhook com erro (${r.status})`;
    return r.duplicados ? 'webhook repetido: ignorado, nada duplicado (200)' : 'webhook aceito (200)';
  };

  const enviar = async (formato: 'texto' | 'audio') => {
    const t = texto.trim();
    if (formato === 'texto' && !t) return;
    const nome = contato.nome.replace(/ \(número novo\)$/, '');
    const r = await provedor.mensagemDoCliente({ telefone: tel, nome, texto: formato === 'texto' ? t : null, formato });
    setTexto('');
    log(`${formato === 'audio' ? 'Áudio' : 'Mensagem'} enviada: ${descrever(r)}`);
  };

  const respostaDoAssistente = async () => {
    const conv = (await backend.conversas()).find((c) => c.telefone === tel);
    if (!conv) { log('Mande uma mensagem primeiro: ainda não há conversa.'); return; }
    const r = await bot.enfileirarResposta(conv.id, conv.epocaBot, 'Claro! Para quais datas você precisa? (resposta de teste)', `simulador:${Date.now()}`);
    log(r.ok ? 'Resposta de teste do assistente na fila' : `Assistente recusado: ${r.codigo === 'bot_pausado' ? 'conversa está com a equipe' : r.codigo}`);
  };

  return (
    <div className="simulador" role="dialog" aria-label="Simulador de WhatsApp">
      <div className="simulador-topo">
        <div>
          <strong>Simulador de WhatsApp</strong> <Selo tipo="simulado" />
          <p className="pequeno" style={{ opacity: 0.85 }}>Você faz o papel do cliente. Nada sai deste navegador.</p>
        </div>
        <button className="botao-icone" onClick={fechar} aria-label="Fechar simulador"><Icone nome="fechar" /></button>
      </div>

      <div className="simulador-corpo">
        <label className="campo">
          <span className="campo-rotulo">Escrevendo como</span>
          <select value={tel} onChange={(e) => setTel(e.target.value)}>
            {contatos.map((c) => <option key={c.telefone} value={c.telefone}>{c.nome} · {telefone(c.telefone)}</option>)}
          </select>
        </label>

        <div className="aparelho">
          {mensagens.length === 0 && <p className="suave pequeno" style={{ textAlign: 'center', padding: 12 }}>
            Mostra as mensagens desta sessão do simulador. Escreva algo como “Oi, preciso de uma betoneira para sábado”.</p>}
          {mensagens.map((m) => (
            <div key={m.id} className={`balao-linha ${m.de === 'cliente' ? 'saida' : 'entrada'}`}>
              <div className={`balao ${m.de === 'cliente' ? 'balao-aparelho-eu' : 'balao-aparelho-loja'}`}>
                <p>{m.formato === 'audio' ? '🎤 Mensagem de voz (0:07)' : m.texto}</p>
                <div className="balao-rodape"><span>{hora(m.em)}</span></div>
              </div>
            </div>
          ))}
          <div ref={fim} />
        </div>

        <div className="compositor" style={{ padding: 0, border: 0 }}>
          <input type="text" value={texto} placeholder="Mensagem do cliente" aria-label="Mensagem do cliente"
            onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void enviar('texto'); }} />
          <button className="botao" onClick={() => void enviar('texto')} disabled={!texto.trim()}>Enviar</button>
        </div>
        <button className="botao botao-secundario botao-pequeno" onClick={() => void enviar('audio')}>🎤 Mandar um áudio</button>

        <details className="simulador-testes">
          <summary>Testes de falha e consistência</summary>
          <div className="pilha" style={{ gap: 8, marginTop: 8 }}>
            <button className="botao botao-secundario botao-pequeno" onClick={async () => log(`Reentrega: ${descrever(await provedor.reenviarUltimoWebhook())}`)}>
              Reenviar o último webhook (duplicado)
            </button>
            <button className="botao botao-secundario botao-pequeno" onClick={async () => log(`Falsificado: ${descrever(await provedor.webhookFalsificado(tel, 'Mensagem falsa'))}`)}>
              Enviar webhook com assinatura falsa
            </button>
            <button className="botao botao-secundario botao-pequeno" onClick={() => { provedor.programarFalhas(provedor.falhasPendentes + 1); log('O próximo envio da loja vai falhar'); }}>
              Fazer o próximo envio falhar{provedor.falhasPendentes ? ` (${provedor.falhasPendentes} programada)` : ''}
            </button>
            <label className="check"><input type="checkbox" checked={provedor.estaConectado}
              onChange={(e) => { provedor.definirConexao(e.target.checked); log(e.target.checked ? 'Conexão ligada' : 'Conexão desligada'); }} />
              Provedor conectado</label>
            <label className="check"><input type="checkbox" checked={filaPausada}
              onChange={(e) => { servico.filaPausada = e.target.checked; setFilaPausada(e.target.checked); log(e.target.checked ? 'Fila de envio pausada' : 'Fila de envio retomada'); }} />
              Pausar a fila de envio (mensagens ficam “na fila”)</label>
            <button className="botao botao-secundario botao-pequeno" onClick={respostaDoAssistente}>
              Gerar resposta de teste do assistente
            </button>
            <p className="suave pequeno">Para ver a pausa do bot: pause a fila, gere a resposta de teste e clique em “Assumir atendimento”. A resposta é cancelada e não chega ao cliente.</p>
          </div>
        </details>

        {registro.length > 0 && (
          <ul className="simulador-registro">
            {registro.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
