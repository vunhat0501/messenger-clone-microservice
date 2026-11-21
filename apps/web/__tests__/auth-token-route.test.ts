/**
 * @jest-environment node
 */
import { GET } from '@/app/api/auth/token/route';

let accessToken: string | undefined;
jest.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (accessToken ? { value: accessToken } : undefined),
  }),
}));

const makeToken = (exp: number) =>
  [
    Buffer.from('{"alg":"HS256"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: 1, exp })).toString('base64url'),
    'signature',
  ].join('.');

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('GET /api/auth/token', () => {
  it('returns a token that is still valid', async () => {
    accessToken = makeToken(nowSeconds() + 600);
    await expect((await GET()).json()).resolves.toEqual({ token: accessToken });
  });

  it('returns null for an expired token so the client refreshes first', async () => {
    accessToken = makeToken(nowSeconds() - 1);
    await expect((await GET()).json()).resolves.toEqual({ token: null });
  });

  it('returns null for a token about to expire', async () => {
    accessToken = makeToken(nowSeconds() + 5);
    await expect((await GET()).json()).resolves.toEqual({ token: null });
  });

  it('returns null when there is no cookie', async () => {
    accessToken = undefined;
    await expect((await GET()).json()).resolves.toEqual({ token: null });
  });
});
