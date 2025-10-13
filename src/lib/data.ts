import fs from 'fs';
import path from 'path';
// @ts-ignore
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import type { Candidato, Voto, DataCache, CandidateData } from './types';

// Normaliza nomes para join robusto
function norm(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

let globalCache: DataCache | null = null as any;
let currentVersion: string | null = null;

function readCsv(filePath: string, encoding: 'utf8' | 'cp1252' = 'utf8'): string {
  if (encoding === 'cp1252') {
    const buf = fs.readFileSync(filePath);
    return iconv.decode(buf, 'win1252');
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Heurística para detectar mojibake
function scoreMojibake(s: string): number {
  if (!s) return 0;
  const patterns = ['Ã', 'Â', 'ï¿½', '�'];
  let score = 0;
  for (const p of patterns) {
    const matches = s.split(p).length - 1;
    score += matches;
  }
  return score;
}

// Decodificação inteligente: compara utf8 vs cp1252 e escolhe o com menos mojibake
function readCsvSmart(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf8');
  const cp1252 = iconv.decode(buf, 'win1252');
  const cp1252Fixed = scoreMojibake(cp1252) > 0 ? iconv.decode(iconv.encode(cp1252, 'latin1'), 'utf8') : cp1252;
  const utfScore = scoreMojibake(utf8);
  const cpScore = scoreMojibake(cp1252Fixed);
  return utfScore <= cpScore ? utf8 : cp1252Fixed;
}

function parseCandidatos(csv: string): Candidato[] {
  const { data } = Papa.parse(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });
  const fix = (s: string) => fixText(s);
  return (data as any[])
    .filter(Boolean)
    .map((row) => ({
      nrVotavel: String(row['NR_VOTAVEL'] ?? '').trim(),
      nmVotavel: fix(String(row['NM_VOTAVEL'] ?? '').trim()),
      nmUrna: fix(String(row['NM_URNA'] ?? '').trim()),
      partido: fix(String(row['SG_PARTIDO'] ?? '').trim()),
      resultado: fix(String(row['RESULTADO'] ?? '').trim()),
      totalVotos: Number(String(row['TOTAL_VOTOS'] ?? '0').replace(/\D/g, '')) || 0,
    }));
}

function parseVotos(csv: string): Voto[] {
  const { data } = Papa.parse(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });
  const fix = (s: string) => fixText(s);
  return (data as any[])
    .filter(Boolean)
    .map((row) => ({
      nmVotavel: fix(String(row['NM_VOTAVEL'] ?? '').trim()),
      // prioriza número puro da zona eleitoral para chaves consistentes
      // CSV usa cabeçalho "Zona" (e não "ZONA"); contemplamos variações
      zona:
        (String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '') as string)
          .replace(/\D/g, '')
          .trim()) ||
        fix(String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '') as string).trim()),
      bairro: fix(String(row['BAIRRO'] ?? '').trim()),
      // CSV usa "LOCAL_VOTACAO" e há casos com espaço no fim do cabeçalho
      local: fix(
        String((row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'] ?? '') as string).trim()
      ),
      secao: String((row['SECAO'] ?? row['NR_SECAO'] ?? '') as string).trim(),
      votos: Number(String(row['VOTOS'] ?? '0').replace(/\D/g, '')) || 0,
    }));
}

export function getData(): DataCache {
  // Invalida cache se a versão dos arquivos mudou
  const version = getDataVersion();
  if (currentVersion !== version) {
    globalCache = null as any;
    currentVersion = version;
  }
  if (globalCache) return globalCache;
  const base = process.cwd();
  const candidatosPath = path.join(base, 'data', 'dados_candidatos.csv');
  const votosPath = path.join(base, 'data', 'dados_votacao.csv');

  // Decodificação inteligente para ambos CSVs (utf-8 ou cp1252)
  const candidatosCsv = readCsvSmart(candidatosPath);
  const votosCsv = readCsvSmart(votosPath);

  const candidatos = parseCandidatos(candidatosCsv);
  const votos = parseVotos(votosCsv);

  // Índices para consultas rápidas
  const candidatosPorNome = new Map<string, Candidato>();
  const candidatosPorNumero = new Map<string, Candidato>();
  const autocompleteIndex = new Map<string, { label: string; value: string }[]>();
  const tokenize = (s: string) => s.split(/[^A-Z0-9]+/g).filter(Boolean);
  for (const c of candidatos) {
    const nV = norm(c.nmVotavel);
    const nU = norm(c.nmUrna);
    candidatosPorNome.set(nV, c);
    candidatosPorNome.set(nU, c);
    candidatosPorNumero.set(String(c.nrVotavel), c);

    const label = `${c.nmUrna} (${c.nrVotavel})`;
    const value = c.nrVotavel;
    const seen = new Set<string>();
    // Prefixos do nome completo
    for (const base of [nU, nV]) {
      for (let L = 1; L <= Math.min(5, base.length); L++) {
        const p = base.slice(0, L);
        if (seen.has(p)) continue;
        seen.add(p);
        const arr = autocompleteIndex.get(p) || [];
        if (!arr.some((x) => x.value === value)) arr.push({ label, value });
        autocompleteIndex.set(p, arr);
      }
      // Prefixos por token
      for (const tok of tokenize(base)) {
        for (let L = 1; L <= Math.min(5, tok.length); L++) {
          const p = tok.slice(0, L);
          if (seen.has(p)) continue;
          seen.add(p);
          const arr = autocompleteIndex.get(p) || [];
          if (!arr.some((x) => x.value === value)) arr.push({ label, value });
          autocompleteIndex.set(p, arr);
        }
      }
    }
    // Prefixos por número
    const num = String(c.nrVotavel);
    for (let L = 1; L <= Math.min(5, num.length); L++) {
      const p = num.slice(0, L);
      const arr = autocompleteIndex.get(p) || [];
      if (!arr.some((x) => x.value === value)) arr.push({ label, value });
      autocompleteIndex.set(p, arr);
    }
  }

  globalCache = { candidatos, votos, candidatosPorNome, candidatosPorNumero, autocompleteIndex };
  return globalCache;
}

// Versão dos dados baseada em timestamps dos arquivos CSV
export function getDataVersion(): string {
  try {
    const base = process.cwd();
    const candidatosPath = path.join(base, 'data', 'dados_candidatos.csv');
    const votosPath = path.join(base, 'data', 'dados_votacao.csv');
    const s1 = fs.statSync(candidatosPath);
    const s2 = fs.statSync(votosPath);
    return `cand:${s1.mtimeMs}|votos:${s2.mtimeMs}`;
  } catch {
    return 'unknown';
  }
}

// Opções pré-processadas para busca local no cliente (sem fetch por query)
export function getSearchOptions(): Array<{ label: string; value: string; searchTokens: string[] }> {
  const { candidatos } = getData();
  const toNormTokens = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
  return candidatos.map((c) => {
    const label = `${c.nmUrna} (${c.nrVotavel})`;
    const tokens = new Set<string>();
    for (const t of toNormTokens(c.nmUrna)) tokens.add(t);
    for (const t of toNormTokens(c.nmVotavel)) tokens.add(t);
    // Inclui número como token para busca por prefixo de número
    tokens.add(String(c.nrVotavel).toLowerCase());
    return { label, value: String(c.nrVotavel), searchTokens: Array.from(tokens) };
  });
}

export function getAutocomplete(query: string): Array<{ label: string; value: string }> {
  const { candidatos, autocompleteIndex } = getData();
  const q = norm(query);
  if (!q || q.length < 1) return [];
  const key = q.slice(0, Math.min(5, q.length));
  const base = (autocompleteIndex?.get(key) || []).slice(0, 30); // base reduzida
  if (base.length > 0) {
    // filtro final preciso sobre a base
    const qRaw = query;
    return base
      .filter((opt) => {
        const tokens = opt.label
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .split(/[^A-Z0-9]+/g)
          .filter(Boolean);
        return tokens.some((t) => t.startsWith(q)) || opt.value.startsWith(qRaw);
      })
      .slice(0, 10);
  }
  // fallback para lista completa (raramente acionado)
  const out: Array<{ label: string; value: string }> = [];
  for (const c of candidatos) {
    const label = `${c.nmUrna} (${c.nrVotavel})`;
    const tokens = label
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^A-Z0-9]+/g)
      .filter(Boolean);
    if (tokens.some((t) => t.startsWith(q)) || String(c.nrVotavel).startsWith(query)) {
      out.push({ label, value: c.nrVotavel });
    }
    if (out.length >= 10) break;
  }
  return out;
}

export function resolveCandidate(query: string): Candidato | null {
  const { candidatosPorNumero, candidatosPorNome } = getData();
  const byNumber = candidatosPorNumero.get(String(query));
  if (byNumber) return byNumber;
  const byName = candidatosPorNome.get(norm(query));
  return byName ?? null;
}

export function getCandidateData(nrOrName: string): CandidateData | null {
  const data = getData();
  const cand = resolveCandidate(nrOrName);
  if (!cand) return null;

  // Ranking geral com base em TOTAL_VOTOS
  const ordenados = [...data.candidatos].sort((a, b) => b.totalVotos - a.totalVotos);
  const rankingGeralPosicao = ordenados.findIndex((c) => c.nrVotavel === cand.nrVotavel) + 1;
  const rankingGeralTotal = ordenados.length;

  // Agregações
  const nameVote = norm(cand.nmVotavel);
  const nameUrn = norm(cand.nmUrna);
  const votosCand = data.votos.filter((v) => {
    const vn = norm(v.nmVotavel);
    return vn === nameVote || vn === nameUrn;
  });
  const somaPor = (key: keyof Voto) => {
    const map = new Map<string, number>();
    for (const v of votosCand) {
      const k = String(v[key]);
      map.set(k, (map.get(k) || 0) + v.votos);
    }
    return map;
  };

  const porZona = somaPor('zona');
  const porBairro = somaPor('bairro');
  const porLocal = somaPor('local');
  const porSecao = somaPor('secao');

  const donutPorZona = Array.from(porZona.entries()).map(([name, value]) => ({ name, value }));

  function recorde(
    map: Map<string, number>,
    escopo: keyof Voto
  ): { nome: string; votos: number; posicao: number; total: number } | null {
    if (map.size === 0) return null;
    // Maior valor para o candidato
    const [nome, votos] = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    // Ranking do candidato nesse escopo comparado com todos candidatos
    const agregadosPorCandidato = new Map<string, number>(); // chave: NR_VOTAVEL ou nome normalizado
    for (const v of data.votos.filter((x) => String((x as any)[escopo]) === nome)) {
      const cMatch = data.candidatosPorNome.get(norm(v.nmVotavel));
      const key = cMatch ? String(cMatch.nrVotavel) : norm(v.nmVotavel);
      agregadosPorCandidato.set(key, (agregadosPorCandidato.get(key) || 0) + v.votos);
    }
    const ranking = Array.from(agregadosPorCandidato.entries()).sort((a, b) => b[1] - a[1]);
    const posicao = ranking.findIndex((r) => r[0] === String(cand!.nrVotavel)) + 1;
    const total = ranking.length;
    return { nome, votos, posicao, total };
  }

  const recordes = {
    zona: recorde(porZona, 'zona'),
    secao: recorde(porSecao, 'secao'),
    bairro: recorde(porBairro, 'bairro'),
    local: recorde(porLocal, 'local'),
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

// Correção de mojibake e resíduos de dupla codificação
function fixText(input: string): string {
  if (!input) return input;
  let s = input;
  // Remover C2/Â fantasmas comuns
  s = s.replace(/Â/g, '');
  // Se houver padrões Ã, realizar correção latin1->utf8
  if (/Ã/.test(s)) {
    try {
      const buf = iconv.encode(s, 'latin1');
      s = iconv.decode(buf, 'utf8');
    } catch {}
  }
  // Correções pontuais muito comuns em PT-BR
  const map: Record<string, string> = {
    'Ã¡': 'á', 'Ã¢': 'â', 'Ã£': 'ã', 'Ã¤': 'ä',
    'Ã©': 'é', 'Ãª': 'ê', 'Ã¨': 'è', 'Ã«': 'ë',
    'Ã­': 'í', 'Ã¬': 'ì', 'Ã®': 'î', 'Ã¯': 'ï',
    'Ã³': 'ó', 'Ã´': 'ô', 'Ã¶': 'ö', 'Ãµ': 'õ',
    'Ãº': 'ú', 'Ã¼': 'ü', 'Ã±': 'ñ', 'Ã§': 'ç',
    'Ã': 'À', 'Ã': 'Á', 'Ã': 'Â', 'Ã': 'Ã', 'Ã': 'Ç',
    'Ã‰': 'É', 'ÃŠ': 'Ê', 'Ã‹': 'Ë', 'Ã': 'Í', 'ÃŽ': 'Î', 'Ã': 'Ï',
    'Ã“': 'Ó', 'Ã”': 'Ô', 'Ã•': 'Õ', 'Ã–': 'Ö',
    'Ãš': 'Ú', 'Ãœ': 'Ü', 'Ã‘': 'Ñ'
  };
  for (const [k, v] of Object.entries(map)) {
    s = s.replace(new RegExp(k, 'g'), v);
  }
  // Correções específicas vistas no dataset (heurísticas)
  s = s.replace(/Guimarï¿½es/g, 'Guimarães');
  s = s.replace(/Jatobï¿½/g, 'Jatobá');
  // Heurísticas para casos com '?' (lista fornecida)
  s = s.replace(/Aur\?lio/gi, 'Aurélio');
  s = s.replace(/Fl\?via/gi, 'Flávia');
  s = s.replace(/Louren\?o/gi, 'Lourenço');
  s = s.replace(/\bJos\?/gi, 'José');
  s = s.replace(/\bZ\?/gi, 'Zé');
  s = s.replace(/J\?nior/gi, 'Júnior');
  s = s.replace(/H\?lio/gi, 'Hélio');
  s = s.replace(/L\?cia/gi, 'Lúcia');
  s = s.replace(/Sa\?de/gi, 'Saúde');
  s = s.replace(/Andr\?/gi, 'André');
  s = s.replace(/Boc\?o/gi, 'Bocão');
  s = s.replace(/\bJ\?/gi, 'Jô');
  s = s.replace(/Virg\?nia/gi, 'Virgínia');
  s = s.replace(/O\?tica/gi, 'Ótica');
  s = s.replace(/\b\?tica\b/gi, 'Ótica');
  s = s.replace(/Vev\?/gi, 'Vevé');
  s = s.replace(/Jo\?o/gi, 'João');
  s = s.replace(/D\?a/gi, 'Déa');
  s = s.replace(/\?gua/gi, 'Água');
  s = s.replace(/Justi\?a/gi, 'Justiça');
  s = s.replace(/S\?vio/gi, 'Sávio');
  s = s.replace(/Mendon\?a/gi, 'Mendonça');
  s = s.replace(/Cl\?udio/gi, 'Cláudio');
  s = s.replace(/Uch\?a/gi, 'Uchôa');
  s = s.replace(/C\?u/gi, 'Céu');
  s = s.replace(/Uni\?o/gi, 'União');
  s = s.replace(/T\?rcio/gi, 'Tércio');
  s = s.replace(/X\?nia/gi, 'Xênia');
  s = s.replace(/Lu\?s/gi, 'Luís');
  // Correções para Irmão/Irmã
  s = s.replace(/Irm\?o/gi, 'Irmão');
  s = s.replace(/Irm\?a/gi, 'Irmã');
  s = s.replace(/Alian\?a/gi, 'Aliança');
  // Correções adicionais recorrentes no dataset
  s = s.replace(/Fran\?a/gi, 'França');
  s = s.replace(/Flor\?ncio/gi, 'Florêncio');
  s = s.replace(/Mission\?rio/gi, 'Missionário');
  s = s.replace(/Cear\?/gi, 'Ceará');
  s = s.replace(/Palha\?o/gi, 'Palhaço');
  // Estados/rotulagens
  s = s.replace(/\bN\?O\b/gi, 'NÃO');
  // Lista adicional enviada pelo usuário
  s = s.replace(/Pac\?fico/gi, 'Pacífico');
  s = s.replace(/Di\?cono/gi, 'Diácono');
  s = s.replace(/Met\?dio/gi, 'Metódio');
  s = s.replace(/Farm\?cia/gi, 'Farmácia');
  s = s.replace(/Jord\?o/gi, 'Jordão');
  s = s.replace(/For\?a/gi, 'Força');
  s = s.replace(/Fub\?/gi, 'Fubá');
  s = s.replace(/Futev\?lei/gi, 'Futevôlei');
  s = s.replace(/F\?bio/gi, 'Fábio');
  s = s.replace(/Mission\?ria/gi, 'Missionária');
  s = s.replace(/Ata\?de/gi, 'Ataíde');
  s = s.replace(/Castram\?vel/gi, 'Castramóvel');
  s = s.replace(/Galv\?o/gi, 'Galvão');
  s = s.replace(/C\?ndida/gi, 'Cândida');
  s = s.replace(/Cabe\?a/gi, 'Cabeça');
  s = s.replace(/Ti\?ta/gi, 'Tiêta');
  s = s.replace(/St\?nio/gi, 'Stênio');
  s = s.replace(/Ecl\?sio/gi, 'Eclésio');
  s = s.replace(/Josu\?/gi, 'Josué');
  s = s.replace(/Patr\?cia/gi, 'Patrícia');
  s = s.replace(/Pel\?/gi, 'Pelé');
  return s;
}