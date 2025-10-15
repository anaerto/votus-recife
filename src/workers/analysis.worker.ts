'use strict';

// Dedicated Web Worker for heavy candidate analysis
// Receives ArrayBuffers for CSVs to avoid blocking the UI thread

// @ts-ignore
import Papa from 'papaparse';

type Candidato = {
  nrVotavel: string;
  nmVotavel: string;
  nmUrna: string;
  partido: string;
  resultado: string;
  totalVotos: number;
};

type Voto = {
  nmVotavel: string;
  zona: string;
  bairro: string;
  local: string;
  secao: string;
  votos: number;
};

type CandidateData = {
  candidato: Candidato;
  rankingGeralPosicao: number;
  rankingGeralTotal: number;
  donutPorZona: { name: string; value: number }[];
  recordes: {
    zona: { nome: string; votos: number; posicao: number; total: number } | null;
    secao: { nome: string; votos: number; posicao: number; total: number } | null;
    bairro: { nome: string; votos: number; posicao: number; total: number } | null;
    local: { nome: string; votos: number; posicao: number; total: number } | null;
  };
  mapas: {
    votosPorBairro: Record<string, number>;
    votosPorLocal: Record<string, number>;
  };
};

type ProcessRequest = {
  type: 'process';
  candidateNumber: string;
  candidatosBuffer: ArrayBuffer; // windows-1252 (CP1252)
  votosBuffer: ArrayBuffer; // utf-8
  version?: string;
};

type ProcessResponse = { type: 'result'; payload: CandidateData } | { type: 'error'; error: string };

function norm(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

// Correção de mojibake e resíduos de dupla codificação (alinha com servidor)
function fixText(input: string): string {
  if (!input) return input;
  let s = input;
  // Remover fantasmas "Â" comuns
  s = s.replace(/Â/g, '');
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
  // Correções específicas vistas no dataset
  s = s.replace(/Guimarï¿½es/g, 'Guimarães');
  s = s.replace(/Jatobï¿½/g, 'Jatobá');
  // Heurísticas adicionais para nomes muito comuns com ï¿½ e ?
  s = s.replace(/Aurï¿½lio/gi, 'Aurélio');
  s = s.replace(/Flï¿½via/gi, 'Flávia');
  s = s.replace(/Louren\?o/gi, 'Lourenço');
  s = s.replace(/\bJos\?/gi, 'José');
  s = s.replace(/\bZ\?/gi, 'Zé');
  s = s.replace(/J\?nior/gi, 'Júnior');
  s = s.replace(/H\?lio/gi, 'Hélio');
  // Lista fornecida pelo usuário — variações com '?'
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
  
  // Correções específicas para casos problemáticos identificados
  s = s.replace(/Sim\?es/gi, 'Simões');
  s = s.replace(/Jatob\?/gi, 'Jatobá');
  
  return s;
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

// Converte string Latin-1/CP1252 para UTF-8 corretamente
function latin1ToUtf8(s: string): string {
  try {
    // escape -> Latin-1 percent-encoding, decodeURIComponent -> UTF-8
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

// Decodificação inteligente de ArrayBuffer com fallback e correção de mojibake
function decodeBufferSmart(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const tdUtf8 = new TextDecoder('utf-8', { fatal: false });
  const td1252 = new TextDecoder('windows-1252', { fatal: false });
  const sUtf8 = tdUtf8.decode(bytes);
  const s1252 = td1252.decode(bytes);
  const s1252Fixed = scoreMojibake(s1252) > 0 ? latin1ToUtf8(s1252) : s1252;
  const sUtf8Score = scoreMojibake(sUtf8);
  const s1252Score = scoreMojibake(s1252Fixed);
  return sUtf8Score <= s1252Score ? sUtf8 : s1252Fixed;
}

function decodeBuffer(buf: ArrayBuffer, encoding: string): string {
  // O 'windows-1252' é o nome oficial para o CP1252 na API TextDecoder
  const dec = new TextDecoder(encoding as any); 
  return dec.decode(buf);
}

function parseCandidatos(csv: string): Candidato[] {
  const { data } = Papa.parse(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });
  
  // Helper: normaliza e corrige mojibake
  const fix = (s: string | null | undefined): string => fixText(String(s ?? '').trim());
  
  return (data as any[])
    .filter(Boolean)
    .map((row) => ({
      nrVotavel: fix(row['NR_VOTAVEL']),
      nmVotavel: fix(row['NM_VOTAVEL']),
      nmUrna: fix(row['NM_URNA']),
      partido: fix(row['SG_PARTIDO']),
      resultado: fix(row['RESULTADO']),
      // Limpeza de número: remove não-dígitos e converte para Number
      totalVotos: Number(String(row['TOTAL_VOTOS'] ?? '0').replace(/\D/g, '')) || 0,
    }));
}

function parseVotos(csv: string): Voto[] {
  const { data } = Papa.parse(csv, {
    header: true,
    delimiter: ';',
    skipEmptyLines: true,
  });

  // Helper: normaliza e corrige mojibake
  const fix = (s: string | null | undefined): string => fixText(String(s ?? '').trim());
  
  return (data as any[])
    .filter(Boolean)
    .map((row) => ({
      nmVotavel: fix(row['NM_VOTAVEL']),
      zona:
        (String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '') as string)
          .replace(/\D/g, '')
          .trim()) ||
        fix(String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '') as string)),
      bairro: fix(row['BAIRRO']),
      local: fix(
        (row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'])
      ),
      secao: fix(row['SECAO'] ?? row['NR_SECAO']),
      votos: Number(String(row['VOTOS'] ?? '0').replace(/\D/g, '')) || 0,
    }));
}

function computeCandidateData(candidatos: Candidato[], votos: Voto[], nrOrName: string): CandidateData | null {
  const candidatosPorNome = new Map<string, Candidato>();
  const candidatosPorNumero = new Map<string, Candidato>();
  for (const c of candidatos) {
    candidatosPorNome.set(norm(c.nmVotavel), c);
    candidatosPorNome.set(norm(c.nmUrna), c);
    candidatosPorNumero.set(String(c.nrVotavel), c);
  }
  const cand = candidatosPorNumero.get(String(nrOrName)) || candidatosPorNome.get(norm(nrOrName));
  if (!cand) return null;

  const ordenados = [...candidatos].sort((a, b) => b.totalVotos - a.totalVotos);
  const rankingGeralPosicao = ordenados.findIndex((c) => c.nrVotavel === cand.nrVotavel) + 1;
  const rankingGeralTotal = ordenados.length;

  const nameVote = norm(cand.nmVotavel);
  const nameUrn = norm(cand.nmUrna);
  const votosCand = votos.filter((v) => {
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
    const [nome, votos] = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    const agregadosPorCandidato = new Map<string, number>();
    const votosDoEscopo = votosCand.filter((x) => String((x as any)[escopo]) === nome);
    for (const v of votosDoEscopo) {
      const cMatch = candidatosPorNome.get(norm(v.nmVotavel));
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

self.onmessage = (ev: MessageEvent<ProcessRequest>) => {
  try {
    const msg = ev.data;
    if (!msg || msg.type !== 'process') return;
    
    // Decodificação correta usando 'windows-1252' (CP1252) e 'utf-8'
    const candCsv = decodeBufferSmart(msg.candidatosBuffer);
    const votosCsv = decodeBufferSmart(msg.votosBuffer);
    
    const candidatos = parseCandidatos(candCsv);
    const votos = parseVotos(votosCsv);
    const result = computeCandidateData(candidatos, votos, msg.candidateNumber);
    
    const response: ProcessResponse = result
      ? { type: 'result', payload: result }
      : { type: 'error', error: 'Candidato não encontrado' };
    
    // @ts-ignore
    postMessage(response);
  } catch (e: any) {
    const response: ProcessResponse = { type: 'error', error: String(e?.message || e) };
    // @ts-ignore
    postMessage(response);
  }
};