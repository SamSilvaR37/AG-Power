import { createContext, useCallback, useContext, useEffect, useRef, useState, type DependencyList } from 'react';
import type { Backend } from '../backend/backend';
import type { Permissao, Sessao } from '../backend/types';
import type { FerramentasBot } from '../backend/integracao';
import type { ServicoAtendimento } from '../whatsapp/servico';
import type { ProvedorSimulado } from '../whatsapp/simulado';

/** Peças do "lado servidor" que, na demonstração, rodam no próprio navegador. */
export interface Atendimento {
  servico: ServicoAtendimento;
  provedor: ProvedorSimulado;
  bot: FerramentasBot;
}

export interface Contexto {
  backend: Backend;
  sessao: Sessao;
  pode: (p: Permissao) => boolean;
  sair: () => void;
  avisar: (msg: string, tipo?: 'ok' | 'erro') => void;
  atendimento: Atendimento;
}

export const Ctx = createContext<Contexto | null>(null);

export function useApp(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('Contexto do app ausente');
  return c;
}

export interface Assincrono<T> {
  dados: T | undefined;
  erro: Error | null;
  carregando: boolean;
  recarregar: () => void;
}

/** Carrega dados e expõe estado de carregamento/erro, descartando respostas antigas. */
export function useCarregar<T>(fn: () => Promise<T>, deps: DependencyList): Assincrono<T> {
  const [dados, setDados] = useState<T>();
  const [erro, setErro] = useState<Error | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  const atual = useRef(0);

  useEffect(() => {
    const id = ++atual.current;
    setCarregando(true);
    fn().then(
      (d) => { if (id === atual.current) { setDados(d); setErro(null); setCarregando(false); } },
      (e: Error) => { if (id === atual.current) { setErro(e); setCarregando(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, erro, carregando, recarregar };
}

/** Recarrega quando o serviço de atendimento muda algo e, por garantia, a cada `intervalo` ms. */
export function useAoVivo(recarregar: () => void, intervalo = 3000) {
  const { atendimento } = useApp();
  useEffect(() => {
    const parar = atendimento.servico.aoMudar(recarregar);
    const t = setInterval(recarregar, intervalo);
    return () => { parar(); clearInterval(t); };
  }, [atendimento, recarregar, intervalo]);
}
