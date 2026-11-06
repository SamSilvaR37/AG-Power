import { useEffect, useState } from 'react';
import type { ClienteResumo } from '../backend/types';
import { brl, rotuloOrigem, telefone } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { navegar } from '../lib/router';
import { Cabecalho, Carregando, Cartao, ErroCaixa, Icone, Vazio } from '../ui/componentes';
import { FormCliente } from './Cliente';

export function ClientesPagina() {
  const { backend, pode } = useApp();
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [novo, setNovo] = useState(false);
  useEffect(() => { const t = setTimeout(() => setTermo(busca), 200); return () => clearTimeout(t); }, [busca]);
  const r = useCarregar<ClienteResumo[]>(() => backend.clientes(termo), [backend, termo]);

  return (
    <>
      <Cabecalho titulo="Clientes" subtitulo="Cadastro e contatos"
        acoes={pode('gerenciar_clientes') && (
          <button className="botao botao-pequeno" onClick={() => setNovo(true)}><Icone nome="mais" tamanho={18} />Cliente</button>
        )} />
      <div className="busca" style={{ marginBottom: 12 }}>
        <Icone nome="busca" tamanho={18} />
        <input type="search" placeholder="Nome, documento, contato ou telefone" value={busca}
          onChange={(e) => setBusca(e.target.value)} aria-label="Buscar cliente" />
      </div>
      <Cartao>
        {r.carregando && !r.dados && <Carregando />}
        {r.erro && <ErroCaixa erro={r.erro} tentar={r.recarregar} />}
        {r.dados && r.dados.length === 0 && <Vazio>Nenhum cliente encontrado.</Vazio>}
        {r.dados && r.dados.length > 0 && (
          <ul className="lista">
            {r.dados.map((c) => (
              <li key={c.id}>
                <a className="item" href={`#/clientes/${c.id}`}>
                  <span className="avatar">{c.nome[0]}</span>
                  <div className="item-corpo">
                    <div className="item-titulo">
                      {c.nome}
                      {c.cadastroIncompleto && <span className="tag tag-pre_reserva">Conferir cadastro</span>}
                    </div>
                    <div className="item-sub">
                      {c.tipo === 'pj' ? 'Empresa' : 'Pessoa física'} · {telefone(c.telefonePrincipal)} · {rotuloOrigem[c.origem] ?? c.origem}
                    </div>
                  </div>
                  <div className="item-lado">
                    {c.locacoesAtivas > 0 && <strong>{c.locacoesAtivas} ativa(s)</strong>}
                    {c.saldo > 0 && <span className="suave num">{brl(c.saldo)} a receber</span>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      {novo && <FormCliente fechar={() => setNovo(false)} salvo={(id) => { setNovo(false); navegar(`/clientes/${id}`); }} />}
    </>
  );
}
