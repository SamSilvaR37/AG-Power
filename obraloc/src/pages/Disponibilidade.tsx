import { useMemo, useState } from 'react';
import type { DisponibilidadeLinha } from '../backend/types';
import { brl, dataHora, deInputLocal, diaLoja, paraInputLocal } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { Cabecalho, Campo, Carregando, Cartao, ErroCaixa, Icone, Vazio } from '../ui/componentes';

export function BarraDisponibilidade({ total, disponivel, reservado, alugado, manutencao }: {
  total: number; disponivel: number; reservado: number; alugado: number; manutencao: number;
}) {
  const pct = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div className="barra-disp" role="img"
      aria-label={`${disponivel} disponíveis, ${reservado} reservadas, ${alugado} alugadas, ${manutencao} em manutenção`}>
      <span className="b-disponivel" style={{ width: pct(disponivel) }} />
      <span className="b-reservado" style={{ width: pct(reservado) }} />
      <span className="b-alugado" style={{ width: pct(alugado) }} />
      <span className="b-manutencao" style={{ width: pct(manutencao) }} />
    </div>
  );
}

export function LegendaDisponibilidade() {
  return (
    <div className="legenda">
      <span><i className="b-disponivel" />Disponível</span>
      <span><i className="b-reservado" />Reservado</span>
      <span><i className="b-alugado" />Alugado</span>
      <span><i className="b-manutencao" />Manutenção</span>
    </div>
  );
}

const ATALHOS = [
  { rotulo: 'Amanhã', de: () => diaLoja(1, 8), ate: () => diaLoja(1, 18) },
  { rotulo: '2 dias', de: () => diaLoja(1, 8), ate: () => diaLoja(3, 8) },
  { rotulo: '1 semana', de: () => diaLoja(1, 8), ate: () => diaLoja(8, 8) },
  { rotulo: '15 dias', de: () => diaLoja(1, 8), ate: () => diaLoja(16, 8) },
];

export function DisponibilidadePagina() {
  const { backend } = useApp();
  const [de, setDe] = useState(() => paraInputLocal(diaLoja(1, 8)));
  const [ate, setAte] = useState(() => paraInputLocal(diaLoja(3, 8)));
  const [busca, setBusca] = useState('');
  const inicio = deInputLocal(de);
  const fim = deInputLocal(ate);
  const invalido = !inicio || !fim ? 'Informe as duas datas.' : fim <= inicio ? 'A devolução precisa ser depois da retirada.' : null;

  const r = useCarregar<DisponibilidadeLinha[] | null>(
    () => (invalido ? Promise.resolve(null) : backend.disponibilidade(inicio!, fim!)), [backend, inicio, fim, invalido]);

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const m = new Map<string, DisponibilidadeLinha[]>();
    for (const l of r.dados ?? []) {
      if (termo && !`${l.equipamento} ${l.categoria}`.toLowerCase().includes(termo)) continue;
      m.set(l.categoria, [...(m.get(l.categoria) ?? []), l]);
    }
    return [...m.entries()];
  }, [r.dados, busca]);

  return (
    <>
      <Cabecalho titulo="Disponibilidade por período"
        subtitulo="Considera reservas, pré-reservas válidas, locações, manutenção e equipamentos atrasados." />

      <Cartao className="pilha">
        <div className="form-linha">
          <Campo rotulo="Retirada"><input type="datetime-local" value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
          <Campo rotulo="Devolução"><input type="datetime-local" value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
        </div>
        <div className="filtros" style={{ margin: 0 }}>
          {ATALHOS.map((a) => (
            <button key={a.rotulo} className="filtro" onClick={() => { setDe(paraInputLocal(a.de())); setAte(paraInputLocal(a.ate())); }}>
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="busca">
          <Icone nome="busca" tamanho={18} />
          <input type="search" placeholder="Filtrar equipamento" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Filtrar equipamento" />
        </div>
        {invalido && <div className="aviso aviso-atencao"><Icone nome="alerta" tamanho={18} />{invalido}</div>}
        {!invalido && <p className="suave pequeno">Horário de Brasília. {dataHora(inicio!)} → {dataHora(fim!)}</p>}
      </Cartao>

      <div style={{ marginTop: 16 }}>
        {r.carregando && <Carregando texto="Consultando o banco…" />}
        {r.erro && <ErroCaixa erro={r.erro} tentar={r.recarregar} />}
        {!r.carregando && r.dados && grupos.length === 0 && <Vazio>Nenhum equipamento encontrado.</Vazio>}
        {!r.carregando && grupos.map(([cat, linhas]) => (
          <div className="cat-grupo" key={cat}>
            <h2>{cat}</h2>
            <div className="disp-cards">
              {linhas.map((l) => (
                <a key={l.equipamentoId} href={`#/catalogo/${l.equipamentoId}`} className={`disp-card ${l.livres === 0 ? 'disp-zero' : ''}`}>
                  <div>
                    <strong>{l.equipamento}</strong>
                    <div className="suave pequeno">{l.diaria !== null ? `Diária ${brl(l.diaria)}` : 'Sem preço de diária'}</div>
                  </div>
                  <div className="disp-livres">
                    {l.livres}<span className="suave" style={{ fontSize: '0.9rem', fontWeight: 500 }}>/{l.ativas}</span>
                    <small>{l.livres === 0 ? 'indisponível' : l.livres === 1 ? 'livre' : 'livres'}</small>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
