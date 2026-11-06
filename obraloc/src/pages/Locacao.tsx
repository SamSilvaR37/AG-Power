import { useState, type ReactNode } from 'react';
import type { FormaPagamento, ItemChecklist, LocacaoDetalhe } from '../backend/types';
import { brl, dataHora, relativo, rotuloAcao, rotuloOrigem } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Campo, Carregando, Cartao, ErroCaixa, Folha, Icone, Selo, StatusLocacaoTag, Vazio } from '../ui/componentes';

const CHECK_RETIRADA = ['Equipamento testado e funcionando', 'Acessórios completos', 'Equipamento limpo', 'Cliente orientado sobre o uso seguro', 'Documento do cliente conferido'];
const CHECK_DEVOLUCAO = ['Funcionando normalmente', 'Sem danos aparentes', 'Acessórios devolvidos', 'Equipamento limpo'];
const FORMAS: [FormaPagamento, string][] = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['cartao', 'Cartão'], ['transferencia', 'Transferência'], ['boleto', 'Boleto'], ['outro', 'Outro']];

type Acao = 'aprovar' | 'cancelar' | 'frete' | 'retirada' | 'devolucao' | 'recebimento' | 'avisar' | null;

export function LocacaoPagina({ id }: { id: string }) {
  const { backend, pode } = useApp();
  const r = useCarregar<LocacaoDetalhe>(() => backend.locacao(id), [backend, id]);
  const [acao, setAcao] = useState<Acao>(null);

  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <ErroCaixa erro={r.erro} tentar={r.recarregar} />;
  if (!r.dados) return null;
  const d = r.dados;
  const l = d.resumo;
  const aberta = ['pre_reserva', 'confirmada', 'em_andamento'].includes(l.status);
  const fechar = () => setAcao(null);
  const feito = () => { setAcao(null); r.recarregar(); };

  return (
    <>
      <Cabecalho voltar="/locacoes" titulo={<>Locação #{l.numero} <StatusLocacaoTag status={l.status} atrasada={l.atrasada} /></>}
        subtitulo={<><a href={`#/clientes/${l.clienteId}`}>{l.cliente}</a> · origem: {rotuloOrigem[l.origem] ?? l.origem}{d.orcamentoNumero && ` · orçamento #${d.orcamentoNumero}`}</>} />

      {l.status === 'pre_reserva' && l.expiraEm && (
        <div className="aviso aviso-atencao" style={{ marginBottom: 12 }}>
          <Icone nome="alerta" tamanho={18} />
          <span>Pré-reserva aguardando aprovação. As unidades ficam seguras até {dataHora(l.expiraEm)} ({relativo(l.expiraEm)}). Depois disso, ela expira sozinha.</span>
        </div>
      )}
      {d.riscos.map((x) => (
        <div key={x.unidadeId} className="aviso aviso-atencao" style={{ marginBottom: 12, background: 'var(--alerta-fundo)', color: '#6e231d' }}>
          <Icone nome="alerta" tamanho={18} />
          <span>Unidade {x.unidade} {x.motivo === 'unidade_fora_de_operacao' ? 'está fora de operação' : `ainda está com o cliente da locação #${x.locacaoBloqueadora}`}. Realoque antes da retirada.</span>
        </div>
      ))}

      <div className="barra-acoes">
        {l.status === 'pre_reserva' && pode('aprovar_locacao') && <button className="botao" onClick={() => setAcao('aprovar')}>Aprovar locação</button>}
        {l.status === 'confirmada' && pode('registrar_retirada') && <button className="botao" onClick={() => setAcao('retirada')}>Registrar {l.modalidade === 'entrega' ? 'entrega' : 'retirada'}</button>}
        {l.status === 'em_andamento' && pode('registrar_devolucao') && <button className="botao" onClick={() => setAcao('devolucao')}>Registrar devolução</button>}
        {l.saldo > 0 && !['pre_reserva', 'expirada', 'cancelada'].includes(l.status) && pode('registrar_pagamento') &&
          <button className="botao botao-secundario" onClick={() => setAcao('recebimento')}>Registrar recebimento</button>}
        {aberta && l.modalidade === 'entrega' && pode('orcamentos') && <button className="botao botao-secundario" onClick={() => setAcao('frete')}>{l.valorFrete === null ? 'Definir frete' : 'Alterar frete'}</button>}
        {d.conversaId && pode('atender_conversas') && <button className="botao botao-secundario" onClick={() => setAcao('avisar')}><Icone nome="whatsapp" tamanho={16} />Avisar cliente</button>}
        {['pre_reserva', 'confirmada'].includes(l.status) && pode('aprovar_locacao') && <button className="botao botao-perigo" onClick={() => setAcao('cancelar')}>Cancelar</button>}
      </div>

      <div className="grade-2">
        <div className="pilha">
          <Cartao titulo="Equipamentos e valores">
            <ul className="lista">
              {d.itens.map((i) => (
                <li key={i.equipamentoId} className="item">
                  <div className="item-corpo">
                    <div className="item-titulo">{i.quantidade}× {i.equipamento}</div>
                    <div className="item-sub">{i.explicacao}{i.quantidade > 1 && ` · ${brl(i.valorUnitario)} por unidade`}</div>
                  </div>
                  <strong className="num">{brl(i.valorTotal)}</strong>
                </li>
              ))}
            </ul>
            <dl className="chave-valor" style={{ marginTop: 12 }}>
              <dt>Itens</dt><dd className="num">{brl(l.valorItens)}</dd>
              <dt>Frete</dt><dd className="num">{l.modalidade === 'retirada' ? 'Sem entrega' : l.valorFrete === null ? 'A definir pela equipe' : brl(l.valorFrete)}</dd>
              <dt>Total</dt><dd className="num"><strong>{brl(l.valorTotal)}</strong></dd>
              <dt>Recebido</dt><dd className="num">{brl(l.recebido)}</dd>
              <dt>Saldo</dt><dd className="num"><strong style={{ color: l.saldo > 0 ? 'var(--alerta)' : 'var(--ok)' }}>{brl(l.saldo)}</strong></dd>
            </dl>
            {d.regra && (
              <p className="suave pequeno" style={{ marginTop: 10 }}>
                Regra de cobrança usada: <strong>{d.regra.nome}</strong> {d.regra.demonstrativa && <Selo tipo="demo">Demonstrativa</Selo>}
              </p>
            )}
          </Cartao>

          <Cartao titulo="Período e entrega">
            <dl className="chave-valor">
              <dt>{l.modalidade === 'entrega' ? 'Entrega' : 'Retirada'}</dt><dd>{dataHora(l.inicio)}</dd>
              <dt>Devolução</dt><dd>{dataHora(l.fim)}{l.atrasada && <> · <span className="tag tag-atrasada">atrasada {relativo(l.fim).replace('há ', 'há ')}</span></>}</dd>
              <dt>Modalidade</dt><dd>{l.modalidade === 'entrega' ? `Entrega: ${d.enderecoEntrega ?? 'endereço não informado'}` : 'Retirada na loja'}</dd>
              {d.aprovadoEm && <><dt>Aprovada</dt><dd>{dataHora(d.aprovadoEm)}{d.aprovadoPor && ` por ${d.aprovadoPor}`}</dd></>}
              {d.retiradoEm && <><dt>Retirada feita</dt><dd>{dataHora(d.retiradoEm)}</dd></>}
              {d.devolvidoEm && <><dt>Devolvida</dt><dd>{dataHora(d.devolvidoEm)}</dd></>}
              {d.motivoCancelamento && <><dt>Cancelamento</dt><dd>{d.motivoCancelamento}</dd></>}
            </dl>
          </Cartao>

          <Cartao titulo="Unidades">
            {d.unidades.length === 0 ? <Vazio>Nenhuma unidade alocada.</Vazio> : (
              <ul className="lista">
                {d.unidades.map((u) => (
                  <li key={u.unidadeId + String(u.ativo)} className="item">
                    <div className="item-corpo">
                      <div className="item-titulo num">{u.codigo} {!u.ativo && <span className="tag">liberada</span>} {u.condicao === 'manutencao' && <span className="tag tag-sit-manutencao">em manutenção</span>}</div>
                      <div className="item-sub">{u.equipamento}</div>
                    </div>
                    {u.ativo && d.riscos.some((x) => x.unidadeId === u.unidadeId) && pode('aprovar_locacao') && (
                      <RealocarBotao locacaoId={l.id} unidadeId={u.unidadeId} aoTerminar={r.recarregar} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <div className="pilha">
          <Cartao titulo="Vistorias">
            {d.vistorias.length === 0 ? <Vazio>Nenhum checklist registrado.</Vazio> : d.vistorias.map((v) => (
              <div key={v.tipo} style={{ marginBottom: 12 }}>
                <h3>{v.tipo === 'retirada' ? 'Retirada' : 'Devolução'} · <span className="suave" style={{ fontWeight: 400 }}>{dataHora(v.realizadoEm)}{v.realizadoPor && ` · ${v.realizadoPor}`}</span></h3>
                <ul className="checklist-lista">
                  {v.checklist.map((c, n) => (
                    <li key={n} className={c.ok ? 'ok' : 'nao'}>{c.ok ? '✔' : '✖'} {c.item}{c.obs && <span className="suave"> · {c.obs}</span>}</li>
                  ))}
                </ul>
                {v.observacoes && <p className="suave pequeno">{v.observacoes}</p>}
              </div>
            ))}
          </Cartao>

          <Cartao titulo="Recebimentos">
            {d.recebimentos.length === 0 ? <Vazio>Nenhum recebimento registrado.</Vazio> : (
              <ul className="lista">
                {d.recebimentos.map((x) => (
                  <li key={x.id} className="item">
                    <div className="item-corpo">
                      <div className="item-titulo">{FORMAS.find((f) => f[0] === x.forma)?.[1] ?? x.forma}</div>
                      <div className="item-sub">{dataHora(x.recebidoEm)}{x.registradoPor && ` · ${x.registradoPor}`}{x.observacao && ` · ${x.observacao}`}</div>
                    </div>
                    <strong className="num">{brl(x.valor)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <p className="suave pequeno" style={{ marginTop: 8 }}>Registro manual. Não há integração bancária.</p>
          </Cartao>

          <Cartao titulo="Histórico">
            {d.historico.length === 0 ? <Vazio>Sem registros.</Vazio> : (
              <ul className="lista">
                {d.historico.map((h) => (
                  <li key={h.id} className="item">
                    <div className="item-corpo">
                      <div className="item-titulo" style={{ fontSize: '0.9rem' }}>{rotuloAcao[h.acao] ?? h.acao}</div>
                      <div className="item-sub">{h.ator ?? (h.atorTipo === 'bot' ? 'Assistente' : h.atorTipo === 'sistema' ? 'Sistema' : h.atorTipo)}</div>
                    </div>
                    <span className="item-lado suave">{dataHora(h.em)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>

      {acao === 'aprovar' && <FormAprovar d={d} fechar={fechar} feito={feito} />}
      {acao === 'cancelar' && <FormTexto titulo="Cancelar locação" rotulo="Motivo do cancelamento" botao="Cancelar locação" perigo
        fechar={fechar} enviar={(t) => backend.cancelarLocacao(l.id, t)} feito={feito} ok="Locação cancelada. Unidades liberadas." />}
      {acao === 'avisar' && <FormTexto titulo="Avisar cliente pelo WhatsApp" rotulo="Mensagem" botao="Enviar" inicial={`Olá! Aqui é a equipe da ObraLoc sobre a locação #${l.numero}. `}
        dica="Sai como aviso da equipe e não pausa o assistente." fechar={fechar} feito={feito} ok="Aviso na fila de envio."
        enviar={async (t) => { const x = await backend.notificarCliente(l.id, t); if (!x.ok) throw new Error(x.mensagem ?? 'Não foi possível avisar.'); }} />}
      {acao === 'frete' && <FormValor titulo="Frete da entrega" rotulo="Valor do frete (R$)" inicial={l.valorFrete ?? undefined}
        fechar={fechar} feito={feito} ok="Frete definido." enviar={(v) => backend.definirFrete(l.id, v)} />}
      {acao === 'recebimento' && <FormRecebimento d={d} fechar={fechar} feito={feito} />}
      {acao === 'retirada' && <FormChecklist d={d} tipo="retirada" fechar={fechar} feito={feito} />}
      {acao === 'devolucao' && <FormChecklist d={d} tipo="devolucao" fechar={fechar} feito={feito} />}
    </>
  );
}

// ------------------------------------------------------------ formulários
function useEnviar(feito: () => void, ok?: string) {
  const { avisar } = useApp();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Error | null>(null);
  const enviar = async (fn: () => Promise<unknown>, mensagemOk = ok) => {
    setEnviando(true); setErro(null);
    try { await fn(); if (mensagemOk) avisar(mensagemOk); feito(); }
    catch (e) { setErro(e as Error); }
    finally { setEnviando(false); }
  };
  return { enviando, erro, enviar };
}

function Rodape({ fechar, enviando, rotulo, onClick, perigo, desabilitado }: { fechar: () => void; enviando: boolean; rotulo: string; onClick: () => void; perigo?: boolean; desabilitado?: boolean }) {
  return (<>
    <button className="botao botao-secundario" onClick={fechar}>Voltar</button>
    <button className={`botao ${perigo ? 'botao-perigo' : ''}`} disabled={enviando || desabilitado} onClick={onClick}>{enviando ? 'Salvando…' : rotulo}</button>
  </>);
}

function FormAprovar({ d, fechar, feito }: { d: LocacaoDetalhe; fechar: () => void; feito: () => void }) {
  const { backend, avisar } = useApp();
  const l = d.resumo;
  const [avisarCliente, setAvisarCliente] = useState(Boolean(d.conversaId));
  const [texto, setTexto] = useState(
    `Olá! Sua locação #${l.numero} foi confirmada pela equipe da ObraLoc. ` +
    `${l.modalidade === 'entrega' ? 'Entrega' : 'Retirada na loja'}: ${dataHora(l.inicio)}. Devolução: ${dataHora(l.fim)}. ` +
    `Total: ${brl(l.valorTotal)}${l.modalidade === 'entrega' && l.valorFrete === null ? ' + frete (a equipe informa o valor)' : ''}. Qualquer dúvida, é só responder aqui.`);
  const { enviando, erro, enviar } = useEnviar(feito);
  return (
    <Folha titulo={`Aprovar locação #${l.numero}`} aberta fechar={fechar}
      rodape={<Rodape fechar={fechar} enviando={enviando} rotulo="Aprovar" onClick={() => enviar(async () => {
        const r = await backend.aprovarPreReserva(l.id);
        if (!r.ok) { avisar(r.mensagem ?? 'Não foi possível aprovar.', 'erro'); return; }
        if (avisarCliente && d.conversaId) {
          const x = await backend.notificarCliente(l.id, texto);
          avisar(x.ok ? 'Locação aprovada e cliente avisado.' : `Locação aprovada. ${x.mensagem ?? ''}`);
        } else avisar('Locação aprovada.');
      }, undefined)} />}>
      <div className="form">
        <p>A pré-reserva vira locação confirmada, com as mesmas unidades. Confira itens, datas e valores antes.</p>
        <dl className="chave-valor">
          <dt>Cliente</dt><dd>{l.cliente}</dd>
          <dt>Itens</dt><dd>{l.itens}</dd>
          <dt>Período</dt><dd>{dataHora(l.inicio)} → {dataHora(l.fim)}</dd>
          <dt>Total</dt><dd className="num">{brl(l.valorTotal)}{l.modalidade === 'entrega' && l.valorFrete === null && ' + frete a definir'}</dd>
        </dl>
        {d.conversaId ? (
          <>
            <label className="check"><input type="checkbox" checked={avisarCliente} onChange={(e) => setAvisarCliente(e.target.checked)} />Avisar o cliente pelo WhatsApp</label>
            {avisarCliente && <Campo rotulo="Mensagem"><textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} /></Campo>}
          </>
        ) : <p className="suave pequeno">Este cliente não tem conversa de WhatsApp; avise por outro meio.</p>}
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}

function FormTexto({ titulo, rotulo, botao, inicial = '', dica, perigo, fechar, feito, enviar, ok }: {
  titulo: string; rotulo: string; botao: string; inicial?: string; dica?: string; perigo?: boolean;
  fechar: () => void; feito: () => void; enviar: (t: string) => Promise<unknown>; ok: string;
}) {
  const [texto, setTexto] = useState(inicial);
  const e = useEnviar(feito, ok);
  return (
    <Folha titulo={titulo} aberta fechar={fechar}
      rodape={<Rodape fechar={fechar} enviando={e.enviando} rotulo={botao} perigo={perigo} desabilitado={!texto.trim()} onClick={() => e.enviar(() => enviar(texto.trim()))} />}>
      <div className="form">
        <Campo rotulo={rotulo} dica={dica}><textarea value={texto} onChange={(x) => setTexto(x.target.value)} rows={4} /></Campo>
        {e.erro && <ErroCaixa erro={e.erro} />}
      </div>
    </Folha>
  );
}

function lerValor(t: string): number { return Number(t.replace(/\./g, '').replace(',', '.')); }

function FormValor({ titulo, rotulo, inicial, fechar, feito, enviar, ok }: {
  titulo: string; rotulo: string; inicial?: number; fechar: () => void; feito: () => void; enviar: (v: number) => Promise<unknown>; ok: string;
}) {
  const [valor, setValor] = useState(inicial !== undefined ? String(inicial).replace('.', ',') : '');
  const e = useEnviar(feito, ok);
  const v = lerValor(valor);
  return (
    <Folha titulo={titulo} aberta fechar={fechar}
      rodape={<Rodape fechar={fechar} enviando={e.enviando} rotulo="Salvar" desabilitado={!(v >= 0) || valor === ''} onClick={() => e.enviar(() => enviar(v))} />}>
      <div className="form">
        <Campo rotulo={rotulo}><input type="text" inputMode="decimal" value={valor} onChange={(x) => setValor(x.target.value)} placeholder="0,00" /></Campo>
        <p className="suave pequeno">Não existe regra automática de frete: o valor é definido pela equipe e soma ao total.</p>
        {e.erro && <ErroCaixa erro={e.erro} />}
      </div>
    </Folha>
  );
}

function FormRecebimento({ d, fechar, feito }: { d: LocacaoDetalhe; fechar: () => void; feito: () => void }) {
  const { backend } = useApp();
  const [valor, setValor] = useState(String(d.resumo.saldo.toFixed(2)).replace('.', ','));
  const [forma, setForma] = useState<FormaPagamento>('pix');
  const [obs, setObs] = useState('');
  const e = useEnviar(feito, 'Recebimento registrado.');
  const v = lerValor(valor);
  return (
    <Folha titulo="Registrar recebimento" aberta fechar={fechar}
      rodape={<Rodape fechar={fechar} enviando={e.enviando} rotulo="Registrar" desabilitado={!(v > 0)} onClick={() => e.enviar(() => backend.registrarRecebimento(d.resumo.id, v, forma, obs))} />}>
      <div className="form">
        <p className="suave pequeno">Saldo em aberto: <strong>{brl(d.resumo.saldo)}</strong>. Registro manual, sem confirmação bancária.</p>
        <Campo rotulo="Valor recebido (R$)"><input type="text" inputMode="decimal" value={valor} onChange={(x) => setValor(x.target.value)} /></Campo>
        <Campo rotulo="Forma">
          <select value={forma} onChange={(x) => setForma(x.target.value as FormaPagamento)}>{FORMAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
        </Campo>
        <Campo rotulo="Observação"><input type="text" value={obs} onChange={(x) => setObs(x.target.value)} placeholder="Ex.: sinal, quitação, nº do comprovante" /></Campo>
        {e.erro && <ErroCaixa erro={e.erro} />}
      </div>
    </Folha>
  );
}

function FormChecklist({ d, tipo, fechar, feito }: { d: LocacaoDetalhe; tipo: 'retirada' | 'devolucao'; fechar: () => void; feito: () => void }) {
  const { backend, avisar } = useApp();
  const [itens, setItens] = useState<ItemChecklist[]>((tipo === 'retirada' ? CHECK_RETIRADA : CHECK_DEVOLUCAO).map((item) => ({ item, ok: true })));
  const [novo, setNovo] = useState('');
  const [obs, setObs] = useState('');
  const ativas = d.unidades.filter((u) => u.ativo);
  const [manut, setManut] = useState<string[]>([]);
  const e = useEnviar(feito);
  const algumNao = itens.some((i) => !i.ok);
  const mudar = (n: number, x: Partial<ItemChecklist>) => setItens(itens.map((i, j) => (j === n ? { ...i, ...x } : i)));

  const salvar = () => e.enviar(async () => {
    const lista = itens.map((i) => ({ item: i.item, ok: i.ok, ...(i.obs?.trim() ? { obs: i.obs.trim() } : {}) }));
    if (tipo === 'retirada') { await backend.registrarRetirada(d.resumo.id, lista, obs); avisar('Retirada registrada. Locação em andamento.'); }
    else {
      const r = await backend.registrarDevolucao(d.resumo.id, lista, obs, manut);
      avisar(r.atrasada ? `Devolução registrada com ${r.atrasoHoras} h de atraso. Cobrança de atraso: a definir pela equipe.`
        : manut.length ? 'Devolução registrada. Unidade(s) enviada(s) para manutenção.' : 'Devolução registrada. Unidades liberadas.');
    }
  });

  return (
    <Folha titulo={tipo === 'retirada' ? `Checklist de ${d.resumo.modalidade === 'entrega' ? 'entrega' : 'retirada'}` : 'Checklist de devolução'} aberta fechar={fechar}
      rodape={<Rodape fechar={fechar} enviando={e.enviando} rotulo={tipo === 'retirada' ? 'Confirmar retirada' : 'Confirmar devolução'} onClick={salvar} />}>
      <div className="form">
        <p className="suave pequeno">Unidades: {ativas.map((u) => u.codigo).join(', ') || '—'}</p>
        <ul className="checklist-form">
          {itens.map((i, n) => (
            <li key={n}>
              <div className="checklist-linha">
                <span>{i.item}</span>
                <div className="sim-nao" role="group" aria-label={i.item}>
                  <button className={i.ok ? 'ativo' : ''} onClick={() => mudar(n, { ok: true })} aria-pressed={i.ok}>OK</button>
                  <button className={!i.ok ? 'ativo nao' : ''} onClick={() => mudar(n, { ok: false })} aria-pressed={!i.ok}>Problema</button>
                </div>
              </div>
              {!i.ok && <input type="text" placeholder="O que foi encontrado?" value={i.obs ?? ''} onChange={(x) => mudar(n, { obs: x.target.value })} aria-label={`Observação: ${i.item}`} />}
            </li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="Outro item do checklist" value={novo} onChange={(x) => setNovo(x.target.value)} aria-label="Novo item do checklist" />
          <button className="botao botao-secundario" disabled={!novo.trim()} onClick={() => { setItens([...itens, { item: novo.trim(), ok: true }]); setNovo(''); }}>Incluir</button>
        </div>
        {tipo === 'devolucao' && (
          <div className={`pilha ${algumNao ? 'destaque-avaria' : ''}`} style={{ gap: 6 }}>
            <h3>Unidades com avaria</h3>
            <p className="suave pequeno">Marcadas vão para manutenção e saem da disponibilidade. As demais ficam livres na hora.</p>
            {ativas.map((u) => (
              <label key={u.unidadeId} className="check">
                <input type="checkbox" checked={manut.includes(u.unidadeId)}
                  onChange={(x) => setManut(x.target.checked ? [...manut, u.unidadeId] : manut.filter((m) => m !== u.unidadeId))} />
                {u.codigo} · {u.equipamento}
              </label>
            ))}
          </div>
        )}
        <Campo rotulo="Observações gerais"><textarea value={obs} onChange={(x) => setObs(x.target.value)} rows={3} /></Campo>
        {e.erro && <ErroCaixa erro={e.erro} />}
      </div>
    </Folha>
  );
}

function RealocarBotao({ locacaoId, unidadeId, aoTerminar }: { locacaoId: string; unidadeId: string; aoTerminar: () => void }): ReactNode {
  const { backend, avisar } = useApp();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button className="botao botao-secundario botao-pequeno" disabled={ocupado} onClick={async () => {
      setOcupado(true);
      try { await backend.realocarUnidade(locacaoId, unidadeId); avisar('Unidade trocada.'); aoTerminar(); }
      catch (e) { avisar((e as Error).message, 'erro'); }
      finally { setOcupado(false); }
    }}>Trocar unidade</button>
  );
}
