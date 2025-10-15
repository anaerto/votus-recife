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

async function testDbConnection() {
  try {
    console.log('Testando conexão com o banco...');
    const result = await sql`SELECT COUNT(*) as count FROM votos`;
    console.log(`Conexão OK. Votos atuais: ${result.rows[0].count}`);
    return true;
  } catch (error) {
    console.error('Erro na conexão:', error.message);
    return false;
  }
}

async function loadVotosSimple() {
  const filePath = resolveDataFile('dados_votacao.csv');
  const stream = fs.createReadStream(filePath);
  let count = 0;
  let inserted = 0;
  let errors = 0;
  const CHUNK = 100; // Lotes muito pequenos para debug
  
  console.log('Iniciando carregamento de votos...');

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
            try {
              // Inserção individual para debug
              await sql`INSERT INTO votos (nm_votavel, nm_normalizado, zona, bairro, local, secao, votos) 
                        VALUES (${nm}, ${nmNorm}, ${zona}, ${bairro}, ${local}, ${secao}, ${votos})`;
              inserted++;
            } catch (e) {
              if (!e.message.includes('duplicate')) {
                errors++;
                if (errors <= 5) {
                  console.error(`Erro inserção linha ${count}:`, e.message);
                }
              }
            }
          }
          
          if (count % CHUNK === 0) {
            console.log(`Processados: ${count} | Inseridos: ${inserted} | Erros: ${errors}`);
          }
          
          // Limitar para teste inicial
          if (count >= 1000) {
            parser.abort();
          }
          
        } catch (e) {
          console.error(`Erro processamento linha ${count}:`, e.message);
          errors++;
        }
      },
      complete: () => {
        console.log(`\nCarregamento concluído:`);
        console.log(`- Linhas processadas: ${count}`);
        console.log(`- Registros inseridos: ${inserted}`);
        console.log(`- Erros: ${errors}`);
        resolve();
      },
      error: (err) => {
        console.error('Erro no parsing:', err);
        reject(err);
      },
    });
  });
}

async function main() {
  if (!process.env.POSTGRES_URL) {
    console.error('Defina POSTGRES_URL no ambiente (.env.local ou via shell).');
    process.exit(1);
  }
  
  const connected = await testDbConnection();
  if (!connected) {
    process.exit(1);
  }
  
  await loadVotosSimple();
  console.log('Teste de carregamento concluído.');
}

main().catch((e) => {
  console.error('Erro geral:', e);
  process.exit(1);
});