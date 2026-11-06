import type { Painel } from '../backend/types';
import { brl, dataHora, relativo } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Carregando, Cartao, ErroCaixa, Icone, Numero, Selo, Vazio } from '../ui/componentes';
import { BarraDisponibilidade, LegendaDisponibilidade } from './Disponibilidade';

export function PainelPagina() {
  const { backend, sessao } = useApp();
  const p = useCarregar<Painel>(() => backend.painel(), [backend]);

  return (
    <>
      <Cabecalho titulo={`Olá, ${sessao.nome.split(' ')[0]}`} subtitulo="Resumo da operação agora"
        acoes={<button className="botao botao-secundario botao-pequeno" onClick={p.recarregar}>Atualizar</button>} />
      {p.carregando && !p.dados && <Carregando />}
      {p.erro && <ErroCaixa erro={p.erro} tentar={p.recarregar} />}
      {p.dados && <Conteudo p={p.dados} />}
    </>
  );
}

function Conteudo({ p }: { p: Painel }) {
  return (
    <>
      <div className="numeros">
        <Numero valor={p.locacoes_ativas} rotulo="Locações ativas" href="#/locacoes/em_andamento" />
        <Numero valor={p.atrasadas.length} rotulo="Atrasadas" tom={p.atrasadas.length ? 'alerta' : 'ok'} href="#/locacoes/em_andamento" />
        <Numero valor={p.devolucoes_proximas.length} rotulo="Devoluções em 48 h" href="#/locacoes/em_andamento" />
        <Numero valor={p.pre_reservas.length} rotulo="Aguardando aprovação" tom={p.pre_reservas.length ? 'atencao' : undefined} href="#/locacoes/pre_reserva" />
        <Numero valor={brl(p.a_receber.total)} rotulo={`A receber (${p.a_receber.locacoes})`} />
        <Numero valor={p.conversas_aguardando} rotulo="Conversas p/ equipe" tom={p.conversas_aguardando ? 'atencao' : undefined} href="#/atendimento" />
      </div>

      <div className="grade-2">
        <div className="pilha">
          {(p.atrasadas.length > 0 || p.em_risco.length > 0) && (
            <Cartao titulo={<><Icone nome="alerta" tamanho={18} />Atenção</>}>
              <ul className="lista">
                {p.atrasadas.map((a) => (
                  <li key={a.locacao_id}>
                    <a className="item" href={`#/locacao/${a.locacao_id}`}>
                      <div className="item-corpo">
                        <div className="item-titulo">#{a.numero} · {a.cliente} <span className="tag tag-atrasada">Atrasada</span></div>
                        <div className="item-sub">{a.itens} — devolução era {dataHora(a.fim!)} ({a.horas_atraso} h de atraso)</div>
                      </div>
                    </a>
                  </li>
                ))}
                {p.em_risco.map((r) => (
                  <li key={r.locacao_id + r.unidade}>
                    <a className="item" href={`#/locacao/${r.locacao_id}`}>
                      <div className="item-corpo">
                        <div className="item-titulo">#{r.numero} em risco <span className="tag tag-pre_reserva">Reserva</span></div>
                        <div className="item-sub">
                          Começa {dataHora(r.inicio)}. A unidade {r.unidade}{' '}
                          {r.motivo === 'unidade_fora_de_operacao'
                            ? 'está fora de operação.'
                            : `ainda está com o cliente da locação #${r.locacao_bloqueadora}.`}
                        </div>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Pré-reservas aguardando aprovação">
            {p.pre_reservas.length === 0 ? <Vazio>Nenhuma pré-reserva pendente.</Vazio> : (
              <ul className="lista">
                {p.pre_reservas.map((r) => (
                  <li key={r.locacao_id}>
                    <a className="item" href={`#/locacao/${r.locacao_id}`}>
                      <div className="item-corpo">
                        <div className="item-titulo">
                          #{r.numero} · {r.cliente}
                          {r.origem === 'bot' && <span className="tag"><Icone nome="whatsapp" tamanho={12} />&nbsp;WhatsApp</span>}
                        </div>
                        <div className="item-sub">{r.itens} · {dataHora(r.inicio!)} → {dataHora(r.fim!)}</div>
                      </div>
                      <div className="item-lado">
                        <strong className="num">{brl(r.valor_total)}</strong>
                        <span className="suave">expira {relativo(r.expira_em!)}</span>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            
          </Cartao>

          <Cartao titulo="Próximas 48 horas">
            {p.retiradas_proximas.length + p.devolucoes_proximas.length === 0 ? <Vazio>Nada programado.</Vazio> : (
              <ul className="lista">
                {p.retiradas_proximas.map((r) => (
                  <li key={'r' + r.locacao_id}>
                    <a className="item" href={`#/locacao/${r.locacao_id}`}>
                      <div className="item-corpo">
                        <div className="item-titulo">{r.modalidade === 'entrega' ? 'Entrega' : 'Retirada'} · #{r.numero} · {r.cliente}</div>
                        <div className="item-sub">{r.itens}</div>
                      </div>
                      <div className="item-lado"><strong>{dataHora(r.inicio!)}</strong><span className="suave">{relativo(r.inicio!)}</span></div>
                    </a>
                  </li>
                ))}
                {p.devolucoes_proximas.map((r) => (
                  <li key={'d' + r.locacao_id}>
                    <a className="item" href={`#/locacao/${r.locacao_id}`}>
                      <div className="item-corpo">
                        <div className="item-titulo">Devolução · #{r.numero} · {r.cliente}</div>
                        <div className="item-sub">{r.itens}</div>
                      </div>
                      <div className="item-lado"><strong>{dataHora(r.fim!)}</strong><span className="suave">{relativo(r.fim!)}</span></div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <Cartao titulo="Disponibilidade agora" acao={<a className="pequeno" href="#/disponibilidade">Por período →</a>}>
          <ul className="lista">
            {p.disponibilidade_agora.map((d) => (
              <li key={d.equipamento_id}>
                <a className="item" href={`#/catalogo/${d.equipamento_id}`}>
                  <div className="item-corpo">
                    <div className="item-titulo" style={{ fontSize: '0.9rem' }}>{d.equipamento}</div>
                    <BarraDisponibilidade {...d} />
                  </div>
                  <div className="item-lado"><strong className="num">{d.disponivel}/{d.total}</strong><span className="suave">livres</span></div>
                </a>
              </li>
            ))}
          </ul>
          <LegendaDisponibilidade />
          {p.a_receber.frete_a_definir > 0 && (
            <div className="aviso aviso-info" style={{ marginTop: 12 }}>
              <Icone nome="alerta" tamanho={18} />
              <span>{p.a_receber.frete_a_definir} locação(ões) com entrega ainda sem valor de frete definido.</span>
            </div>
          )}
        </Cartao>
      </div>
      <p className="suave pequeno" style={{ marginTop: 16 }}>
        <Selo tipo="ficticio" /> Valores e clientes de demonstração. Atualizado {relativo(p.gerado_em)}.
      </p>
    </>
  );
}
