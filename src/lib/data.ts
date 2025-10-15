import type { Candidato, CandidateData } from './types';
import { sql, norm } from '@/lib/db';

// Versão dos dados baseada no DB (valor estável)
export function getDataVersion(): string {
  return 'db';
}

// Opções de busca geradas a partir da tabela de candidatos
export async function getSearchOptions(): Promise<Array<{ label: string; value: string; searchTokens: string[] }>> {
  const result = await sql<Candidato>`SELECT nr_votavel AS nrVotavel, nm_urna AS nmUrna, nm_votavel AS nmVotavel FROM candidatos`;
  const rows = result.rows || [];
  const toNormTokens = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
  return rows.map((c) => {
    const label = `${c.nmUrna} (${c.nrVotavel})`;
    const tokens = new Set<string>();
    for (const t of toNormTokens(c.nmUrna)) tokens.add(t);
    for (const t of toNormTokens(c.nmVotavel)) tokens.add(t);
    tokens.add(String(c.nrVotavel).toLowerCase());
    return { label, value: String(c.nrVotavel), searchTokens: Array.from(tokens) };
  });
}

export async function resolveCandidate(query: string): Promise<Candidato | null> {
  const qNorm = norm(query);
  const byNumber = await sql<Candidato>`SELECT nr_votavel AS nrVotavel, nm_votavel AS nmVotavel, nm_urna AS nmUrna, sg_partido AS partido, resultado, total_votos AS totalVotos, nm_normalizado AS nmNormalizado FROM candidatos WHERE nr_votavel = ${Number(query) || 0} LIMIT 1`;
  if (byNumber.rows[0]) return byNumber.rows[0] as any;
  const byName = await sql<Candidato>`SELECT nr_votavel AS nrVotavel, nm_votavel AS nmVotavel, nm_urna AS nmUrna, sg_partido AS partido, resultado, total_votos AS totalVotos, nm_normalizado AS nmNormalizado FROM candidatos WHERE nm_normalizado = ${qNorm} LIMIT 1`;
  return byName.rows[0] ? (byName.rows[0] as any) : null;
}

export async function getCandidateData(nrOrName: string): Promise<CandidateData | null> {
  const cand = await resolveCandidate(nrOrName);
  if (!cand) return null;

  // Ranking geral
  const posRes = await sql<{ pos: number }>`SELECT COUNT(*) + 1 AS pos FROM candidatos WHERE total_votos > (SELECT total_votos FROM candidatos WHERE nr_votavel = ${Number(cand.nrVotavel)})`;
  const totalRes = await sql<{ total: number }>`SELECT COUNT(*) AS total FROM candidatos`;
  const rankingGeralPosicao = Number(posRes.rows[0]?.pos || 0);
  const rankingGeralTotal = Number(totalRes.rows[0]?.total || 0);

  const nmVote = norm(cand.nmVotavel);
  const nmUrn = norm(cand.nmUrna);

  // Donut por Zona
  const donutRes = await sql<{ name: string; value: number }>`SELECT zona AS name, SUM(votos)::int AS value FROM votos WHERE nm_normalizado IN (${nmVote}, ${nmUrn}) GROUP BY zona ORDER BY value DESC`;
  const donutPorZona = donutRes.rows;

  // Agregações auxiliares por escopo
  async function topBy(scope: 'zona' | 'secao' | 'bairro' | 'local') {
    const topRes = await sql<{ nome: string; votos: number }>`SELECT ${sql.raw(scope)} AS nome, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${nmVote}, ${nmUrn}) GROUP BY ${sql.raw(scope)} ORDER BY votos DESC LIMIT 1`;
    const top = topRes.rows[0];
    if (!top) return null;
    // Ranking do candidato nesse escopo
    const candTotalRes = await sql<{ total: number }>`SELECT SUM(votos)::int AS total FROM votos WHERE ${sql.raw(scope)} = ${top.nome} AND nm_normalizado IN (${nmVote}, ${nmUrn})`;
    const candTotal = Number(candTotalRes.rows[0]?.total || 0);
    const aheadRes = await sql<{ count: number }>`SELECT COUNT(*) AS count FROM (SELECT nm_normalizado, SUM(votos)::int AS total FROM votos WHERE ${sql.raw(scope)} = ${top.nome} GROUP BY nm_normalizado) t WHERE total > ${candTotal}`;
    const posicao = Number(aheadRes.rows[0]?.count || 0) + 1;
    const totalRankRes = await sql<{ total: number }>`SELECT COUNT(*) AS total FROM (SELECT nm_normalizado FROM votos WHERE ${sql.raw(scope)} = ${top.nome} GROUP BY nm_normalizado) u`;
    const total = Number(totalRankRes.rows[0]?.total || 0);
    return { nome: String(top.nome), votos: Number(top.votos), posicao, total };
  }

  const recordes = {
    zona: await topBy('zona'),
    secao: await topBy('secao'),
    bairro: await topBy('bairro'),
    local: await topBy('local'),
  };

  // Mapas
  const bairroRes = await sql<{ nome: string; votos: number }>`SELECT bairro AS nome, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${nmVote}, ${nmUrn}) GROUP BY bairro`;
  const localRes = await sql<{ nome: string; votos: number }>`SELECT local AS nome, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${nmVote}, ${nmUrn}) GROUP BY local`;
  const mapas = {
    votosPorBairro: Object.fromEntries((bairroRes.rows || []).map((r) => [String(r.nome), Number(r.votos)])),
    votosPorLocal: Object.fromEntries((localRes.rows || []).map((r) => [String(r.nome), Number(r.votos)])),
  };

  return {
    candidato: cand,
    rankingGeralPosicao,
    rankingGeralTotal,
    donutPorZona,
    recordes,
    mapas,
  };
}