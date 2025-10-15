import { NextResponse } from 'next/server';
import { getCandidateData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const data = await getCandidateData(q);
  if (!data) return NextResponse.json({ error: 'Candidato não encontrado' }, { status: 404 });
  return NextResponse.json(data);
}