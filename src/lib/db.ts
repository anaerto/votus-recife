import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Configuração do banco SQLite
const dbPath = path.join(process.cwd(), 'data', 'votacao.db');

// Garantir que o diretório data existe
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    // Configurar para melhor performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

// Interface compatível com @vercel/postgres
export const sql = {
  async query(query: string, params: any[] = []): Promise<{ rows: any[] }> {
    const db = getDb();
    try {
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      return { rows };
    } catch (error) {
      console.error('SQL Error:', error);
      throw error;
    }
  }
};

// Template literal function para compatibilidade
export function sqlTemplate(strings: TemplateStringsArray, ...values: any[]): Promise<{ rows: any[] }> {
  let query = strings[0];
  const params: any[] = [];
  
  for (let i = 0; i < values.length; i++) {
    query += '?' + strings[i + 1];
    params.push(values[i]);
  }
  
  return sql.query(query, params);
}

// Sobrescrever o sql para usar template literals
Object.assign(sql, sqlTemplate);

export function norm(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

// Função para inicializar o banco
export function initializeDatabase() {
  const db = getDb();
  
  // Criar tabelas se não existirem
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidatos (
      nr_votavel TEXT PRIMARY KEY,
      nm_votavel TEXT,
      nm_urna TEXT,
      sg_partido TEXT,
      resultado TEXT,
      total_votos INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS votos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nrvotavel TEXT,
      nmvotavel TEXT,
      nmurna TEXT,
      zona TEXT,
      secao TEXT,
      bairro TEXT,
      local TEXT,
      votos INTEGER DEFAULT 1,
      nm_normalizado TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_votos_nrvotavel ON votos(nrvotavel);
    CREATE INDEX IF NOT EXISTS idx_votos_nm_normalizado ON votos(nm_normalizado);
    CREATE INDEX IF NOT EXISTS idx_votos_zona ON votos(zona);
    CREATE INDEX IF NOT EXISTS idx_votos_bairro ON votos(bairro);
    CREATE INDEX IF NOT EXISTS idx_votos_local ON votos(local);
    CREATE INDEX IF NOT EXISTS idx_votos_secao ON votos(secao);
  `);
  
  return db;
}