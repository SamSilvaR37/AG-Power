import { Cabecalho, Icone } from '../ui/componentes';

export function MaisPagina() {
  const itens = [
    { href: '#/catalogo', icone: 'catalogo', titulo: 'Catálogo', sub: 'Equipamentos, preços e unidades' },
    { href: '#/locacoes', icone: 'locacoes', titulo: 'Locações', sub: 'Pré-reservas, em andamento e histórico' },
    { href: '#/configuracoes', icone: 'ajustes', titulo: 'Ajustes', sub: 'Regra de cobrança, prazos, permissões, histórico' },
  ] as const;
  return (
    <>
      <Cabecalho titulo="Mais" />
      <div className="cartao">
        <ul className="lista">
          {itens.map((i) => (
            <li key={i.href}>
              <a className="item" href={i.href}>
                <span className="avatar"><Icone nome={i.icone} /></span>
                <div className="item-corpo"><div className="item-titulo">{i.titulo}</div><div className="item-sub">{i.sub}</div></div>
                <Icone nome="seta" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
