import { useEffect, useState } from 'react';
import type { Configuracoes, EntradaHistorico, RegraCobranca } from '../backend/types';
import { dataHora, rotuloAcao } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Campo, Carregando, Cartao, ErroCaixa, Icone, Selo } from '../ui/componentes';

const PERMISSOES: [string, string][] = [
  ['atender_conversas', 'Atender conversas'],
  ['gerenciar_clientes', 'Clientes'],
  ['orcamentos', 'Orçamentos'],
  ['aprovar_locacao', 'Aprovar locação'],
  ['registrar_retirada', 'Registrar retirada'],
  ['registrar_devolucao', 'Registrar devolução'],
  ['manutencao', 'Manutenção'],
  ['registrar_pagamento', 'Registrar pagamento'],
  ['gerenciar_catalogo', 'Catálogo e preços'],
  ['gerenciar_configuracoes', 'Configurações'],
  ['gerenciar_equipe', 'Equipe'],
];
const ATENDENTE = ['atender_conversas', 'gerenciar_clientes', 'orcamentos', 'aprovar_locacao', 'registrar_retirada', 'registrar_devolucao', 'manutencao'];

export function ConfiguracoesPagina() {
  const { backend, sessao, pode, sair, avisar } = useApp();
  const r = useCarregar<[Configuracoes, RegraCobranca[]]>(() => Promise.all([backend.configuracoes(), backend.regrasCobranca()]), [backend]);
  const h = useCarregar<EntradaHistorico[]>(() => backend.historico(30), [backend]);
  const [cfg, setCfg] = useState<Configuracoes | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<Error | null>(null);
  useEffect(() => { if (r.dados) setCfg(r.dados[0]); }, [r.dados]);
  const admin = pode('gerenciar_configuracoes');

  const salvar = async () => {
    if (!cfg) return;
    setSalvando(true); setErro(null);
    try { await backend.salvarConfiguracoes(cfg); avisar('Configurações salvas.'); r.recarregar(); h.recarregar(); }
    catch (e) { setErro(e as Error); }
    finally { setSalvando(false); }
  };

  const regraAtual = r.dados?.[1].find((x) => x.id === cfg?.regraCobrancaId);

  return (
    <>
      <Cabecalho titulo="Ajustes" subtitulo={`${sessao.nome} · ${sessao.papel === 'admin' ? 'Administrador' : 'Atendente'}`}
        acoes={<button className="botao botao-secundario botao-pequeno" onClick={sair}><Icone nome="sair" tamanho={16} />Sair</button>} />

      <div className="grade-2">
        <div className="pilha">
          <Cartao titulo="Regra de cobrança">
            {r.carregando && !r.dados && <Carregando />}
            {r.erro && <ErroCaixa erro={r.erro} tentar={r.recarregar} />}
            {cfg && r.dados && (
              <div className="form">
                <div className="aviso aviso-atencao">
                  <Icone nome="alerta" tamanho={18} />
                  <span>As regras abaixo são <strong>demonstrativas</strong>. A regra definitiva ainda precisa ser definida pelos proprietários.</span>
                </div>
                {r.dados[1].map((regra) => (
                  <label key={regra.id} className="cartao" style={{ padding: 12, boxShadow: 'none', cursor: admin ? 'pointer' : 'default',
                    borderColor: cfg.regraCobrancaId === regra.id ? 'var(--verde-2)' : undefined }}>
                    <div className="check" style={{ alignItems: 'flex-start' }}>
                      <input type="radio" name="regra" disabled={!admin} checked={cfg.regraCobrancaId === regra.id}
                        onChange={() => setCfg({ ...cfg, regraCobrancaId: regra.id })} />
                      <div>
                        <strong>{regra.nome}</strong> {regra.demonstrativa && <Selo tipo="demo">Demonstrativa</Selo>}
                        <p className="suave pequeno" style={{ marginTop: 4 }}>{regra.descricao}</p>
                      </div>
                    </div>
                  </label>
                ))}
                {!regraAtual && <div className="aviso aviso-atencao"><Icone nome="alerta" tamanho={18} />Sem regra ativa: o sistema não calcula orçamentos.</div>}
                <div className="form-linha">
                  <Campo rotulo="Prazo da pré-reserva (min)" dica="Tempo que a unidade fica segura aguardando aprovação.">
                    <input type="number" min={5} disabled={!admin} value={cfg.preReservaMinutos} onChange={(e) => setCfg({ ...cfg, preReservaMinutos: Number(e.target.value) })} />
                  </Campo>
                  <Campo rotulo="Validade do orçamento (h)">
                    <input type="number" min={1} disabled={!admin} value={cfg.orcamentoValidadeHoras} onChange={(e) => setCfg({ ...cfg, orcamentoValidadeHoras: Number(e.target.value) })} />
                  </Campo>
                </div>
                <div className="form-linha">
                  <Campo rotulo="Bloqueio por atraso (h)" dica="Equipamento atrasado segue bloqueado até agora + este tempo.">
                    <input type="number" min={0} disabled={!admin} value={cfg.atrasoBloqueioHoras} onChange={(e) => setCfg({ ...cfg, atrasoBloqueioHoras: Number(e.target.value) })} />
                  </Campo>
                  <Campo rotulo="Período máximo (dias)">
                    <input type="number" min={1} disabled={!admin} value={cfg.periodoMaximoDias} onChange={(e) => setCfg({ ...cfg, periodoMaximoDias: Number(e.target.value) })} />
                  </Campo>
                </div>
                {admin
                  ? <button className="botao" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar configurações'}</button>
                  : <p className="suave pequeno">Somente o administrador altera estas configurações.</p>}
                {erro && <ErroCaixa erro={erro} />}
              </div>
            )}
          </Cartao>

          <Cartao titulo="Permissões por papel">
            <div className="tabela-wrap">
              <table>
                <thead><tr><th>Ação</th><th className="direita">Admin</th><th className="direita">Atendente</th></tr></thead>
                <tbody>
                  {PERMISSOES.map(([k, rotulo]) => (
                    <tr key={k}><td>{rotulo}</td><td className="direita">✔</td><td className="direita">{ATENDENTE.includes(k) ? '✔' : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="suave pequeno" style={{ marginTop: 8 }}>Padrão provisório, a confirmar com os proprietários. As permissões são verificadas no banco, não só na tela.</p>
          </Cartao>
        </div>

        <div className="pilha">
          <Cartao titulo="O que é real e o que é simulado">
            <ul className="lista">
              <li className="item"><Selo tipo="ficticio" /><span className="pequeno">Clientes, preços, unidades e locações são inventados.</span></li>
              <li className="item"><Selo tipo="simulado" /><span className="pequeno">Login sem senha, WhatsApp (próximas etapas) e banco local no navegador.</span></li>
              <li className="item"><Selo tipo="real" /><span className="pequeno">Nenhuma integração real ligada. Este selo vai aparecer quando houver uma.</span></li>
            </ul>
            <p className="suave pequeno" style={{ marginTop: 8 }}>{backend.ambiente.descricao}</p>
            {backend.reiniciarDemo && (
              <button className="botao botao-perigo botao-pequeno" style={{ marginTop: 12 }} onClick={async () => {
                if (!confirm('Apagar as alterações feitas neste navegador e voltar aos dados fictícios iniciais?')) return;
                await backend.reiniciarDemo!();
                window.location.reload();
              }}>Reiniciar dados da demonstração</button>
            )}
          </Cartao>

          <Cartao titulo="Histórico recente">
            {h.carregando && !h.dados && <Carregando />}
            {h.erro && <ErroCaixa erro={h.erro} tentar={h.recarregar} />}
            {h.dados && h.dados.length === 0 && <p className="vazio">Nenhuma ação registrada ainda.</p>}
            {h.dados && h.dados.length > 0 && (
              <ul className="lista">
                {h.dados.map((x) => (
                  <li key={x.id} className="item">
                    <div className="item-corpo">
                      <div className="item-titulo" style={{ fontSize: '0.9rem' }}>{rotuloAcao[x.acao] ?? x.acao}</div>
                      <div className="item-sub">
                        {x.ator ?? (x.atorTipo === 'bot' ? 'Assistente' : x.atorTipo === 'sistema' ? 'Sistema' : x.atorTipo)}
                        {typeof x.dados.numero === 'number' && ` · #${x.dados.numero}`}
                      </div>
                    </div>
                    <span className="item-lado suave">{dataHora(x.em)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
