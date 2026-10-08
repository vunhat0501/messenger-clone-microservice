import { env } from '@/config/env.config';
import { NextRequest, NextResponse } from 'next/server';

async function proxyRequest(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const path = resolvedParams.path.join('/');
    const targetUrl = `${env.NEXT_PUBLIC_BACKEND_URL}/${path}${req.nextUrl.search}`;
    const accessToken = req.cookies.get('access_token')?.value;
    const headers = new Headers();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    const contentType = req.headers.get('content-type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.text();
    }
    const backendResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    const responseData = await backendResponse.text();

    return new NextResponse(responseData, {
      status: backendResponse.status,
      headers: {
        'Content-Type':
          backendResponse.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('BFF Proxy Error:', error);
    return NextResponse.json(
      { message: 'Internal Server Error (BFF)' },
      { status: 500 },
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
