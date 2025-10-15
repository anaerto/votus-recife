#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Simple, robust Vercel CLI workflow for: env check → DB init → build → deploy
// Usage examples:
//  - node scripts/cli-workflow.mjs --env=production
//  - node scripts/cli-workflow.mjs --env=preview --skip-db --skip-smoke

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args.map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const ENV = (argMap.env ?? 'production').toString();
const SKIP_DB = Boolean(argMap['skip-db']);
const SKIP_SMOKE = Boolean(argMap['skip-smoke']);
const VERCEL_TOKEN = (process.env.VERCEL_TOKEN || argMap.token || '').toString();

const rootDir = process.cwd();
const appDir = path.resolve(rootDir, 'votus-recife');

function log(step, msg) {
  console.log(`\n[${step}] ${msg}`);
}

function run(cmd, opts = {}) {
  log('RUN', cmd);
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts });
}

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const out = {};
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function ensureVercelCLI() {
  try {
    const v = execSync('vercel --version', { encoding: 'utf8', stdio: 'pipe', shell: true });
    log('CHECK', `Vercel CLI encontrado: ${v.trim()}`);
  } catch (err) {
    console.error('Vercel CLI não encontrado. Instale com: npm i -g vercel');
    process.exit(1);
  }
}

function ensureProjectLinked() {
  const linked = fileExists(path.join(appDir, '.vercel', 'project.json'));
  if (!linked) {
    console.error('Projeto não está linkado com a Vercel. Execute uma vez:');
    console.error('  cd votus-recife && vercel link');
    process.exit(1);
  }
  log('CHECK', 'Projeto Vercel linkado (.vercel/project.json presente).');
}

function pullEnv() {
  // Baixa variáveis do ambiente escolhido para arquivos locais (.env.*)
  const tokenArg = VERCEL_TOKEN ? `--token=${VERCEL_TOKEN}` : '';
  run(`vercel pull --environment=${ENV} --yes ${tokenArg}`.trim(), { cwd: appDir });
  log('ENV', `Variáveis de ambiente baixadas para ${appDir}.`);
}

function resolvePostgresUrl() {
  const candidates = [
    path.join(appDir, '.env.production'),
    path.join(appDir, '.env.preview'),
    path.join(appDir, '.env.local'),
    path.join(appDir, '.env.development'),
  ];
  for (const p of candidates) {
    if (fileExists(p)) {
      const envs = parseEnvFile(p);
      if (envs.POSTGRES_URL) {
        log('ENV', `POSTGRES_URL encontrado em ${path.basename(p)}.`);
        return envs.POSTGRES_URL;
      }
    }
  }
  if (process.env.POSTGRES_URL) {
    log('ENV', 'POSTGRES_URL encontrado em process.env.');
    return process.env.POSTGRES_URL;
  }
  return null;
}

function ensurePostgresEnv() {
  const url = resolvePostgresUrl();
  if (!url) {
    console.error('POSTGRES_URL não encontrado. Configure na Vercel (Production/Preview) e rode "vercel pull".');
    console.error('Dica: Vercel Dashboard → Project Settings → Environment Variables → POSTGRES_URL');
    process.exit(1);
  }
  process.env.POSTGRES_URL = url;
  log('CHECK', 'POSTGRES_URL disponível no ambiente de execução.');
}

function initDatabase() {
  if (SKIP_DB) {
    log('DB', 'Pulando etapa de inicialização de banco (--skip-db).');
    return;
  }
  log('DB', 'Inicializando/migrando banco com CSV loader (scripts/load-csv-to-db.mjs).');
  run('node ./scripts/load-csv-to-db.mjs', { cwd: rootDir, env: { ...process.env } });
}

function buildWithVercel() {
  // Usa o pipeline de build da Vercel para gerar .vercel/output
  log('BUILD', `Executando vercel build (${ENV}).`);
  const tokenArg = VERCEL_TOKEN ? `--token=${VERCEL_TOKEN}` : '';
  run(`vercel build ${tokenArg}`.trim(), { cwd: appDir });
  const outputDir = path.join(appDir, '.vercel', 'output');
  if (!fileExists(path.join(outputDir, 'config.json'))) {
    console.error('Falha ao gerar .vercel/output. Verifique erros de build.');
    process.exit(1);
  }
  log('BUILD', 'Build concluído e .vercel/output gerado.');
}

function smokeChecks() {
  if (SKIP_SMOKE) {
    log('SMOKE', 'Pulando smoke checks (--skip-smoke).');
    return;
  }
  log('SMOKE', 'Executando smoke checks simples do build.');
  const outputDir = path.join(appDir, '.vercel', 'output');
  const hasFunctions = fileExists(path.join(outputDir, 'functions', 'index.func')); // pode não existir dependendo da app
  const hasStatic = fileExists(path.join(outputDir, 'static')); // pasta comum para assets
  const hasConfig = fileExists(path.join(outputDir, 'config.json'));
  if (!hasConfig) {
    console.error('config.json ausente em .vercel/output. Build pode estar incompleto.');
    process.exit(1);
  }
  log('SMOKE', `config.json OK; static=${hasStatic ? 'OK' : 'n/a'}; functions=${hasFunctions ? 'OK' : 'n/a'}.`);
}

function deployPrebuilt() {
  const prodFlag = ENV === 'production' ? '--prod' : '';
  log('DEPLOY', `Executando vercel deploy --prebuilt ${prodFlag} --yes`);
  const tokenArg = VERCEL_TOKEN ? `--token=${VERCEL_TOKEN}` : '';
  run(`vercel deploy --prebuilt ${prodFlag} --yes ${tokenArg}`.trim(), { cwd: appDir });
  log('DEPLOY', 'Deploy solicitado. A URL foi impressa acima pelo CLI.');
}

function main() {
  log('START', `Workflow: env=${ENV}, skip-db=${SKIP_DB}, skip-smoke=${SKIP_SMOKE}`);
  if (!fileExists(appDir)) {
    console.error(`Diretório da app não encontrado: ${appDir}`);
    process.exit(1);
  }
  ensureVercelCLI();
  ensureProjectLinked();
  pullEnv();
  ensurePostgresEnv();
  initDatabase();
  buildWithVercel();
  smokeChecks();
  deployPrebuilt();
  log('DONE', 'Workflow concluído com sucesso.');
}

main();