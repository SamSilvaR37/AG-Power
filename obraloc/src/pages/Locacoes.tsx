import { useState } from 'react';
import type { LocacaoResumo, StatusLocacao } from '../backend/types';
import { brl, dataHora, relativo, rotuloOrigem } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Carregando, Cartao, ErroCaixa, Icone, StatusLocacaoTag, Vazio } from '../ui/componentes';

const FILTROS: { id: string; rotulo: string; status: StatusLocacao[] | null }[] = [
  { id: 'ativas', rotulo: 'Em aberto', status: ['pre_reserva', 'confirmada', 'em_andamento'] },
  { id: 'pre_reserva', rotulo: 'Pré-reservas', status: ['pre_reserva'] },
  { id: 'confirmada', rotulo: 'Confirmadas', status: ['confirmada'] },
  { id: 'em_andamento', rotulo: 'Em andamento', status: ['em_andamento'] },
  { id: 'encerradas', rotulo: 'Encerradas', status: ['devolvida', 'expirada', 'cancelada'] },
  { id: 'todas', rotulo: 'Todas', status: null },
];

export function LocacoesPagina({ filtroInicial }: { filtroInicial?: string }) {
  const { backend } = useApp();
  const [filtro, setFiltro] = useState(FILTROS.find((f) => f.id === filtroInicial)?.id ?? 'ativas');
  const status = FILTROS.find((f) => f.id === filtro)!.status;
  const r = useCarregar<LocacaoResumo[]>(() => backend.locacoes(status), [backend, filtro]);

  return (
    <>
      <Cabecalho titulo="Locações" subtitulo="Pré-reservas, locações em andamento e histórico" />
      <div className="filtros">
        {FILTROS.map((f) => (
          <button key={f.id} className={`filtro ${filtro === f.id ? 'ativo' : ''}`} onClick={() => setFiltro(f.id)}>{f.rotulo}</button>
        ))}
      </div>
      <Cartao>
        {r.carregando && !r.dados && <Carregando />}
        {r.erro && <ErroCaixa erro={r.erro} tentar={r.recarregar} />}
        {r.dados && r.dados.length === 0 && <Vazio>Nenhuma locação neste filtro.</Vazio>}
        {r.dados && r.dados.length > 0 && (
          <ul className="lista">
            {r.dados.map((l) => (
              <li key={l.id}>
                <div className="item">
                  <div className="item-corpo">
                    <div className="item-titulo">
                      #{l.numero} · <a href={`#/clientes/${l.clienteId}`}>{l.cliente}</a>
                      <StatusLocacaoTag status={l.status} atrasada={l.atrasada} />
                      {l.origem === 'bot' && <span className="tag"><Icone nome="whatsapp" tamanho={12} />&nbsp;{rotuloOrigem.bot}</span>}
                    </div>
                    <div className="item-sub">{l.itens}</div>
                    <div className="item-sub">
                      {dataHora(l.inicio)} → {dataHora(l.fim)} · {l.modalidade === 'entrega' ? 'Entrega' : 'Retirada na loja'}
                      {l.status === 'pre_reserva' && l.expiraEm && ` · expira ${relativo(l.expiraEm)}`}
                    </div>
                  </div>
                  <div className="item-lado">
                    <strong className="num">{brl(l.valorTotal)}</strong>
                    {l.modalidade === 'entrega' && l.valorFrete === null && <span className="suave">+ frete a definir</span>}
                    {l.recebido > 0 && <span className="suave num">recebido {brl(l.recebido)}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
      <p className="suave pequeno" style={{ marginTop: 12 }}>
        Aprovação, retirada, devolução com checklist e recebimentos entram na etapa 5.
      </p>
    </>
  );
}
