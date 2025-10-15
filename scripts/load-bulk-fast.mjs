#!/usr/bin/env node
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

function fixText(s) {
  return s.replace(/[^\w\s\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
}

function norm(s) {
  return String(fixText(s))
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
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

async function loadVotosBulk() {
  const filePath = resolveDataFile('dados_votacao.csv');
  const stream = fs.createReadStream(filePath);
  let count = 0;
  const batch = [];
  const CHUNK = 5000; // Lotes grandes para bulk insert
  let totalInserted = 0;

  console.log('Carregando votos em lotes grandes (bulk insert)...');

  await new Promise((resolve, reject) => {
    Papa.parse(stream, {
      header: true,
      delimiter: ';',
      skipEmptyLines: true,
      encoding: 'utf8',
      step: async (result, parser) => {
        const row = result.data;
        count++;
        
        try {
          const nm = fixText(String(row['NM_VOTAVEL'] || '').trim());
          const zona = (String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '')).replace(/\D/g, '').trim()) || fixText(String((row['Zona'] ?? row['ZONA'] ?? row['NR_ZONA'] ?? '')).trim());
          const bairro = fixText(String(row['BAIRRO'] || '').trim());
          const local = fixText(String((row['LOCAL_VOTACAO '] ?? row['LOCAL_VOTACAO'] ?? row['LOCAL'] ?? row['NM_LOCAL'] ?? '')).trim());
          const secao = String((row['SECAO'] ?? row['NR_SECAO'] ?? '')).trim();
          const votos = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
          const nmNorm = norm(nm);
          
          if (nm && zona && votos > 0) {
            batch.push({
              nm_votavel: nm,
              nm_normalizado: nmNorm,
              zona: zona,
              bairro: bairro,
              local: local,
              secao: secao,
              votos: votos
            });
          }
          
          if (batch.length >= CHUNK) {
            parser.pause();
            const inserted = await flushBatchBulk(batch);
            totalInserted += inserted;
            batch.length = 0;
            parser.resume();
            console.log(`Processados: ${count} | Inseridos: ${totalInserted}`);
          }
        } catch (e) {
          console.error(`Erro na linha ${count}:`, e.message);
        }
      },
      complete: async () => {
        if (batch.length > 0) {
          const inserted = await flushBatchBulk(batch);
          totalInserted += inserted;
        }
        console.log(`\nCarregamento concluído:`);
        console.log(`- Linhas processadas: ${count}`);
        console.log(`- Registros inseridos: ${totalInserted}`);
        resolve();
      },
      error: (err) => {
        console.error('Erro no parsing:', err);
        reject(err);
      },
    });
  });
}

async function flushBatchBulk(batch) {
  if (batch.length === 0) return 0;
  
  try {
    // Usar VALUES com múltiplas linhas - muito mais rápido
    const values = batch.map(r => 
      `(${sql.escape(r.nm_votavel)}, ${sql.escape(r.nm_normalizado)}, ${sql.escape(r.zona)}, ${sql.escape(r.bairro)}, ${sql.escape(r.local)}, ${sql.escape(r.secao)}, ${r.votos})`
    ).join(',');
    
    const query = `INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) VALUES ${values}`;
    
    await sql.unsafe(query);
    return batch.length;
  } catch (e) {
    // Se falhar o bulk, tenta inserção individual para não perder dados
    console.log(`Erro no bulk insert, tentando inserção individual para ${batch.length} registros...`);
    let inserted = 0;
    for (const r of batch) {
      try {
        await sql`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) 
                  VALUES (${r.nm_votavel}, ${r.nm_normalizado}, ${r.zona}, ${r.bairro}, ${r.local}, ${r.secao}, ${r.votos})`;
        inserted++;
      } catch (e2) {
        // Ignora duplicatas
        if (!e2.message.includes('duplicate')) {
          console.error('Erro individual:', e2.message);
        }
      }
    }
    return inserted;
  }
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('Defina POSTGRES_URL no ambiente (.env.local ou via shell).');
    process.exit(1);
  }
  
  console.log('Verificando estado atual...');
  const currentVotos = await sql`SELECT COUNT(*) as count FROM votos`;
  console.log(`Votos atuais no banco: ${currentVotos.rows[0].count}`);
  
  await loadVotosBulk();
  
  const finalVotos = await sql`SELECT COUNT(*) as count FROM votos`;
  console.log(`Votos finais no banco: ${finalVotos.rows[0].count}`);
  console.log(`Novos votos adicionados: ${finalVotos.rows[0].count - currentVotos.rows[0].count}`);
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});