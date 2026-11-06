import { useState } from 'react';
import type { Categoria, CondicaoUnidade, EquipamentoDetalhe, Ocupacao, Preco, Unidade } from '../backend/types';
import { brl, data, dataHora, diaLoja, nomePeriodo, relativo, rotuloStatus } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import {
  Cabecalho, Campo, Carregando, Cartao, ErroCaixa, Folha, Icone, SituacaoTag, Vazio,
} from '../ui/componentes';
import { FotoEquipamento } from './Catalogo';

const DIAS_LINHA = 14;

export function EquipamentoPagina({ id }: { id: string }) {
  const { backend, pode, avisar } = useApp();
  const de = diaLoja(-2, 0);
  const ate = diaLoja(DIAS_LINHA - 2, 0);
  const r = useCarregar<[EquipamentoDetalhe, Ocupacao[], Categoria[]]>(
    () => Promise.all([backend.equipamento(id), backend.ocupacao(id, de, ate), backend.categorias()]), [backend, id]);
  const [editar, setEditar] = useState(false);
  const [precos, setPrecos] = useState(false);
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [unidade, setUnidade] = useState<Unidade | null>(null);

  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <ErroCaixa erro={r.erro} tentar={r.recarregar} />;
  if (!r.dados) return null;
  const [eq, ocupacao, categorias] = r.dados;

  return (
    <>
      <Cabecalho voltar="/catalogo" titulo={eq.nome} subtitulo={eq.categoria}
        acoes={pode('gerenciar_catalogo') && (
          <button className="botao botao-secundario botao-pequeno" onClick={() => setEditar(true)}><Icone nome="editar" tamanho={16} />Editar</button>
        )} />

      <div className="grade-2">
        <div className="pilha">
          <Cartao>
            <div style={{ display: 'flex', gap: 14 }}>
              <FotoEquipamento fotos={eq.fotos} nome={eq.nome} />
              <div className="pilha" style={{ gap: 6 }}>
                <p>{eq.descricao || <span className="suave">Sem descrição.</span>}</p>
                <p className="suave pequeno">{eq.disponivel} de {eq.total} unidades disponíveis agora
                  {eq.alugado > 0 && ` · ${eq.alugado} alugada(s)`}{eq.reservado > 0 && ` · ${eq.reservado} reservada(s)`}
                  {eq.manutencao > 0 && ` · ${eq.manutencao} em manutenção`}</p>
                {!eq.ativo && <span className="tag">Inativo: não aparece para o assistente</span>}
              </div>
            </div>
          </Cartao>

          <Cartao titulo="Tabela de preços (por unidade)"
            acao={pode('gerenciar_catalogo') && <button className="botao botao-secundario botao-pequeno" onClick={() => setPrecos(true)}>Alterar</button>}>
            {eq.precos.length === 0 ? <Vazio>Sem preços. O sistema não orça este equipamento até que haja preço.</Vazio> : (
              <div className="precos">
                {eq.precos.map((p) => (
                  <div className="preco" key={p.dias}><span>{nomePeriodo(p.dias)}</span><strong>{brl(p.valor)}</strong></div>
                ))}
              </div>
            )}
            <p className="suave pequeno" style={{ marginTop: 10 }}>
              O valor de cada orçamento depende da regra de cobrança ativa (veja Ajustes). O orçamento sempre mostra a regra usada.
            </p>
          </Cartao>
        </div>

        <Cartao titulo={`Unidades físicas (${eq.unidades.length})`}
          acao={pode('gerenciar_catalogo') && <button className="botao botao-secundario botao-pequeno" onClick={() => setNovaUnidade(true)}><Icone nome="mais" tamanho={16} />Unidade</button>}>
          {eq.unidades.length === 0 ? <Vazio>Nenhuma unidade cadastrada.</Vazio> : (
            <ul className="lista">
              {eq.unidades.map((u) => (
                <li key={u.id}>
                  <div className="item">
                    <div className="item-corpo">
                      <div className="item-titulo num">{u.codigo} <SituacaoTag situacao={u.situacao} /></div>
                      <div className="item-sub">
                        {u.numeroSerie ? `Série ${u.numeroSerie}` : 'Sem nº de série'}
                        {u.proximaReservaEm && ` · próxima reserva ${relativo(u.proximaReservaEm)}`}
                        {u.observacoes && ` · ${u.observacoes}`}
                      </div>
                    </div>
                    {pode('manutencao') && (
                      <button className="botao botao-secundario botao-pequeno" onClick={() => setUnidade(u)}>Condição</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      <Cartao titulo="Ocupação nos próximos dias" className="" >
        <LinhaDoTempo unidades={eq.unidades} ocupacao={ocupacao} de={de} />
      </Cartao>

      {editar && <FormEquipamento categorias={categorias} equipamento={eq} fechar={() => setEditar(false)}
        salvo={() => { setEditar(false); avisar('Equipamento salvo.'); r.recarregar(); }} />}
      {precos && <FormPrecos equipamentoId={eq.id} precos={eq.precos} fechar={() => setPrecos(false)}
        salvo={() => { setPrecos(false); avisar('Preços atualizados.'); r.recarregar(); }} />}
      {novaUnidade && <FormUnidade equipamentoId={eq.id} sugestao={sugerirCodigo(eq.unidades)} fechar={() => setNovaUnidade(false)}
        salvo={() => { setNovaUnidade(false); avisar('Unidade cadastrada.'); r.recarregar(); }} />}
      {unidade && <FormCondicao unidade={unidade} fechar={() => setUnidade(null)}
        salvo={() => { setUnidade(null); avisar('Condição atualizada.'); r.recarregar(); }} />}
    </>
  );
}

function sugerirCodigo(unidades: Unidade[]): string {
  const ult = unidades.map((u) => u.codigo).sort().pop();
  const m = ult?.match(/^(.*?)(\d+)$/);
  return m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : '';
}

function LinhaDoTempo({ unidades, ocupacao, de }: { unidades: Unidade[]; ocupacao: Ocupacao[]; de: string }) {
  const ini = new Date(de).getTime();
  const total = DIAS_LINHA * 86400_000;
  const pos = (iso: string) => Math.min(Math.max((new Date(iso).getTime() - ini) / total, 0), 1) * 100;
  const dias = Array.from({ length: DIAS_LINHA }, (_, i) => new Date(ini + i * 86400_000 + 12 * 3600_000).toISOString());
  const hoje = data(new Date().toISOString());
  const visiveis = unidades.filter((u) => u.condicao !== 'baixada');
  // muitas unidades (ex.: 40 escoras): mostra só as que têm ocupação, para caber na tela
  const lista = visiveis.length > 12 ? visiveis.filter((u) => ocupacao.some((o) => o.unidadeId === u.id)) : visiveis;

  return (
    <div className="tabela-wrap">
      <div className="tempo" style={{ minWidth: 640, ['--dias' as string]: DIAS_LINHA }}>
        <div className="tempo-cabecalho">
          <span />
          <div className="tempo-dias">{dias.map((d) => <span key={d} className={data(d) === hoje ? 'hoje' : ''}>{data(d)}</span>)}</div>
        </div>
        {lista.length === 0 && <Vazio>Nenhuma unidade ocupada nesse intervalo.</Vazio>}
        {lista.map((u) => (
          <div className="tempo-linha" key={u.id}>
            <span className="tempo-unidade">{u.codigo}</span>
            <div className="tempo-faixa">
              {ocupacao.filter((o) => o.unidadeId === u.id).map((o, i) => {
                const classe = o.tipo === 'manutencao' ? 't-manutencao' : o.atrasada ? 't-atrasada' : `t-${o.status}`;
                const rotulo = o.tipo === 'manutencao' ? `Manutenção${o.motivo ? `: ${o.motivo}` : ''}`
                  : `#${o.numero} ${o.cliente ?? ''}${o.atrasada ? ' (atrasada)' : ''}`;
                const esq = pos(o.inicio);
                return (
                  <span key={i} className={`tempo-bloco ${classe}`} style={{ left: `${esq}%`, width: `${Math.max(pos(o.fim) - esq, 1.2)}%` }}
                    title={`${rotulo} · ${o.status ? rotuloStatus[o.status] + ' · ' : ''}${dataHora(o.inicio)} → ${dataHora(o.fim)}`}>
                    {rotulo}
                  </span>
                );
              })}
              <span className="tempo-agora" style={{ left: `${pos(new Date().toISOString())}%` }} />
            </div>
          </div>
        ))}
        <div className="legenda">
          <span><i style={{ background: '#c89a2e' }} />Pré-reserva</span>
          <span><i style={{ background: '#4f83c4' }} />Confirmada</span>
          <span><i style={{ background: '#7d5fb8' }} />Em andamento</span>
          <span><i style={{ background: '#b9443a' }} />Atrasada (bloqueio estendido)</span>
          <span><i style={{ background: '#9a8a6a' }} />Manutenção</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ formulários
function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Error | null>(null);
  const enviar = async (fn: () => Promise<void>) => {
    setEnviando(true); setErro(null);
    try { await fn(); } catch (e) { setErro(e as Error); } finally { setEnviando(false); }
  };
  return { enviando, erro, enviar };
}

export function FormEquipamento({ categorias, equipamento, fechar, salvo }: {
  categorias: Categoria[]; equipamento?: EquipamentoDetalhe; fechar: () => void; salvo: (id: string) => void;
}) {
  const { backend } = useApp();
  const [f, setF] = useState({
    categoriaId: equipamento?.categoriaId ?? categorias[0]?.id ?? '',
    nome: equipamento?.nome ?? '', descricao: equipamento?.descricao ?? '',
    palavrasChave: equipamento?.palavrasChave ?? '', foto: equipamento?.fotos[0] ?? '', ativo: equipamento?.ativo ?? true,
  });
  const { enviando, erro, enviar } = useEnvio();
  const salvar = () => enviar(async () => {
    const id = await backend.salvarEquipamento({
      id: equipamento?.id, categoriaId: f.categoriaId, nome: f.nome, descricao: f.descricao,
      palavrasChave: f.palavrasChave, fotos: f.foto ? [f.foto] : [], ativo: f.ativo,
    });
    salvo(id);
  });
  return (
    <Folha titulo={equipamento ? 'Editar equipamento' : 'Novo equipamento'} aberta fechar={fechar}
      rodape={<><button className="botao botao-secundario" onClick={fechar}>Cancelar</button>
        <button className="botao" disabled={enviando} onClick={salvar}>{enviando ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="form">
        <Campo rotulo="Nome"><input type="text" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="Categoria">
          <select value={f.categoriaId} onChange={(e) => setF({ ...f, categoriaId: e.target.value })}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Descrição"><textarea value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        <Campo rotulo="Palavras para a busca" dica="Ajuda o assistente a reconhecer o pedido. Ex.: martelete, rompedor, britadeira">
          <input type="text" value={f.palavrasChave} onChange={(e) => setF({ ...f, palavrasChave: e.target.value })} />
        </Campo>
        <Campo rotulo="Foto (endereço da imagem)" dica="O envio de arquivos de foto entra com o Supabase Storage.">
          <input type="text" inputMode="url" value={f.foto} placeholder="https://…" onChange={(e) => setF({ ...f, foto: e.target.value })} />
        </Campo>
        <label className="check"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />Ativo no catálogo</label>
        {!equipamento && <p className="suave pequeno">Depois de salvar, cadastre a tabela de preços e as unidades físicas.</p>}
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}

function FormPrecos({ equipamentoId, precos, fechar, salvo }: { equipamentoId: string; precos: Preco[]; fechar: () => void; salvo: () => void }) {
  const { backend } = useApp();
  const [linhas, setLinhas] = useState(() => (precos.length ? precos : [{ dias: 1, valor: 0 }]).map((p) => ({ dias: String(p.dias), valor: String(p.valor) })));
  const { enviando, erro, enviar } = useEnvio();
  const salvar = () => enviar(async () => {
    await backend.salvarPrecos(equipamentoId, linhas.map((l) => ({ dias: Number(l.dias), valor: Number(l.valor.replace(',', '.')) })));
    salvo();
  });
  return (
    <Folha titulo="Tabela de preços" aberta fechar={fechar}
      rodape={<><button className="botao botao-secundario" onClick={fechar}>Cancelar</button>
        <button className="botao" disabled={enviando} onClick={salvar}>{enviando ? 'Salvando…' : 'Salvar preços'}</button></>}>
      <div className="form">
        <p className="suave pequeno">Valor por unidade para cada período. Ex.: 1 dia (diária), 7 (semana), 15 (quinzena), 30 (mês).</p>
        {linhas.map((l, i) => (
          <div className="linha-preco" key={i}>
            <Campo rotulo="Dias"><input type="number" min={1} max={365} value={l.dias}
              onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, dias: e.target.value } : x)))} /></Campo>
            <Campo rotulo="Valor (R$)"><input type="text" inputMode="decimal" value={l.valor}
              onChange={(e) => setLinhas(linhas.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)))} /></Campo>
            <button className="botao-icone" aria-label="Remover" onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}><Icone nome="fechar" /></button>
          </div>
        ))}
        <button className="botao botao-secundario botao-pequeno" onClick={() => setLinhas([...linhas, { dias: '', valor: '' }])}>
          <Icone nome="mais" tamanho={16} />Período
        </button>
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}

function FormUnidade({ equipamentoId, sugestao, fechar, salvo }: { equipamentoId: string; sugestao: string; fechar: () => void; salvo: () => void }) {
  const { backend } = useApp();
  const [codigo, setCodigo] = useState(sugestao);
  const [serie, setSerie] = useState('');
  const { enviando, erro, enviar } = useEnvio();
  return (
    <Folha titulo="Nova unidade física" aberta fechar={fechar}
      rodape={<><button className="botao botao-secundario" onClick={fechar}>Cancelar</button>
        <button className="botao" disabled={enviando} onClick={() => enviar(async () => { await backend.adicionarUnidade(equipamentoId, codigo, serie); salvo(); })}>
          {enviando ? 'Salvando…' : 'Cadastrar'}</button></>}>
      <div className="form">
        <Campo rotulo="Código de patrimônio" dica="Único no sistema. Ex.: BET-003"><input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} /></Campo>
        <Campo rotulo="Número de série (opcional)"><input type="text" value={serie} onChange={(e) => setSerie(e.target.value)} /></Campo>
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}

function FormCondicao({ unidade, fechar, salvo }: { unidade: Unidade; fechar: () => void; salvo: () => void }) {
  const { backend } = useApp();
  const [condicao, setCondicao] = useState<CondicaoUnidade>(unidade.condicao);
  const [obs, setObs] = useState('');
  const { enviando, erro, enviar } = useEnvio();
  return (
    <Folha titulo={`Condição da unidade ${unidade.codigo}`} aberta fechar={fechar}
      rodape={<><button className="botao botao-secundario" onClick={fechar}>Cancelar</button>
        <button className="botao" disabled={enviando} onClick={() => enviar(async () => { await backend.alterarCondicaoUnidade(unidade.id, condicao, obs); salvo(); })}>
          {enviando ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="form">
        <Campo rotulo="Condição">
          <select value={condicao} onChange={(e) => setCondicao(e.target.value as CondicaoUnidade)}>
            <option value="ativa">Ativa (pode ser alugada)</option>
            <option value="manutencao">Em manutenção (fora da disponibilidade)</option>
            <option value="baixada">Baixada (não volta à operação)</option>
          </select>
        </Campo>
        <Campo rotulo="Observação"><input type="text" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: troca de escovas do motor" /></Campo>
        {condicao !== 'ativa' && unidade.proximaReservaEm && (
          <div className="aviso aviso-atencao"><Icone nome="alerta" tamanho={18} />
            Esta unidade tem reserva {relativo(unidade.proximaReservaEm)}. A reserva vai aparecer como "em risco" até ser realocada.</div>
        )}
        <p className="suave pequeno">A alteração fica registrada no histórico com o seu nome.</p>
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}
