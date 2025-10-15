#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

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

async function testCsvRead() {
  try {
    const filePath = resolveDataFile('dados_votacao.csv');
    console.log(`Arquivo encontrado: ${filePath}`);
    
    const stream = fs.createReadStream(filePath);
    let count = 0;
    let validRows = 0;
    
    console.log('Iniciando leitura do CSV...');
    
    await new Promise((resolve, reject) => {
      Papa.parse(stream, {
        header: true,
        delimiter: ';',
        skipEmptyLines: true,
        encoding: 'utf8',
        step: (result, parser) => {
          count++;
          const row = result.data;
          
          if (count <= 5) {
            console.log(`Linha ${count}:`, Object.keys(row));
            console.log('Dados:', row);
          }
          
          const nm = String(row['NM_VOTAVEL'] || '').trim();
          const votos = Number(String(row['VOTOS'] || '0').replace(/\D/g, '')) || 0;
          
          if (nm && votos > 0) {
            validRows++;
          }
          
          if (count % 10000 === 0) {
            console.log(`Processadas ${count} linhas, ${validRows} válidas`);
          }
          
          if (count >= 50000) { // Limitar para teste
            parser.abort();
          }
        },
        complete: () => {
          console.log(`\nTeste concluído:`);
          console.log(`- Total de linhas processadas: ${count}`);
          console.log(`- Linhas válidas: ${validRows}`);
          resolve();
        },
        error: (err) => {
          console.error('Erro no parsing:', err);
          reject(err);
        },
      });
    });
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
}

testCsvRead();