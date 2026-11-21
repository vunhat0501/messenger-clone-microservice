import { env } from '@/config/env.config';
import { NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  const isAuthPage = pathname.startsWith('/auth');
  if (!accessToken && refreshToken) {
    try {
      //** Pause the request and ask NestJS for new tokens */
      const refreshRes = await fetch(
        `${env.NEXT_PUBLIC_BACKEND_URL}/auth/refresh`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        },
      );

      if (refreshRes.ok) {
        const data = await refreshRes.json();
        if (!refreshRes.ok) {
          return NextResponse.json(data, { status: refreshRes.status });
        }
        const newAccessToken = data.data?.accessToken;
        const newRefreshToken = data.data?.refreshToken;

        if (newAccessToken) {
          accessToken = newAccessToken;

          //** Attach the new token to the incoming request so downstream
          // * Server Components can use it immediately. */
          request.cookies.set('access_token', newAccessToken);

          const response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set('access_token', newAccessToken, {
            httpOnly: true,
            secure: env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 15 * 60,
          });

          if (newRefreshToken) {
            response.cookies.set('refresh_token', newRefreshToken, {
              httpOnly: true,
              secure: env.NODE_ENV === 'production',
              sameSite: 'lax',
              path: '/',
              maxAge: 7 * 24 * 60 * 60,
            });
          }

          if (isAuthPage) {
            return NextResponse.redirect(new URL('/profile', request.url));
          }

          return response;
        }
      } else {
        const response = NextResponse.redirect(
          new URL('/auth/signin', request.url),
        );
        response.cookies.delete('access_token');
        response.cookies.delete('refresh_token');
        return response;
      }
    } catch (error) {
      return NextResponse.json(
        { message: 'Internal server error', error },
        { status: 500 },
      );
    }
  }

  const isAuthenticated = !!accessToken;

  if (isAuthPage) {
    if (isAuthenticated) {
      const referer = request.headers.get('referer');
      if (referer && !referer.includes('/auth')) {
        return NextResponse.redirect(new URL(referer));
      }
      return NextResponse.redirect(new URL('/messages', request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
