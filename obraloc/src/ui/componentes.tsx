import { useEffect, type ReactNode } from 'react';
import type { SituacaoUnidade, StatusLocacao } from '../backend/types';
import { rotuloSituacao, rotuloStatus } from '../lib/format';

export function Icone({ nome, tamanho = 20 }: { nome: keyof typeof ICONES; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONES[nome]}
    </svg>
  );
}

const ICONES = {
  painel: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  catalogo: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4M3 17l9 4 9-4" /></>,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 010 7M18 14.8c1.8.7 3 2.4 3.5 5.2" /></>,
  locacoes: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  ajustes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>,
  voltar: <path d="M15 18l-6-6 6-6" />,
  seta: <path d="M9 18l6-6-6-6" />,
  mais: <path d="M12 5v14M5 12h14" />,
  busca: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  alerta: <><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4M12 17.5v.01" /></>,
  sair: <><path d="M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" /><path d="M10 17l5-5-5-5M15 12H4" /></>,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  editar: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  whatsapp: <><path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1.1L4 20z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 01-1.8-1.8l.8-1-1-2L9 9.5z" /></>,
  ferramenta: <path d="M14.7 6.3a4 4 0 00-5.3 5.3L3 18l3 3 6.4-6.4a4 4 0 005.3-5.3l-2.5 2.5-2.5-.5-.5-2.5 2.5-2.5z" />,
} as const;

/** Selo que diferencia dados fictícios, recursos simulados e integrações reais. */
export function Selo({ tipo, children }: { tipo: 'ficticio' | 'simulado' | 'real' | 'demo'; children?: ReactNode }) {
  const padrao = { ficticio: 'Dados fictícios', simulado: 'Simulado', real: 'Integração real', demo: 'Demonstração' }[tipo];
  return <span className={`selo selo-${tipo}`}>{children ?? padrao}</span>;
}

export function StatusLocacaoTag({ status, atrasada }: { status: StatusLocacao; atrasada?: boolean }) {
  if (atrasada) return <span className="tag tag-atrasada">Atrasada</span>;
  return <span className={`tag tag-${status}`}>{rotuloStatus[status]}</span>;
}

export function SituacaoTag({ situacao }: { situacao: SituacaoUnidade }) {
  return <span className={`tag tag-sit-${situacao}`}>{rotuloSituacao[situacao]}</span>;
}

export function Cabecalho({ titulo, subtitulo, voltar, acoes }: {
  titulo: ReactNode; subtitulo?: ReactNode; voltar?: string; acoes?: ReactNode;
}) {
  return (
    <header className="cabecalho">
      <div className="cabecalho-titulo">
        {voltar && <a className="botao-icone" href={`#${voltar}`} aria-label="Voltar"><Icone nome="voltar" /></a>}
        <div>
          <h1>{titulo}</h1>
          {subtitulo && <p className="suave">{subtitulo}</p>}
        </div>
      </div>
      {acoes && <div className="cabecalho-acoes">{acoes}</div>}
    </header>
  );
}

export function Cartao({ titulo, acao, children, className = '' }: {
  titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`cartao ${className}`}>
      {(titulo || acao) && (
        <div className="cartao-topo">
          {titulo && <h2>{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="carregando" role="status"><span className="spinner" />{texto}</div>;
}

export function ErroCaixa({ erro, tentar }: { erro: Error; tentar?: () => void }) {
  return (
    <div className="erro-caixa" role="alert">
      <Icone nome="alerta" />
      <div>
        <strong>Não foi possível carregar.</strong>
        <p>{erro.message}</p>
        {tentar && <button className="botao botao-secundario botao-pequeno" onClick={tentar}>Tentar de novo</button>}
      </div>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="vazio">{children}</p>;
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

/** Painel lateral no desktop, folha de baixo para cima no celular. */
export function Folha({ titulo, aberta, fechar, children, rodape }: {
  titulo: string; aberta: boolean; fechar: () => void; children: ReactNode; rodape?: ReactNode;
}) {
  useEffect(() => {
    if (!aberta) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', f);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', f); document.body.style.overflow = ''; };
  }, [aberta, fechar]);
  if (!aberta) return null;
  return (
    <div className="folha-fundo" onClick={fechar}>
      <div className="folha" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="folha-topo">
          <h2>{titulo}</h2>
          <button className="botao-icone" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" /></button>
        </div>
        <div className="folha-corpo">{children}</div>
        {rodape && <div className="folha-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Numero({ valor, rotulo, tom, href }: { valor: ReactNode; rotulo: string; tom?: 'alerta' | 'atencao' | 'ok'; href?: string }) {
  const conteudo = (<><span className="numero-valor">{valor}</span><span className="numero-rotulo">{rotulo}</span></>);
  return href
    ? <a className={`numero ${tom ? `numero-${tom}` : ''}`} href={href}>{conteudo}</a>
    : <div className={`numero ${tom ? `numero-${tom}` : ''}`}>{conteudo}</div>;
}
