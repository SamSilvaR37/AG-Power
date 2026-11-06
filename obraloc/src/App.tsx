import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Backend } from './backend/backend';
import type { Sessao } from './backend/types';
import { abrirBanco } from './backend/pglite/db';
import { PgliteBackend } from './backend/pglite/backend';
import { PgliteFerramentasBot, PgliteIntegracao } from './backend/pglite/servidor';
import { Ctx, type Atendimento, type Contexto } from './lib/contexto';
import { ProvedorSimulado } from './whatsapp/simulado';
import { ServicoAtendimento } from './whatsapp/servico';
import { navegar, useRota } from './lib/router';
import { Carregando, ErroCaixa, Icone, Selo } from './ui/componentes';
import { Login } from './pages/Login';
import { PainelPagina } from './pages/Painel';
import { DisponibilidadePagina } from './pages/Disponibilidade';
import { CatalogoPagina } from './pages/Catalogo';
import { EquipamentoPagina } from './pages/Equipamento';
import { ClientesPagina } from './pages/Clientes';
import { ClientePagina } from './pages/Cliente';
import { LocacoesPagina } from './pages/Locacoes';
import { ConfiguracoesPagina } from './pages/Configuracoes';
import { AtendimentoPagina } from './pages/Atendimento';
import { MaisPagina } from './pages/Mais';

const CHAVE_SESSAO = 'obraloc.sessao';

const NAV = [
  { rota: 'painel', rotulo: 'Painel', icone: 'painel' },
  { rota: 'atendimento', rotulo: 'Atendimento', icone: 'whatsapp' },
  { rota: 'disponibilidade', rotulo: 'Disponibilidade', icone: 'calendario' },
  { rota: 'catalogo', rotulo: 'Catálogo', icone: 'catalogo' },
  { rota: 'clientes', rotulo: 'Clientes', icone: 'clientes' },
  { rota: 'locacoes', rotulo: 'Locações', icone: 'locacoes' },
  { rota: 'configuracoes', rotulo: 'Ajustes', icone: 'ajustes' },
] as const;

const NAV_MOVEL = [
  { rota: 'painel', rotulo: 'Painel', icone: 'painel' },
  { rota: 'atendimento', rotulo: 'Atendimento', icone: 'whatsapp' },
  { rota: 'disponibilidade', rotulo: 'Agenda', icone: 'calendario' },
  { rota: 'clientes', rotulo: 'Clientes', icone: 'clientes' },
  { rota: 'mais', rotulo: 'Mais', icone: 'catalogo' },
] as const;

// Uma única instância do banco, mesmo com o StrictMode montando o app duas vezes.
let bancoAberto: ReturnType<typeof abrirBanco> | null = null;
const obterBanco = () => (bancoAberto ??= abrirBanco({ persistir: true }));

// "Lado servidor" da demonstração: provedor simulado + serviço de webhook/despachante.
let atendimentoUnico: Atendimento | null = null;
function obterAtendimento(db: Awaited<ReturnType<typeof abrirBanco>>): Atendimento {
  if (atendimentoUnico) return atendimentoUnico;
  const integracao = new PgliteIntegracao(db);
  const provedor = new ProvedorSimulado();
  const servico = new ServicoAtendimento(integracao, provedor);
  provedor.entregar = (req) => servico.receberWebhook(req);
  servico.iniciar();
  // rotina que, em produção, seria agendada no servidor
  setInterval(() => { void integracao.expirarPreReservas().catch(() => undefined); }, 60_000);
  atendimentoUnico = { servico, provedor, bot: new PgliteFerramentasBot(db) };
  return atendimentoUnico;
}

function lerSessaoSalva(): string | null {
  try { return localStorage.getItem(CHAVE_SESSAO); } catch { return null; }
}
function salvarSessao(id: string | null) {
  try { if (id) localStorage.setItem(CHAVE_SESSAO, id); else localStorage.removeItem(CHAVE_SESSAO); } catch { /* sem armazenamento */ }
}

export function App() {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [atendimento, setAtendimento] = useState<Atendimento | null>(null);
  const [erroInicio, setErroInicio] = useState<Error | null>(null);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [toast, setToast] = useState<{ msg: string; tipo: 'ok' | 'erro' } | null>(null);
  const rota = useRota();

  useEffect(() => {
    let vivo = true;
    obterBanco()
      .then(async (db) => {
        const b = new PgliteBackend(db);
        if (!vivo) return;
        setAtendimento(obterAtendimento(db));
        setBackend(b);
        const salvo = lerSessaoSalva();
        if (salvo) {
          try { setSessao(await b.entrar(salvo)); } catch { salvarSessao(null); }
        }
        setRestaurando(false);
      })
      .catch((e: Error) => { if (vivo) setErroInicio(e); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const avisar = useCallback((msg: string, tipo: 'ok' | 'erro' = 'ok') => setToast({ msg, tipo }), []);
  const sair = useCallback(() => { salvarSessao(null); setSessao(null); navegar('/'); }, []);

  const ctx = useMemo<Contexto | null>(() => (backend && sessao && atendimento ? {
    backend, sessao, sair, avisar, atendimento, pode: (p) => sessao.permissoes.includes(p),
  } : null), [backend, sessao, sair, avisar, atendimento]);

  if (erroInicio) {
    return (
      <div className="login"><div className="login-caixa">
        <ErroCaixa erro={new Error(`O banco de demonstração não abriu neste navegador. ${erroInicio.message}`)}
          tentar={() => window.location.reload()} />
      </div></div>
    );
  }
  if (!backend || restaurando) {
    return <div className="login"><div className="login-caixa"><div className="cartao"><Carregando texto="Preparando o banco de demonstração no navegador…" /></div></div></div>;
  }
  if (!ctx) {
    return <Login backend={backend} entrar={async (id) => {
      const s = await backend.entrar(id);
      salvarSessao(id);
      setSessao(s);
      navegar('/painel');
    }} />;
  }

  const secao = rota[0] ?? 'painel';
  let pagina;
  switch (secao) {
    case 'disponibilidade': pagina = <DisponibilidadePagina />; break;
    case 'catalogo': pagina = rota[1] ? <EquipamentoPagina id={rota[1]} /> : <CatalogoPagina />; break;
    case 'clientes': pagina = rota[1] ? <ClientePagina id={rota[1]} /> : <ClientesPagina />; break;
    case 'locacoes': pagina = <LocacoesPagina filtroInicial={rota[1]} />; break;
    case 'configuracoes': pagina = <ConfiguracoesPagina />; break;
    case 'atendimento': pagina = <AtendimentoPagina conversaId={rota[1]} />; break;
    case 'mais': pagina = <MaisPagina />; break;
    default: pagina = <PainelPagina />;
  }

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        <div className="faixa-demo" role="note">
          <Selo tipo="ficticio" /> <span>Demonstração com dados fictícios, salva só neste navegador. WhatsApp simulado.</span>
        </div>
        <div className="layout">
          <aside className="lateral">
            <a className="marca" href="#/painel">
              <span className="marca-logo"><Icone nome="catalogo" tamanho={18} /></span>
              <span>ObraLoc<small>Gestão de locação</small></span>
            </a>
            <nav aria-label="Principal">
              {NAV.map((n) => (
                <a key={n.rota} href={`#/${n.rota}`} className={secao === n.rota ? 'ativo' : ''} aria-current={secao === n.rota ? 'page' : undefined}>
                  <Icone nome={n.icone} />{n.rotulo}
                </a>
              ))}
            </nav>
            <div className="lateral-rodape">
              <div><strong>{ctx.sessao.nome}</strong></div>
              <div style={{ opacity: 0.8 }}>{ctx.sessao.papel === 'admin' ? 'Administrador' : 'Atendente'}</div>
              <button onClick={sair}><Icone nome="sair" tamanho={16} />Sair</button>
            </div>
          </aside>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="topo-movel">
              <a className="marca" href="#/painel">
                <span className="marca-logo"><Icone nome="catalogo" tamanho={16} /></span>
                <span>ObraLoc<small>{ctx.sessao.nome}</small></span>
              </a>
              <a className="botao-icone" href="#/configuracoes" aria-label="Ajustes"><Icone nome="ajustes" /></a>
            </div>
            <main className="conteudo">{pagina}</main>
          </div>
        </div>

        <nav className="nav-inferior" aria-label="Principal">
          {NAV_MOVEL.map((n) => {
            const ativo = n.rota === 'mais' ? ['mais', 'catalogo', 'locacoes', 'configuracoes'].includes(secao) : secao === n.rota;
            return (
              <a key={n.rota} href={`#/${n.rota}`} className={ativo ? 'ativo' : ''} aria-current={ativo ? 'page' : undefined}>
                <Icone nome={n.icone} />{n.rotulo}
              </a>
            );
          })}
        </nav>
        {toast && <div className={`toast ${toast.tipo === 'erro' ? 'toast-erro' : ''}`} role="status">{toast.msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
