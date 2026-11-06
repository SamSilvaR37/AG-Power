import { useState } from 'react';
import type { Backend } from '../backend/backend';
import type { UsuarioDemo } from '../backend/types';
import { useCarregar } from '../lib/contexto';
import { Carregando, ErroCaixa, Icone, Selo } from '../ui/componentes';

export function Login({ backend, entrar }: { backend: Backend; entrar: (userId: string) => Promise<void> }) {
  const usuarios = useCarregar<UsuarioDemo[]>(() => backend.usuariosDemo(), [backend]);
  const [erro, setErro] = useState<Error | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);

  return (
    <div className="login">
      <div className="login-caixa">
        <div className="login-marca">
          <span className="marca-logo"><Icone nome="catalogo" tamanho={24} /></span>
          <div>
            <h1>ObraLoc</h1>
            <p>Gestão de locação de equipamentos</p>
          </div>
        </div>

        <div className="cartao pilha">
          <div>
            <h2>Entrar na demonstração</h2>
            <p className="suave pequeno" style={{ marginTop: 4 }}>
              Escolha um perfil para ver o que cada papel pode fazer. Não há senha: este é um login de demonstração.
            </p>
          </div>
          {usuarios.carregando && <Carregando />}
          {usuarios.erro && <ErroCaixa erro={usuarios.erro} tentar={usuarios.recarregar} />}
          {usuarios.dados?.map((u) => (
            <button key={u.userId} className="usuario-demo" disabled={!!entrando}
              onClick={async () => {
                setEntrando(u.userId); setErro(null);
                try { await entrar(u.userId); } catch (e) { setErro(e as Error); setEntrando(null); }
              }}>
              <span className="avatar">{u.nome[0]}</span>
              <span style={{ flex: 1 }}>
                <strong>{u.nome}</strong>
                <span className="suave pequeno" style={{ display: 'block' }}>
                  {u.papel === 'admin'
                    ? 'Administrador: tudo, inclusive preços, configurações e pagamentos'
                    : 'Atendente: clientes, orçamentos, aprovação, retirada e devolução'}
                </span>
              </span>
              {entrando === u.userId ? <span className="spinner" /> : <Icone nome="seta" />}
            </button>
          ))}
          {erro && <ErroCaixa erro={erro} />}
        </div>

        <div className="aviso aviso-atencao">
          <Icone nome="alerta" tamanho={18} />
          <div>
            <Selo tipo="ficticio" /> Todos os clientes, preços e locações são inventados. O banco roda dentro do seu
            navegador e nada é enviado para servidores. A autenticação real (Supabase) entra na etapa de produção.
          </div>
        </div>
      </div>
    </div>
  );
}
