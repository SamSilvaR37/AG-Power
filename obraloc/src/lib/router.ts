// Roteador mínimo por hash (#/catalogo/123). Funciona em qualquer hospedagem estática.
import { useEffect, useState } from 'react';

export function rotaAtual(): string[] {
  return window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function navegar(caminho: string) {
  window.location.hash = caminho.startsWith('/') ? caminho : `/${caminho}`;
}

export function useRota(): string[] {
  const [rota, setRota] = useState(rotaAtual);
  useEffect(() => {
    const f = () => {
      setRota(rotaAtual());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}
