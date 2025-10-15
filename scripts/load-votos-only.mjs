#!/usr/bin/env node
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';
import iconv from 'iconv-lite';

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

async function loadVotos() {
  const filePath = resolveDataFile('dados_votacao.csv');
  const stream = fs.createReadStream(filePath);
  let count = 0;
  let inserted = 0;
  const batch = [];
  const CHUNK = 1000; // Reduzindo o chunk para evitar problemas

  console.log('Carregando votos (apenas novos registros)...');

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
          
          if (nm && zona && votos > 0) { // Só adiciona se tem dados válidos
            batch.push({ nm, nmNorm, zona, bairro, local, secao, votos });
          }
          count++;
          
          if (batch.length >= CHUNK) {
            parser.pause();
            const batchInserted = await flushBatch(batch);
            inserted += batchInserted;
            batch.length = 0;
            parser.resume();
            process.stdout.write(`Processados: ${count} | Inseridos: ${inserted}\r`);
          }
        } catch (e) {
          console.error(`Erro na linha ${count}:`, e.message);
          reject(e);
        }
      },
      complete: async () => {
        if (batch.length > 0) {
          const batchInserted = await flushBatch(batch);
          inserted += batchInserted;
        }
        resolve();
      },
      error: (err) => reject(err),
    });
  });
  
  process.stdout.write(`\nVotos processados: ${count} | Novos inseridos: ${inserted}\n`);
}

async function flushBatch(batch) {
  let inserted = 0;
  for (const r of batch) {
    try {
      // Inserção simples, ignorando duplicatas
      await sql`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) 
                VALUES (${r.nm}, ${r.nmNorm}, ${r.zona}, ${r.bairro}, ${r.local}, ${r.secao}, ${r.votos})`;
      inserted++;
    } catch (e) {
      // Ignora erros de duplicata ou outros problemas
      if (!e.message.includes('duplicate') && !e.message.includes('unique')) {
        console.error('Erro ao inserir:', e.message);
      }
    }
  }
  return inserted;
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('Defina POSTGRES_URL no ambiente (.env.local ou via shell).');
    process.exit(1);
  }
  
  await loadVotos();
  console.log('Carregamento de votos concluído.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});