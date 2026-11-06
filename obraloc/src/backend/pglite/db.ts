// Banco Postgres de DEMONSTRAÇÃO rodando no navegador (PGlite/WebAssembly).
// Aplica exatamente as mesmas migrações do Supabase (supabase/migrations) + dados fictícios.
// Nada sai do navegador: cada pessoa tem o seu próprio banco local.
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import shim from '../../../supabase/tests/00_supabase_shim.sql?raw';
import seed from '../../../supabase/seed.sql?raw';
import usuariosDemo from './demo-usuarios.sql?raw';

const migracoes = import.meta.glob('../../../supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

export type BancoDemo = PGlite;

export function scriptsDoBanco(): { nome: string; sql: string }[] {
  const ordenadas = Object.keys(migracoes).sort().map((k) => ({ nome: k.split('/').pop()!, sql: migracoes[k] }));
  return [
    { nome: '00_supabase_shim.sql', sql: shim },
    ...ordenadas,
    { nome: 'seed.sql', sql: seed },
    { nome: 'demo-usuarios.sql', sql: usuariosDemo },
  ];
}

/** Assinatura do esquema: muda quando alguma migração/seed muda, forçando recriar o banco local. */
export function versaoDoEsquema(): string {
  const texto = scriptsDoBanco().map((s) => s.nome + s.sql).join('\n');
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

const NOME_IDB = 'obraloc-demo';

async function preparar(db: PGlite): Promise<void> {
  const versao = versaoDoEsquema();
  const existe = await db.query<{ v: string | null }>(`select to_regclass('public._demo_meta')::text as v`);
  if (existe.rows[0]?.v) {
    const r = await db.query<{ versao: string }>('select versao from public._demo_meta');
    if (r.rows[0]?.versao === versao) return;
    throw new EsquemaDesatualizado();
  }
  for (const s of scriptsDoBanco()) {
    try {
      await db.exec(s.sql);
    } catch (e) {
      throw new Error(`Falha ao preparar o banco de demonstração (${s.nome}): ${(e as Error).message}`);
    }
  }
  await db.exec(`create table public._demo_meta (versao text not null, criado_em timestamptz not null default now());
                 revoke all on public._demo_meta from public, anon, authenticated;`);
  await db.query('insert into public._demo_meta (versao) values ($1)', [versao]);
}

class EsquemaDesatualizado extends Error {}

function apagarIdb(): Promise<void> {
  return new Promise((ok) => {
    const req = indexedDB.deleteDatabase('/pglite/' + NOME_IDB);
    req.onsuccess = req.onerror = req.onblocked = () => ok();
  });
}

/**
 * Abre o banco. No navegador persiste em IndexedDB (sobrevive a recarregar a página);
 * em testes (Node) fica só em memória.
 */
export async function abrirBanco(opcoes: { persistir: boolean }): Promise<PGlite> {
  const abrir = () => PGlite.create(opcoes.persistir ? `idb://${NOME_IDB}` : undefined, { extensions: { btree_gist } });
  let db = await abrir();
  try {
    await preparar(db);
  } catch (e) {
    if (!(e instanceof EsquemaDesatualizado) || !opcoes.persistir) throw e;
    // versão nova do sistema: recria o banco local com os dados fictícios atualizados
    await db.close();
    await apagarIdb();
    db = await abrir();
    await preparar(db);
  }
  return db;
}

export async function reiniciarBanco(db: PGlite): Promise<void> {
  await db.close();
  await apagarIdb();
}
