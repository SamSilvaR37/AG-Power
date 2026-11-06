import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClienteResumo, ConexaoWhatsApp, ConversaDetalhe, ConversaResumo, Mensagem, ModoConversa } from '../backend/types';
import { brl, data, dataHora, hora, relativo, telefone } from '../lib/format';
import { useApp, useAoVivo, useCarregar } from '../lib/contexto';
import { navegar } from '../lib/router';
import { Carregando, ErroCaixa, Folha, Icone, Selo, StatusLocacaoTag, Vazio } from '../ui/componentes';
import { Simulador } from '../ui/Simulador';

const ROTULO_MODO: Record<ModoConversa, string> = {
  bot: 'Assistente ativo',
  aguardando_equipe: 'Aguardando equipe',
  humano: 'Atendimento humano',
};

export function ModoTag({ modo }: { modo: ModoConversa }) {
  return <span className={`tag tag-modo-${modo}`}>{ROTULO_MODO[modo]}</span>;
}

const nomeConversa = (c: ConversaResumo) => c.cliente ?? c.nomeContato ?? telefone(c.telefone);

const FILTROS: { id: string; rotulo: string; f: (c: ConversaResumo) => boolean }[] = [
  { id: 'todas', rotulo: 'Todas', f: () => true },
  { id: 'aguardando', rotulo: 'Aguardando equipe', f: (c) => c.modo === 'aguardando_equipe' },
  { id: 'humano', rotulo: 'Com a equipe', f: (c) => c.modo === 'humano' },
  { id: 'bot', rotulo: 'Com o assistente', f: (c) => c.modo === 'bot' },
  { id: 'problemas', rotulo: 'Falhas e pendências', f: (c) => c.falhas > 0 || c.pendentes > 0 || c.audiosSemTexto > 0 },
];

export function AtendimentoPagina({ conversaId }: { conversaId?: string }) {
  const { backend } = useApp();
  const lista = useCarregar<[ConversaResumo[], ConexaoWhatsApp[]]>(() => Promise.all([backend.conversas(), backend.conexoes()]), [backend]);
  useAoVivo(lista.recarregar);
  const [simulador, setSimulador] = useState(false);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');

  const conversas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const f = FILTROS.find((x) => x.id === filtro)!.f;
    return (lista.dados?.[0] ?? []).filter((c) => f(c) && (!termo || `${nomeConversa(c)} ${c.telefone}`.toLowerCase().includes(termo)));
  }, [lista.dados, filtro, busca]);

  const conexao = lista.dados?.[1].find((c) => c.provedor === 'simulado');

  return (
    <div className={`caixa ${conversaId ? 'caixa-com-conversa' : ''} ${simulador ? 'caixa-com-simulador' : ''}`}>
      <section className="caixa-lista">
        <div className="caixa-lista-topo">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <h1>Atendimento</h1>
            <button className="botao botao-secundario botao-pequeno" onClick={() => setSimulador(true)}>
              <Icone nome="whatsapp" tamanho={16} />Simulador
            </button>
          </div>
          <EstadoConexaoLinha conexao={conexao} />
          <div className="busca">
            <Icone nome="busca" tamanho={18} />
            <input type="search" placeholder="Buscar conversa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conversa" />
          </div>
          <div className="filtros" style={{ margin: 0 }}>
            {FILTROS.map((f) => {
              const n = (lista.dados?.[0] ?? []).filter(f.f).length;
              return (
                <button key={f.id} className={`filtro ${filtro === f.id ? 'ativo' : ''}`} onClick={() => setFiltro(f.id)}>
                  {f.rotulo}{f.id !== 'todas' && n > 0 ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>
        </div>
        {lista.carregando && !lista.dados && <Carregando />}
        {lista.erro && <ErroCaixa erro={lista.erro} tentar={lista.recarregar} />}
        {lista.dados && conversas.length === 0 && <Vazio>Nenhuma conversa. Use o simulador para mandar uma mensagem como cliente.</Vazio>}
        <ul className="lista conversas">
          {conversas.map((c) => (
            <li key={c.id}>
              <a className={`conversa-item ${c.id === conversaId ? 'ativa' : ''}`} href={`#/atendimento/${c.id}`}>
                <span className="avatar">{nomeConversa(c)[0]}</span>
                <div className="item-corpo">
                  <div className="conversa-linha1">
                    <strong>{nomeConversa(c)}</strong>
                    <span className="suave pequeno">{c.ultimaMensagemEm ? hora(c.ultimaMensagemEm) : ''}</span>
                  </div>
                  <div className="conversa-previa">
                    {c.ultimaTipo === 'audio' ? 'Áudio' : (
                      <>{c.ultimoAutor === 'bot' ? 'Assistente: ' : c.ultimoAutor === 'equipe' ? 'Equipe: ' : ''}{c.ultimaMensagem ?? ''}</>
                    )}
                  </div>
                  <div className="conversa-linha3">
                    <ModoTag modo={c.modo} />
                    {c.falhas > 0 && <span className="tag tag-atrasada"><Icone nome="alerta" tamanho={12} />&nbsp;{c.falhas} falha(s)</span>}
                    {c.pendentes > 0 && <span className="tag tag-pre_reserva">{c.pendentes} na fila</span>}
                    {c.audiosSemTexto > 0 && <span className="tag">Áudio sem texto</span>}
                    {c.naoLidas > 0 && <span className="nao-lidas" aria-label={`${c.naoLidas} não lidas`}>{c.naoLidas}</span>}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="caixa-conversa">
        {conversaId ? <ConversaAberta key={conversaId} id={conversaId} aoMudar={lista.recarregar} /> : (
          <div className="caixa-vazia">
            <Icone nome="whatsapp" tamanho={40} />
            <p>Escolha uma conversa.</p>
            <p className="suave pequeno">Para testar, abra o <button className="link" onClick={() => setSimulador(true)}>simulador</button> e mande uma mensagem como cliente.</p>
          </div>
        )}
      </section>

      {simulador && <Simulador fechar={() => setSimulador(false)} />}
    </div>
  );
}

function EstadoConexaoLinha({ conexao }: { conexao?: ConexaoWhatsApp }) {
  if (!conexao) return null;
  const ok = conexao.estado === 'simulado' || conexao.estado === 'conectado';
  return (
    <div className={`conexao ${ok ? 'conexao-ok' : 'conexao-erro'}`}>
      <span className="ponto" />
      <span>
        WhatsApp {ok ? 'conectado' : conexao.estado === 'desconectado' ? 'desconectado' : 'com erro'}
        {!ok && conexao.ultimoErro ? ` · ${conexao.ultimoErro}` : ''}
      </span>
      <Selo tipo="simulado" />
    </div>
  );
}

// ------------------------------------------------------------ conversa aberta
function ConversaAberta({ id, aoMudar }: { id: string; aoMudar: () => void }) {
  const { backend, pode, sessao, avisar } = useApp();
  const r = useCarregar<ConversaDetalhe>(() => backend.conversa(id), [backend, id]);
  useAoVivo(r.recarregar, 2000);
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [info, setInfo] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const qtd = r.dados?.mensagens.length ?? 0;

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [qtd]);
  const naoLidas = r.dados?.conversa.naoLidas ?? 0;
  useEffect(() => {
    if (naoLidas > 0 && pode('atender_conversas')) void backend.marcarLida(id).then(aoMudar).catch(() => undefined);
  }, [naoLidas, backend, id, aoMudar, pode]);

  const acao = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    try { await fn(); if (ok) avisar(ok); r.recarregar(); aoMudar(); }
    catch (e) { avisar((e as Error).message, 'erro'); }
    finally { setOcupado(false); }
  }, [avisar, r, aoMudar]);

  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <ErroCaixa erro={r.erro} tentar={r.recarregar} />;
  if (!r.dados) return null;
  const { conversa: c, mensagens } = r.dados;
  const podeAtender = pode('atender_conversas');

  const enviar = () => {
    const t = texto.trim();
    if (!t) return;
    void acao(async () => { await backend.enviarMensagem(c.id, t); setTexto(''); });
  };

  return (
    <div className="conversa">
      <header className="conversa-topo">
        <button className="botao-icone so-movel" onClick={() => navegar('/atendimento')} aria-label="Voltar"><Icone nome="voltar" /></button>
        <div className="item-corpo">
          <strong>{nomeConversa(c)}</strong>
          <div className="suave pequeno">{telefone(c.telefone)} · <ModoTag modo={c.modo} />{c.atendente && c.modo === 'humano' && ` com ${c.atendente}`}</div>
        </div>
        <button className="botao botao-secundario botao-pequeno so-movel-e-medio" onClick={() => setInfo(true)}>Cliente</button>
      </header>

      <div className={`faixa-modo faixa-${c.modo}`}>
        {c.modo === 'bot' && (
          <>
            <span><strong>Assistente virtual ativo.</strong> Ao assumir, ele pausa e as respostas dele que ainda não saíram são canceladas.
              <span className="suave"> Assistente de demonstração: regras fixas, sem IA.</span></span>
            {podeAtender && <button className="botao botao-pequeno" disabled={ocupado} onClick={() => acao(async () => {
              const x = await backend.assumirAtendimento(c.id);
              avisar(x.respostasCanceladas ? `Atendimento assumido. ${x.respostasCanceladas} resposta(s) do assistente cancelada(s).` : 'Atendimento assumido. O assistente está pausado.');
            })}>Assumir atendimento</button>}
          </>
        )}
        {c.modo === 'aguardando_equipe' && (
          <>
            <span><strong>O assistente pediu ajuda da equipe.</strong>{c.motivoEscalonamento && ` Motivo: ${c.motivoEscalonamento}.`}</span>
            {podeAtender && <button className="botao botao-pequeno" disabled={ocupado} onClick={() => acao(() => backend.assumirAtendimento(c.id), 'Atendimento assumido.')}>Assumir atendimento</button>}
          </>
        )}
        {c.modo === 'humano' && (
          <>
            <span><strong>{c.atendenteId === sessao.userId ? 'Você está atendendo.' : `${c.atendente ?? 'A equipe'} está atendendo.`}</strong> O assistente só volta quando alguém devolver a conversa.</span>
            {podeAtender && <button className="botao botao-secundario botao-pequeno" disabled={ocupado} onClick={() => acao(() => backend.devolverAoAssistente(c.id), 'Conversa devolvida ao assistente.')}>Devolver ao assistente</button>}
          </>
        )}
      </div>

      <div className="mensagens" aria-live="polite">
        {mensagens.length === 0 && <Vazio>Sem mensagens.</Vazio>}
        {mensagens.map((m, i) => {
          const novoDia = i === 0 || data(mensagens[i - 1].criadoEm) !== data(m.criadoEm);
          return (
            <div key={m.id}>
              {novoDia && <div className="dia-separador"><span>{data(m.criadoEm)}</span></div>}
              <Balao m={m} reenviar={podeAtender ? () => acao(() => backend.reenviarMensagem(m.id), 'Mensagem de volta à fila.') : undefined} />
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      {podeAtender && (
        <div className="compositor">
          <textarea rows={1} value={texto} placeholder={c.modo === 'humano' ? 'Escreva uma resposta' : 'Responder (assume o atendimento e pausa o assistente)'}
            onChange={(e) => setTexto(e.target.value)} aria-label="Resposta"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }} />
          <button className="botao" disabled={ocupado || !texto.trim()} onClick={enviar}>Enviar</button>
        </div>
      )}

      <aside className="conversa-info so-largo"><InfoCliente d={r.dados} aoMudar={() => { r.recarregar(); aoMudar(); }} /></aside>
      <Folha titulo="Cliente e locações" aberta={info} fechar={() => setInfo(false)}>
        <InfoCliente d={r.dados} aoMudar={() => { r.recarregar(); aoMudar(); }} />
      </Folha>
    </div>
  );
}

const ROTULO_ESTADO: Record<Mensagem['estado'], string> = {
  recebida: '', pendente: 'Na fila', enviando: 'Enviando…', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', falhou: 'Falhou', cancelada: 'Não enviada',
};

function Balao({ m, reenviar }: { m: Mensagem; reenviar?: () => void }) {
  const saida = m.direcao === 'saida';
  const autor = m.autor === 'bot' ? 'Assistente virtual' : m.autor === 'sistema' ? 'Aviso automático' : m.autor === 'equipe' ? (m.autorNome ?? 'Equipe') : null;
  return (
    <div className={`balao-linha ${saida ? 'saida' : 'entrada'}`}>
      <div className={`balao balao-${m.autor} estado-${m.estado}`}>
        {autor && <div className="balao-autor">{autor}</div>}
        {m.tipo === 'audio' ? (
          <div className="balao-audio">
            <strong>Mensagem de voz</strong>
            {m.transcricaoEstado === 'concluida' && m.transcricao
              ? <p>Transcrição: “{m.transcricao}”</p>
              : <p className="aviso-audio">
                  {m.transcricaoEstado === 'pendente' ? 'Transcrevendo…'
                    : m.transcricaoEstado === 'falhou' ? 'A transcrição falhou. Peça ao cliente para escrever.'
                    : 'Sem serviço de transcrição configurado. O áudio não foi entendido: peça ao cliente para escrever.'}
                </p>}
          </div>
        ) : m.tipo !== 'texto' ? <p className="suave">[{m.tipo}] {m.corpo}</p> : <p>{m.corpo}</p>}
        <div className="balao-rodape">
          <span>{hora(m.criadoEm)}</span>
          {saida && <span className={`estado estado-txt-${m.estado}`}>{ROTULO_ESTADO[m.estado]}</span>}
        </div>
        {m.estado === 'falhou' && (
          <div className="balao-erro">
            <Icone nome="alerta" tamanho={14} /> {m.erro ?? 'Falha no envio'}
            {reenviar && m.autor === 'equipe' && <button className="botao botao-secundario botao-pequeno" onClick={reenviar}>Reenviar</button>}
          </div>
        )}
        {m.estado === 'cancelada' && m.erro && <div className="balao-cancelada">{m.erro}</div>}
      </div>
    </div>
  );
}

function InfoCliente({ d, aoMudar }: { d: ConversaDetalhe; aoMudar: () => void }) {
  const { backend, pode, avisar } = useApp();
  const [vincular, setVincular] = useState(false);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ClienteResumo[]>([]);
  const c = d.conversa;

  useEffect(() => {
    if (!vincular) return;
    let vivo = true;
    void backend.clientes(busca).then((r) => vivo && setResultados(r.slice(0, 6)));
    return () => { vivo = false; };
  }, [vincular, busca, backend]);

  return (
    <div className="pilha" style={{ gap: 16 }}>
      <div>
        <h3>Cliente</h3>
        {c.clienteId ? (
          <div style={{ marginTop: 6 }}>
            <a href={`#/clientes/${c.clienteId}`}><strong>{c.cliente}</strong></a>
            {c.cadastroIncompleto && <div><span className="tag tag-pre_reserva">Cadastro a conferir</span></div>}
            <div className="suave pequeno">{telefone(c.telefone)}</div>
          </div>
        ) : (
          <div style={{ marginTop: 6 }}>
            <p className="suave pequeno">Número ainda não vinculado a um cliente ({telefone(c.telefone)}).</p>
            {pode('atender_conversas') && !vincular && <button className="botao botao-secundario botao-pequeno" style={{ marginTop: 6 }} onClick={() => setVincular(true)}>Vincular a cliente</button>}
            {vincular && (
              <div className="pilha" style={{ gap: 6, marginTop: 8 }}>
                <input type="search" placeholder="Buscar cliente" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente para vincular" />
                {resultados.map((x) => (
                  <button key={x.id} className="usuario-demo" style={{ padding: 8 }} onClick={async () => {
                    try { await backend.vincularCliente(c.id, x.id); avisar('Cliente vinculado.'); setVincular(false); aoMudar(); }
                    catch (e) { avisar((e as Error).message, 'erro'); }
                  }}>{x.nome}<span className="suave pequeno" style={{ marginLeft: 'auto' }}>{telefone(x.telefonePrincipal)}</span></button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {c.motivoEscalonamento && <div className="aviso aviso-atencao"><Icone nome="alerta" tamanho={16} />{c.motivoEscalonamento}</div>}

      <div>
        <h3>Orçamentos</h3>
        {d.orcamentos.length === 0 ? <Vazio>Nenhum orçamento.</Vazio> : (
          <ul className="lista">
            {d.orcamentos.map((o) => (
              <li key={o.id} className="item">
                <div className="item-corpo">
                  <div className="item-titulo" style={{ fontSize: '0.9rem' }}>Orçamento #{o.numero} <span className="tag">{o.status}</span></div>
                  <div className="item-sub">{o.itens} · {data(o.inicio)} → {data(o.fim)}</div>
                  <div className="item-sub">Regra: {o.regra}{o.status === 'enviado' && ` · válido até ${dataHora(o.validadeAte)}`}</div>
                </div>
                <strong className="num pequeno">{brl(o.valorTotal)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3>Locações</h3>
        {d.locacoes.length === 0 ? <Vazio>Nenhuma locação.</Vazio> : (
          <ul className="lista">
            {d.locacoes.map((l) => (
              <li key={l.id}><a className="item" href={`#/locacao/${l.id}`}>
                <div className="item-corpo">
                  <div className="item-titulo" style={{ fontSize: '0.9rem' }}>#{l.numero} <StatusLocacaoTag status={l.status} atrasada={l.atrasada} /></div>
                  <div className="item-sub">{l.itens} · {data(l.inicio)} → {data(l.fim)}</div>
                  {l.status === 'pre_reserva' && l.expiraEm && <div className="item-sub">Expira {relativo(l.expiraEm)}</div>}
                </div>
                <strong className="num pequeno">{brl(l.valorTotal)}</strong>
              </a></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
