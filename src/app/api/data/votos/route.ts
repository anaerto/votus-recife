import fs from 'fs';
import path from 'path';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const base = process.cwd();
    const filePath = path.join(base, 'data', 'dados_votacao.csv');
    const buf = fs.readFileSync(filePath);
    return new Response(buf, {
      headers: {
        'Content-Type': 'text/csv; charset=binary',
        'Cache-Control': 'public, max-age=0',
      },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Falha ao ler dados_votacao.csv' }), { status: 500 });
  }
}