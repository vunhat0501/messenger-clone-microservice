import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const EXPIRY_MARGIN_SECONDS = 30;

function isExpired(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    if (typeof payload.exp !== 'number') return false;
    return payload.exp - EXPIRY_MARGIN_SECONDS <= Date.now() / 1000;
  } catch {
    return true;
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value;
  return NextResponse.json({
    token: token && !isExpired(token) ? token : null,
  });
}
