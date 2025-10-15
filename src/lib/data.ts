import { sql } from './db';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import type { Candidato, CandidateData } from './types';

function norm(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function getDataVersion(): string {
  return 'db-v1';
}

export async function getSearchOptions(): Promise<Array<{ label: string; value: string; searchTokens: string[] }>> {
  const toNormTokens = (s: string) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .split(/[^A-Z0-9]+/g)
      .filter(Boolean);

  // 1) Tenta via banco
  try {
    const { rows } = await sql`SELECT nr_votavel, nm_urna, nm_votavel FROM candidatos`;
    if (rows && rows.length > 0) {
      return rows.map((c: any) => {
        const label = `${c.nm_urna} (${c.nr_votavel})`;
        const tokens = new Set<string>();
        for (const t of toNormTokens(c.nm_urna)) tokens.add(t);
        for (const t of toNormTokens(c.nm_votavel)) tokens.add(t);
        tokens.add(String(c.nr_votavel).toUpperCase());
        return { label, value: String(c.nr_votavel), searchTokens: Array.from(tokens) };
      });
    }
  } catch {
    // segue para fallback
  }

  // 2) Fallback: ler CSV local (dados_candidatos.csv)
  try {
    const base = process.cwd();
    const filePath = path.join(base, 'data', 'dados_candidatos.csv');
    const csv = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
    const records = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
    return records
      .filter((r) => r && (r.NR_VOTAVEL || r.nr_votavel) && (r.NM_URNA || r.nm_urna))
      .map((r) => {
        const nr = String(r.NR_VOTAVEL ?? r.nr_votavel);
        const nmUrna = String(r.NM_URNA ?? r.nm_urna ?? '');
        const nmVotavel = String(r.NM_VOTAVEL ?? r.nm_votavel ?? '');
        const label = `${nmUrna} (${nr})`;
        const tokens = new Set<string>();
        for (const t of toNormTokens(nmUrna)) tokens.add(t);
        for (const t of toNormTokens(nmVotavel)) tokens.add(t);
        tokens.add(nr.toUpperCase());
        return { label, value: nr, searchTokens: Array.from(tokens) };
      });
  } catch {
    // Sem banco e sem CSV
  }

  return [];
}

export async function resolveCandidate(query: string): Promise<Candidato | null> {
  const isNum = /^\d+$/.test(String(query));
  if (isNum) {
    const { rows } = await sql`SELECT nr_votavel, nm_votavel, nm_urna, sg_partido, resultado, total_votos FROM candidatos WHERE nr_votavel = ${String(query)} LIMIT 1`;
    if (rows.length) {
      const r = rows[0] as any;
      return {
        nrVotavel: String(r.nr_votavel),
        nmVotavel: String(r.nm_votavel),
        nmUrna: String(r.nm_urna),
        partido: String(r.sg_partido),
        resultado: String(r.resultado),
        totalVotos: Number(r.total_votos) || 0,
      };
    }
  }
  const q = norm(String(query));
  const { rows } = await sql`SELECT nr_votavel, nm_votavel, nm_urna, sg_partido, resultado, total_votos FROM candidatos WHERE nm_normalizado = ${q} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0] as any;
  return {
    nrVotavel: String(r.nr_votavel),
    nmVotavel: String(r.nm_votavel),
    nmUrna: String(r.nm_urna),
    partido: String(r.sg_partido),
    resultado: String(r.resultado),
    totalVotos: Number(r.total_votos) || 0,
  };
}

// Resolve com fallback ao CSV quando o banco não retornar
export async function resolveCandidateWithFallback(query: string): Promise<Candidato | null> {
  try {
    const byDb = await resolveCandidate(query);
    if (byDb) return byDb;
  } catch {
    // ignora e segue para CSV
  }
  try {
    const base = process.cwd();
    const filePath = path.join(base, 'data', 'dados_candidatos.csv');
    const csv = fs.readFileSync(filePath, 'utf8');
    const parsed = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
    const rows = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
    const q = String(query);
    const isNum = /^\d+$/.test(q);
    const qNorm = norm(q);
    const match = rows.find((row) => {
      const nr = String(row['NR_VOTAVEL'] || row['nr_votavel'] || '').trim();
      const nmV = String(row['NM_VOTAVEL'] || row['nm_votavel'] || '').trim();
      const nmU = String(row['NM_URNA'] || row['nm_urna'] || '').trim();
      if (isNum) return nr === q;
      return norm(nmV) === qNorm || norm(nmU) === qNorm;
    });
    if (!match) return null;
    return {
      nrVotavel: String(match['NR_VOTAVEL'] ?? match['nr_votavel'] ?? ''),
      nmVotavel: String(match['NM_VOTAVEL'] ?? match['nm_votavel'] ?? ''),
      nmUrna: String(match['NM_URNA'] ?? match['nm_urna'] ?? ''),
      partido: String(match['SG_PARTIDO'] ?? match['sg_partido'] ?? ''),
      resultado: String(match['RESULTADO'] ?? match['resultado'] ?? ''),
      totalVotos: Number(String(match['TOTAL_VOTOS'] ?? match['total_votos'] ?? '0').replace(/\D/g, '')) || 0,
    };
  } catch {
    return null;
  }
}

export async function getCandidateData(nrOrName: string): Promise<CandidateData | null> {
  const cand = await resolveCandidateWithFallback(nrOrName);
  if (!cand) return null;

  const total = Number(cand.totalVotos) || 0;
  let rankingGeralTotal = 0;
  let rankingGeralPosicao = 0;
  try {
    const rankRow = await sql`SELECT COUNT(*) AS total, SUM(CASE WHEN total_votos > ${total} THEN 1 ELSE 0 END) + 1 AS pos FROM candidatos`;
    rankingGeralTotal = Number((rankRow.rows[0] as any).total) || 0;
    rankingGeralPosicao = Number((rankRow.rows[0] as any).pos) || 0;
  } catch {
    // Fallback CSV: ranking por NM_VOTAVEL
    try {
      const csvPath = path.join(process.cwd(), 'data', 'dados_votacao.csv');
      const csv = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
      const rows = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
      const totalsByName = new Map<string, number>();
      for (const row of rows) {
        const nm = String(row['NM_VOTAVEL'] || '').trim();
        const votos = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
        const key = norm(nm);
        totalsByName.set(key, (totalsByName.get(key) || 0) + votos);
      }
      const candKey1 = norm(cand.nmVotavel);
      const candKey2 = norm(cand.nmUrna);
      const candTotal = Math.max(totalsByName.get(candKey1) || 0, totalsByName.get(candKey2) || 0, total);
      const sorted = Array.from(totalsByName.values()).sort((a, b) => b - a);
      rankingGeralTotal = totalsByName.size;
      rankingGeralPosicao = Math.max(1, sorted.findIndex((v) => v === candTotal) + 1);
    } catch {}
  }

  const nameVote = cand.nmVotavel;
  const nameUrn = cand.nmUrna;

  const porZona = new Map<string, number>();
  const porBairro = new Map<string, number>();
  const porLocal = new Map<string, number>();
  const porSecao = new Map<string, number>();
  try {
    const zonaRows = await sql`SELECT zona AS zona, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${norm(nameVote)}, ${norm(nameUrn)}) GROUP BY zona ORDER BY zona`;
    const bairroRows = await sql`SELECT bairro AS bairro, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${norm(nameVote)}, ${norm(nameUrn)}) GROUP BY bairro ORDER BY votos DESC`;
    const localRows = await sql`SELECT local AS local, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${norm(nameVote)}, ${norm(nameUrn)}) GROUP BY local ORDER BY votos DESC`;
    const secaoRows = await sql`SELECT secao AS secao, SUM(votos)::int AS votos FROM votos WHERE nm_normalizado IN (${norm(nameVote)}, ${norm(nameUrn)}) GROUP BY secao ORDER BY votos DESC`;
    for (const r of (zonaRows.rows || []) as any[]) porZona.set(String(r.zona), Number(r.votos) || 0);
    for (const r of (bairroRows.rows || []) as any[]) porBairro.set(String(r.bairro), Number(r.votos) || 0);
    for (const r of (localRows.rows || []) as any[]) porLocal.set(String(r.local), Number(r.votos) || 0);
    for (const r of (secaoRows.rows || []) as any[]) porSecao.set(String(r.secao), Number(r.votos) || 0);
  } catch {
    // Fallback CSV: agregações
    try {
      const csvPath = path.join(process.cwd(), 'data', 'dados_votacao.csv');
      const csv = fs.readFileSync(csvPath, 'utf8');
      const parsed = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
      const rows = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
      const k1 = norm(nameVote);
      const k2 = norm(nameUrn);
      const totalsByScope = {
        zona: new Map<string, number>(),
        bairro: new Map<string, number>(),
        local: new Map<string, number>(),
        secao: new Map<string, number>(),
      } as const;
      // agregações do candidato e ranking geral
      const totalsByName = new Map<string, number>();
      for (const row of rows) {
        const nm = String(row['NM_VOTAVEL'] || '').trim();
        const nmNorm = norm(nm);
        const votos = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
        totalsByName.set(nmNorm, (totalsByName.get(nmNorm) || 0) + votos);
        if (nmNorm === k1 || nmNorm === k2) {
          const zona = String(row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '').trim();
          const bairro = String(row['BAIRRO'] ?? '').trim();
          const local = String(row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'] ?? '').trim();
          const secao = String(row['SECAO'] ?? row['NR_SECAO'] ?? '').trim();
          if (zona) totalsByScope.zona.set(zona, (totalsByScope.zona.get(zona) || 0) + votos);
          if (bairro) totalsByScope.bairro.set(bairro, (totalsByScope.bairro.get(bairro) || 0) + votos);
          if (local) totalsByScope.local.set(local, (totalsByScope.local.get(local) || 0) + votos);
          if (secao) totalsByScope.secao.set(secao, (totalsByScope.secao.get(secao) || 0) + votos);
        }
      }
      // preenche maps finais
      for (const [k, v] of totalsByScope.zona) porZona.set(k, v);
      for (const [k, v] of totalsByScope.bairro) porBairro.set(k, v);
      for (const [k, v] of totalsByScope.local) porLocal.set(k, v);
      for (const [k, v] of totalsByScope.secao) porSecao.set(k, v);
      // ranking geral via CSV se ainda não definido
      if (!rankingGeralTotal || !rankingGeralPosicao) {
        rankingGeralTotal = totalsByName.size;
        const candTotal = Math.max(totalsByName.get(k1) || 0, totalsByName.get(k2) || 0, total);
        const sorted = Array.from(totalsByName.values()).sort((a, b) => b - a);
        rankingGeralPosicao = Math.max(1, sorted.findIndex((v) => v === candTotal) + 1);
      }
    } catch {}
  }

  const donutPorZona = Array.from(porZona.entries()).map(([name, value]) => ({ name, value }));

  async function recorde(
    map: Map<string, number>,
    escopo: 'zona' | 'secao' | 'bairro' | 'local'
  ): Promise<{ nome: string; votos: number; posicao: number; total: number } | null> {
    if (map.size === 0) return null;
    const [nome, votos] = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    try {
      let scopeQuery: any;
      if (escopo === 'zona') {
        scopeQuery = await sql`SELECT nm_normalizado AS nm, SUM(votos)::int AS v FROM votos WHERE zona = ${nome} GROUP BY nm_normalizado`;
      } else if (escopo === 'secao') {
        scopeQuery = await sql`SELECT nm_normalizado AS nm, SUM(votos)::int AS v FROM votos WHERE secao = ${nome} GROUP BY nm_normalizado`;
      } else if (escopo === 'bairro') {
        scopeQuery = await sql`SELECT nm_normalizado AS nm, SUM(votos)::int AS v FROM votos WHERE bairro = ${nome} GROUP BY nm_normalizado`;
      } else {
        scopeQuery = await sql`SELECT nm_normalizado AS nm, SUM(votos)::int AS v FROM votos WHERE local = ${nome} GROUP BY nm_normalizado`;
      }
      const ranking = (scopeQuery.rows as any[]).sort((a, b) => Number(b.v) - Number(a.v));
      const targetNorm1 = norm(nameVote);
      const targetNorm2 = norm(nameUrn);
      const posicao = Math.max(
        1,
        ranking.findIndex((r) => String(r.nm) === targetNorm1 || String(r.nm) === targetNorm2) + 1
      );
      const total = ranking.length;
      return { nome, votos, posicao, total };
    } catch {
      // Fallback CSV: ranking por escopo
      try {
        const csvPath = path.join(process.cwd(), 'data', 'dados_votacao.csv');
        const csv = fs.readFileSync(csvPath, 'utf8');
        const parsed = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
        const rows = Array.isArray(parsed.data) ? (parsed.data as any[]) : [];
        const targetNorm1 = norm(nameVote);
        const targetNorm2 = norm(nameUrn);
        const totalsByName = new Map<string, number>();
        for (const row of rows) {
          const nm = String(row['NM_VOTAVEL'] || '').trim();
          const nmNorm = norm(nm);
          const votosRow = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
          const zona = String(row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '').trim();
          const bairro = String(row['BAIRRO'] ?? '').trim();
          const local = String(row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'] ?? '').trim();
          const secao = String(row['SECAO'] ?? row['NR_SECAO'] ?? '').trim();
          const scopeVal = escopo === 'zona' ? zona : escopo === 'bairro' ? bairro : escopo === 'local' ? local : secao;
          if (String(scopeVal) === String(nome)) {
            totalsByName.set(nmNorm, (totalsByName.get(nmNorm) || 0) + votosRow);
          }
        }
        const ranking = Array.from(totalsByName.entries()).sort((a, b) => b[1] - a[1]);
        const posicao = Math.max(
          1,
          ranking.findIndex(([nm]) => nm === targetNorm1 || nm === targetNorm2) + 1
        );
        const totalRank = ranking.length;
        return { nome, votos, posicao, total: totalRank };
      } catch {
        return { nome, votos, posicao: 1, total: 1 };
      }
    }
  }

  const recordes = {
    zona: await recorde(porZona, 'zona'),
    secao: await recorde(porSecao, 'secao'),
    bairro: await recorde(porBairro, 'bairro'),
    local: await recorde(porLocal, 'local'),
  };

  const mapas = {
    votosPorBairro: Object.fromEntries(porBairro.entries()),
    votosPorLocal: Object.fromEntries(porLocal.entries()),
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