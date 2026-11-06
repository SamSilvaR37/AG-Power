import { useState } from 'react';
import type { ClienteDetalhe, Contato } from '../backend/types';
import { brl, data, rotuloOrigem, telefone } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Campo, Carregando, Cartao, ErroCaixa, Folha, Icone, StatusLocacaoTag, Vazio } from '../ui/componentes';

export function ClientePagina({ id }: { id: string }) {
  const { backend, pode, avisar } = useApp();
  const r = useCarregar<ClienteDetalhe>(() => backend.cliente(id), [backend, id]);
  const [editar, setEditar] = useState(false);

  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <ErroCaixa erro={r.erro} tentar={r.recarregar} />;
  if (!r.dados) return null;
  const c = r.dados;
  const saldo = c.locacoes.filter((l) => ['confirmada', 'em_andamento', 'devolvida'].includes(l.status)).reduce((s, l) => s + l.saldo, 0);

  return (
    <>
      <Cabecalho voltar="/clientes" titulo={c.nome}
        subtitulo={`${c.tipo === 'pj' ? 'Empresa' : 'Pessoa física'} · origem: ${rotuloOrigem[c.origem] ?? c.origem}`}
        acoes={pode('gerenciar_clientes') && (
          <button className="botao botao-secundario botao-pequeno" onClick={() => setEditar(true)}><Icone nome="editar" tamanho={16} />Editar</button>
        )} />

      {c.cadastroIncompleto && (
        <div className="aviso aviso-atencao" style={{ marginBottom: 14 }}>
          <Icone nome="alerta" tamanho={18} />
          <span>Cadastro criado automaticamente pelo WhatsApp. Confira os dados e salve para marcar como conferido.</span>
        </div>
      )}

      <div className="grade-2">
        <div className="pilha">
          <Cartao titulo="Dados">
            <dl className="chave-valor">
              <dt>{c.tipo === 'pj' ? 'CNPJ' : 'CPF'}</dt><dd>{c.documento ?? '—'}</dd>
              <dt>E-mail</dt><dd>{c.email ?? '—'}</dd>
              <dt>Endereço</dt><dd>{c.endereco ?? '—'}</dd>
              {c.observacoes && <><dt>Observações</dt><dd>{c.observacoes}</dd></>}
              <dt>A receber</dt><dd className="num"><strong>{brl(saldo)}</strong></dd>
            </dl>
          </Cartao>
          <Cartao titulo="Contatos">
            {c.contatos.length === 0 ? <Vazio>Nenhum contato.</Vazio> : (
              <ul className="lista">
                {c.contatos.map((k) => (
                  <li key={k.id}>
                    <div className="item">
                      <div className="item-corpo">
                        <div className="item-titulo">{k.nome}{k.funcao && <span className="suave" style={{ fontWeight: 400 }}>· {k.funcao}</span>}</div>
                        <div className="item-sub num">{telefone(k.telefone)}</div>
                      </div>
                      {k.whatsapp && <span className="tag tag-sit-disponivel"><Icone nome="whatsapp" tamanho={12} />&nbsp;WhatsApp</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <Cartao titulo={`Locações (${c.locacoes.length})`}>
          {c.locacoes.length === 0 ? <Vazio>Nenhuma locação.</Vazio> : (
            <ul className="lista">
              {c.locacoes.map((l) => (
                <li key={l.id}>
                  <div className="item">
                    <div className="item-corpo">
                      <div className="item-titulo">#{l.numero} <StatusLocacaoTag status={l.status} atrasada={l.atrasada} /></div>
                      <div className="item-sub">{l.itens} · {data(l.inicio)} → {data(l.fim)}</div>
                    </div>
                    <div className="item-lado">
                      <strong className="num">{brl(l.valorTotal)}</strong>
                      {l.saldo > 0 && !['pre_reserva', 'expirada', 'cancelada'].includes(l.status) && <span className="suave num">falta {brl(l.saldo)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {editar && <FormCliente cliente={c} fechar={() => setEditar(false)} salvo={() => { setEditar(false); avisar('Cliente salvo.'); r.recarregar(); }} />}
    </>
  );
}

export function FormCliente({ cliente, fechar, salvo }: { cliente?: ClienteDetalhe; fechar: () => void; salvo: (id: string) => void }) {
  const { backend } = useApp();
  const [f, setF] = useState({
    nome: cliente?.nome ?? '', tipo: cliente?.tipo ?? ('pf' as 'pf' | 'pj'), documento: cliente?.documento ?? '',
    email: cliente?.email ?? '', endereco: cliente?.endereco ?? '', observacoes: cliente?.observacoes ?? '',
  });
  const [contatos, setContatos] = useState<Contato[]>(
    cliente?.contatos.map((k) => ({ ...k, telefone: telefone(k.telefone) })) ?? [{ nome: '', telefone: '', whatsapp: true, funcao: null }]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<Error | null>(null);

  const salvar = async () => {
    setEnviando(true); setErro(null);
    try { salvo(await backend.salvarCliente({ id: cliente?.id, ...f, contatos })); }
    catch (e) { setErro(e as Error); }
    finally { setEnviando(false); }
  };
  const mudarContato = (i: number, k: Partial<Contato>) => setContatos(contatos.map((x, j) => (j === i ? { ...x, ...k } : x)));

  return (
    <Folha titulo={cliente ? 'Editar cliente' : 'Novo cliente'} aberta fechar={fechar}
      rodape={<><button className="botao botao-secundario" onClick={fechar}>Cancelar</button>
        <button className="botao" disabled={enviando} onClick={salvar}>{enviando ? 'Salvando…' : 'Salvar'}</button></>}>
      <div className="form">
        <div className="filtros" style={{ margin: 0 }}>
          <button className={`filtro ${f.tipo === 'pf' ? 'ativo' : ''}`} onClick={() => setF({ ...f, tipo: 'pf' })}>Pessoa física</button>
          <button className={`filtro ${f.tipo === 'pj' ? 'ativo' : ''}`} onClick={() => setF({ ...f, tipo: 'pj' })}>Empresa</button>
        </div>
        <Campo rotulo={f.tipo === 'pj' ? 'Razão social / nome' : 'Nome completo'}>
          <input type="text" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <Campo rotulo={f.tipo === 'pj' ? 'CNPJ' : 'CPF'}><input type="text" inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></Campo>
        <Campo rotulo="E-mail"><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Endereço"><input type="text" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></Campo>
        <Campo rotulo="Observações"><textarea value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>

        <h3 style={{ marginTop: 6 }}>Contatos</h3>
        {contatos.map((k, i) => (
          <div key={k.id ?? `novo-${i}`} className="cartao" style={{ padding: 12, boxShadow: 'none' }}>
            <div className="form" style={{ gap: 10 }}>
              <div className="form-linha">
                <Campo rotulo="Nome"><input type="text" value={k.nome} onChange={(e) => mudarContato(i, { nome: e.target.value })} /></Campo>
                <Campo rotulo="Função"><input type="text" value={k.funcao ?? ''} placeholder="Ex.: compras" onChange={(e) => mudarContato(i, { funcao: e.target.value })} /></Campo>
              </div>
              <Campo rotulo="Telefone com DDD"><input type="tel" value={k.telefone} placeholder="(11) 98765-4321" onChange={(e) => mudarContato(i, { telefone: e.target.value })} /></Campo>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="check"><input type="checkbox" checked={k.whatsapp} onChange={(e) => mudarContato(i, { whatsapp: e.target.checked })} />Usa WhatsApp</label>
                <button className="botao botao-perigo botao-pequeno" onClick={() => setContatos(contatos.filter((_, j) => j !== i))}>Remover</button>
              </div>
            </div>
          </div>
        ))}
        <button className="botao botao-secundario botao-pequeno" onClick={() => setContatos([...contatos, { nome: '', telefone: '', whatsapp: true, funcao: null }])}>
          <Icone nome="mais" tamanho={16} />Contato
        </button>
        <p className="suave pequeno">O telefone identifica o cliente quando ele escreve no WhatsApp. Cada telefone só pode pertencer a um contato.</p>
        {erro && <ErroCaixa erro={erro} />}
      </div>
    </Folha>
  );
}
