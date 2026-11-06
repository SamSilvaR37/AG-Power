import { useMemo, useState } from 'react';
import type { Categoria, EquipamentoResumo } from '../backend/types';
import { brl } from '../lib/format';
import { useApp, useCarregar } from '../lib/contexto';
import { navegar } from '../lib/router';
import { Cabecalho, Carregando, ErroCaixa, Icone, Vazio } from '../ui/componentes';
import { BarraDisponibilidade } from './Disponibilidade';
import { FormEquipamento } from './Equipamento';

export function FotoEquipamento({ fotos, nome }: { fotos: string[]; nome: string }) {
  const [falhou, setFalhou] = useState(false);
  return (
    <div className="equip-foto">
      {fotos[0] && !falhou
        ? <img src={fotos[0]} alt={nome} loading="lazy" onError={() => setFalhou(true)} />
        : <Icone nome="ferramenta" tamanho={28} />}
    </div>
  );
}

export function CatalogoPagina() {
  const { backend, pode } = useApp();
  const lista = useCarregar<[EquipamentoResumo[], Categoria[]]>(
    () => Promise.all([backend.equipamentos(), backend.categorias()]), [backend]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  const grupos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const m = new Map<string, EquipamentoResumo[]>();
    for (const e of lista.dados?.[0] ?? []) {
      if (categoria && e.categoriaId !== categoria) continue;
      if (termo && !`${e.nome} ${e.palavrasChave ?? ''} ${e.categoria}`.toLowerCase().includes(termo)) continue;
      m.set(e.categoria, [...(m.get(e.categoria) ?? []), e]);
    }
    return [...m.entries()];
  }, [lista.dados, busca, categoria]);

  return (
    <>
      <Cabecalho titulo="Catálogo" subtitulo="Equipamentos, preços e unidades físicas"
        acoes={pode('gerenciar_catalogo') && (
          <button className="botao botao-pequeno" onClick={() => setNovo(true)}><Icone nome="mais" tamanho={18} />Equipamento</button>
        )} />

      <div className="busca" style={{ marginBottom: 10 }}>
        <Icone nome="busca" tamanho={18} />
        <input type="search" placeholder="Buscar (ex.: martelete, betoneira, andaime)" value={busca}
          onChange={(e) => setBusca(e.target.value)} aria-label="Buscar equipamento" />
      </div>
      <div className="filtros">
        <button className={`filtro ${categoria === null ? 'ativo' : ''}`} onClick={() => setCategoria(null)}>Todas</button>
        {lista.dados?.[1].map((c) => (
          <button key={c.id} className={`filtro ${categoria === c.id ? 'ativo' : ''}`} onClick={() => setCategoria(c.id)}>{c.nome}</button>
        ))}
      </div>

      {lista.carregando && <Carregando />}
      {lista.erro && <ErroCaixa erro={lista.erro} tentar={lista.recarregar} />}
      {lista.dados && grupos.length === 0 && <Vazio>Nenhum equipamento encontrado.</Vazio>}
      {grupos.map(([cat, itens]) => (
        <div className="cat-grupo" key={cat}>
          <h2>{cat}</h2>
          <div className="equip-cards">
            {itens.map((e) => {
              const diaria = e.precos.find((p) => p.dias === 1);
              return (
                <a key={e.id} className="equip-card" href={`#/catalogo/${e.id}`}>
                  <FotoEquipamento fotos={e.fotos} nome={e.nome} />
                  <div className="equip-info">
                    <strong>{e.nome} {!e.ativo && <span className="tag">Inativo</span>}</strong>
                    <span className="suave pequeno">
                      {diaria ? `Diária ${brl(diaria.valor)}` : 'Sem diária'} · {e.disponivel} de {e.total} disponíveis agora
                    </span>
                    <BarraDisponibilidade {...e} />
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}

      {novo && lista.dados && (
        <FormEquipamento categorias={lista.dados[1]} fechar={() => setNovo(false)}
          salvo={(id) => { setNovo(false); navegar(`/catalogo/${id}`); }} />
      )}
    </>
  );
}
