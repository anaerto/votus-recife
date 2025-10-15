import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import iconv from 'iconv-lite';
import Papa from 'papaparse';
import { sql } from '@vercel/postgres';

function norm(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function fixText(input) {
  if (!input) return input;
  let s = String(input);
  s = s.replace(/Â/g, '');
  if (/Ã/.test(s)) {
    try {
      const buf = iconv.encode(s, 'latin1');
      s = iconv.decode(buf, 'utf8');
    } catch {}
  }
  const map = {
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
  for (const [k, v] of Object.entries(map)) s = s.replace(new RegExp(k, 'g'), v);
  s = s.replace(/Guimarï¿½es/g, 'Guimarães');
  s = s.replace(/Jatobï¿½/g, 'Jatobá');
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
  s = s.replace(/Irm\?o/gi, 'Irmão');
  s = s.replace(/Irm\?a/gi, 'Irmã');
  s = s.replace(/Alian\?a/gi, 'Aliança');
  s = s.replace(/Fran\?a/gi, 'França');
  s = s.replace(/Flor\?ncio/gi, 'Florêncio');
  s = s.replace(/Mission\?rio/gi, 'Missionário');
  s = s.replace(/Cear\?/gi, 'Ceará');
  s = s.replace(/Palha\?o/gi, 'Palhaço');
  s = s.replace(/\bN\?O\b/gi, 'NÃO');
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveDataFile(name) {
  const candidates = [
    path.join(process.cwd(), 'votus-recife', 'data', name),
    path.join(process.cwd(), 'data', name),
    path.join(__dirname, '..', 'votus-recife', 'data', name),
    path.join(__dirname, '..', 'data', name),
  ];
  for (const p of candidates) {
    try {
      fs.accessSync(p, fs.constants.R_OK);
      return p;
    } catch {}
  }
  const tried = candidates.map((p) => ` - ${p}`).join('\n');
  throw new Error(`Arquivo de dados não encontrado: ${name}\nTentativas:\n${tried}`);
}

async function ensureSchema() {
  await sql`CREATE TABLE IF NOT EXISTS candidatos (
    nr_votavel INTEGER PRIMARY KEY,
    nm_votavel TEXT NOT NULL,
    nm_urna TEXT NOT NULL,
    sg_partido TEXT,
    resultado TEXT,
    total_votos INTEGER NOT NULL DEFAULT 0,
    nm_normalizado TEXT NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS votos (
    id BIGSERIAL PRIMARY KEY,
    nm_votavel TEXT NOT NULL,
    nm_normalizado TEXT NOT NULL,
    zona TEXT NOT NULL,
    bairro TEXT,
    local TEXT,
    secao TEXT,
    votos INTEGER NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_cand_nm_norm ON candidatos (nm_normalizado)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votos_nm_norm ON votos (nm_normalizado)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votos_zona ON votos (zona)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votos_bairro ON votos (bairro)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votos_local ON votos (local)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_votos_secao ON votos (secao)`;
}

async function loadCandidatos() {
  const filePath = resolveDataFile('dados_candidatos.csv');
  const buf = fs.readFileSync(filePath);
  // Decodificação inteligente
  const utf8 = buf.toString('utf8');
  const cp1252 = iconv.decode(buf, 'win1252');
  const pick = (s) => (/(Ã|Â|ï¿½|�)/.test(s) ? iconv.decode(iconv.encode(s, 'latin1'), 'utf8') : s);
  const csv = (utf8.match(/Ã|Â|ï¿½|�/) ? pick(cp1252) : pick(utf8));
  const { data } = Papa.parse(csv, { header: true, delimiter: ';', skipEmptyLines: true });
  const rows = (data || []).filter(Boolean).map((row) => {
    const nr = Number(String(row['NR_VOTAVEL'] || '').replace(/\D/g, '')) || 0;
    const nmV = fixText(String(row['NM_VOTAVEL'] || '').trim());
    const nmU = fixText(String(row['NM_URNA'] || '').trim());
    const partido = fixText(String(row['SG_PARTIDO'] || '').trim());
    const resultado = fixText(String(row['RESULTADO'] || '').trim());
    const total = Number(String(row['TOTAL_VOTOS'] || '0').replace(/\D/g, '')) || 0;
    const nmNorm = norm(nmV);
    return { nr, nmV, nmU, partido, resultado, total, nmNorm };
  });

  // UPSERT cuida das duplicatas, não precisa deletar
  let inserted = 0;
  for (const r of rows) {
    await sql`INSERT INTO candidatos (nr_votavel, nm_votavel, nm_urna, sg_partido, resultado, total_votos, nm_normalizado)
              VALUES (${r.nr}, ${r.nmV}, ${r.nmU}, ${r.partido}, ${r.resultado}, ${r.total}, ${r.nmNorm})
              ON CONFLICT (nr_votavel) DO UPDATE SET
                nm_votavel = EXCLUDED.nm_votavel,
                nm_urna = EXCLUDED.nm_urna,
                sg_partido = EXCLUDED.sg_partido,
                resultado = EXCLUDED.resultado,
                total_votos = GREATEST(candidatos.total_votos, EXCLUDED.total_votos),
                nm_normalizado = EXCLUDED.nm_normalizado`;
    inserted++;
    if (inserted % 500 === 0) process.stdout.write(`Inserted candidatos: ${inserted}/${rows.length}\r`);
  }
  process.stdout.write(`\nCandidatos carregados: ${rows.length}\n`);
}

async function loadVotos() {
  const filePath = resolveDataFile('dados_votacao.csv');
  const stream = fs.createReadStream(filePath);
  let count = 0;
  const batch = [];
  const CHUNK = 2000;

  // Não deletamos votos existentes, apenas adicionamos os faltantes
  await new Promise((resolve, reject) => {
    Papa.parse(stream, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      encoding: 'utf8',
      step: async (result, parser) => {
        const row = result.data;
        try {
          const nm = fixText(String(row['NM_VOTAVEL'] || '').trim());
          const zona = (String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '')).replace(/\D/g, '').trim()) || fixText(String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '')).trim());
          const bairro = fixText(String(row['BAIRRO'] || '').trim());
          const local = fixText(String((row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'] ?? '')).trim());
          const secao = String((row['SECAO'] ?? row['NR_SECAO'] ?? '')).trim();
          const votos = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
          const nmNorm = norm(nm);
          batch.push({ nm, nmNorm, zona, bairro, local, secao, votos });
          count++;
          if (batch.length >= CHUNK) {
            parser.pause();
            await flushBatch(batch);
            batch.length = 0;
            parser.resume();
            process.stdout.write(`Inserted votos: ${count}\r`);
          }
        } catch (e) {
          parser.pause();
          reject(e);
        }
      },
      complete: async () => {
        try {
          if (batch.length > 0) await flushBatch(batch);
          resolve();
        } catch (e) {
          reject(e);
        }
      },
      error: (err) => reject(err),
    });
  });
  process.stdout.write(`\nVotos carregados: ${count}\n`);
}

async function flushBatch(batch) {
  for (const r of batch) {
    try {
      await sql`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) 
                VALUES (${r.nm}, ${r.nmNorm}, ${r.zona}, ${r.bairro}, ${r.local}, ${r.secao}, ${r.votos})`;
    } catch (e) {
      // Ignora duplicatas ou outros erros de inserção
      if (!e.message.includes('duplicate')) {
        console.error('Erro na inserção:', e.message);
      }
    }
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('Defina POSTGRES_URL no ambiente (.env.local) para conectar ao banco.');
    process.exit(1);
  }
  console.log('Garantindo schema...');
  await ensureSchema();
  console.log('Carregando candidatos...');
  await loadCandidatos();
  console.log('Carregando votos...');
  await loadVotos();
  console.log('Concluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});