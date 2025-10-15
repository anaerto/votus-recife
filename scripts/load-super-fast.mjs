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
  return fixText(s).toUpperCase().replace(/\s+/g, ' ').trim();
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

async function loadVotosSuperFast() {
  const filePath = resolveDataFile('dados_votacao.csv');
  const stream = fs.createReadStream(filePath);
  let count = 0;
  const batch = [];
  const CHUNK = 10000; // Lotes ainda maiores
  let totalInserted = 0;

  console.log('Carregando votos com inserção super rápida...');

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
            batch.push([nm, nmNorm, zona, bairro, local, secao, votos]);
          }
          
          if (batch.length >= CHUNK) {
            parser.pause();
            const inserted = await flushBatchSuperFast(batch);
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
          const inserted = await flushBatchSuperFast(batch);
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

async function flushBatchSuperFast(batch) {
  if (batch.length === 0) return 0;
  
  try {
    // Estratégia 1: Usar unnest arrays (mais rápido que VALUES múltiplos)
    const nms = batch.map(r => r[0]);
    const nmNorms = batch.map(r => r[1]);
    const zonas = batch.map(r => r[2]);
    const bairros = batch.map(r => r[3]);
    const locais = batch.map(r => r[4]);
    const secoes = batch.map(r => r[5]);
    const votos = batch.map(r => r[6]);
    
    await sql`
      INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos)
      SELECT * FROM unnest(
        ${nms}::text[],
        ${nmNorms}::text[],
        ${zonas}::text[],
        ${bairros}::text[],
        ${locais}::text[],
        ${secoes}::text[],
        ${votos}::integer[]
      )
    `;
    
    return batch.length;
  } catch (e) {
    // Fallback para inserção em lotes menores
    console.log(`Erro no unnest, tentando lotes menores para ${batch.length} registros...`);
    const smallBatchSize = 1000;
    let inserted = 0;
    
    for (let i = 0; i < batch.length; i += smallBatchSize) {
      const smallBatch = batch.slice(i, i + smallBatchSize);
      try {
        const values = smallBatch.map(r => 
          `('${r[0].replace(/'/g, "''")}', '${r[1].replace(/'/g, "''")}', '${r[2].replace(/'/g, "''")}', '${r[3].replace(/'/g, "''")}', '${r[4].replace(/'/g, "''")}', '${r[5].replace(/'/g, "''")}', ${r[6]})`
        ).join(',');
        
        await sql.unsafe(`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) VALUES ${values}`);
        inserted += smallBatch.length;
      } catch (e2) {
        // Último recurso: inserção individual
        for (const r of smallBatch) {
          try {
            await sql`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) 
                      VALUES (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]})`;
            inserted++;
          } catch (e3) {
            // Ignora duplicatas
            if (!e3.message.includes('duplicate')) {
              console.error('Erro individual:', e3.message);
            }
          }
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
  
  const startTime = Date.now();
  await loadVotosSuperFast();
  const endTime = Date.now();
  
  const finalVotos = await sql`SELECT COUNT(*) as count FROM votos`;
  console.log(`Votos finais no banco: ${finalVotos.rows[0].count}`);
  console.log(`Novos votos adicionados: ${finalVotos.rows[0].count - currentVotos.rows[0].count}`);
  console.log(`Tempo total: ${((endTime - startTime) / 1000).toFixed(2)} segundos`);
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});