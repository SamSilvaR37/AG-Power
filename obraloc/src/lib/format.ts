// Formatação em pt-BR, sempre no fuso da loja (America/Sao_Paulo).
import type { SituacaoUnidade, StatusLocacao } from '../backend/types';

export const FUSO = 'America/Sao_Paulo';
// O Brasil não tem horário de verão desde 2019: o fuso da loja é sempre -03:00.
const OFFSET = '-03:00';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (v: number | null | undefined) => (v === null || v === undefined ? '—' : moeda.format(v));

const fData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const fDataAno = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
const fHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const fSemana = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'short' });

export const data = (iso: string) => fData.format(new Date(iso));
export const dataAno = (iso: string) => fDataAno.format(new Date(iso));
export const hora = (iso: string) => fHora.format(new Date(iso));
export const dataHora = (iso: string) => `${fSemana.format(new Date(iso)).replace('.', '')} ${data(iso)}, ${hora(iso)}`;

/** "em 3 h", "há 2 dias" */
export function relativo(iso: string, agora = Date.now()): string {
  const diff = new Date(iso).getTime() - agora;
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  let t: string;
  if (min < 60) t = `${Math.max(min, 1)} min`;
  else if (min < 48 * 60) t = `${Math.round(min / 60)} h`;
  else t = `${Math.round(min / 1440)} dias`;
  return diff >= 0 ? `em ${t}` : `há ${t}`;
}

/** Valor para <input type="datetime-local"> no fuso da loja. */
export function paraInputLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Lê <input type="datetime-local"> como horário da loja. */
export function deInputLocal(valor: string): string | null {
  if (!valor) return null;
  const d = new Date(`${valor}:00${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Hoje + n dias, na hora indicada, no fuso da loja. */
export function diaLoja(n: number, h = 8): string {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const d = new Date(`${hoje}T${String(h).padStart(2, '0')}:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

export function telefone(t: string | null): string {
  if (!t) return '—';
  const m = t.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : t;
}

export const nomePeriodo = (d: number) =>
  d === 1 ? 'Diária' : d === 7 ? 'Semana' : d === 15 ? 'Quinzena' : d === 30 ? 'Mês' : `${d} dias`;

export const rotuloStatus: Record<StatusLocacao, string> = {
  pre_reserva: 'Pré-reserva',
  confirmada: 'Confirmada',
  em_andamento: 'Em andamento',
  devolvida: 'Devolvida',
  expirada: 'Expirada',
  cancelada: 'Cancelada',
};

export const rotuloSituacao: Record<SituacaoUnidade, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  alugado: 'Alugado',
  manutencao: 'Manutenção',
  baixada: 'Baixada',
};

export const rotuloOrigem: Record<string, string> = {
  bot: 'WhatsApp (assistente)',
  equipe: 'Equipe',
  sistema: 'Sistema',
  cliente: 'Cliente',
  balcao: 'Balcão',
  whatsapp: 'WhatsApp',
  telefone: 'Telefone',
  outro: 'Outro',
};

export const rotuloAcao: Record<string, string> = {
  orcamento_criado: 'Orçamento criado',
  pre_reserva_criada: 'Pré-reserva criada',
  pre_reserva_expirada: 'Pré-reserva expirada',
  locacao_aprovada: 'Locação aprovada',
  locacao_cancelada: 'Locação cancelada',
  unidade_realocada: 'Unidade realocada',
  retirada_registrada: 'Retirada registrada',
  devolucao_registrada: 'Devolução registrada',
  frete_definido: 'Frete definido',
  recebimento_registrado: 'Recebimento registrado',
  manutencao_agendada: 'Manutenção agendada',
  manutencao_encerrada: 'Manutenção encerrada',
  condicao_unidade_alterada: 'Condição de unidade alterada',
  atendimento_assumido: 'Atendimento assumido',
  devolvida_ao_assistente: 'Conversa devolvida ao assistente',
  atendimento_humano_solicitado: 'Assistente pediu atendimento humano',
  cliente_criado_pelo_whatsapp: 'Cliente criado pelo WhatsApp',
  cliente_vinculado: 'Cliente vinculado à conversa',
  falha_ferramenta: 'Falha numa consulta do assistente',
  cliente_notificado: 'Cliente avisado pelo WhatsApp',
};
