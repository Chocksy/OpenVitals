import { NextResponse } from 'next/server';
import { createHmac, randomBytes } from 'crypto';
import { cookies, headers } from 'next/headers';
import { auth } from '@/server/auth';
import { getProvider } from '@/server/integrations';

function signState(payload: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const provider = getProvider(providerId);
  if (!provider) {
    return NextResponse.json(
      { error: `Unknown provider: ${providerId}` },
      { status: 404 },
    );
  }

  const nonce = randomBytes(16).toString('hex');
  const statePayload = JSON.stringify({ userId: session.user.id, nonce });
  const signature = signState(statePayload);
  const state = Buffer.from(
    JSON.stringify({ payload: statePayload, sig: signature }),
  ).toString('base64url');

  // Store state in httpOnly cookie for CSRF verification
  const cookieStore = await cookies();
  cookieStore.set('integration_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300, // 5 minutes
    path: '/',
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const redirectUri = `${appUrl}/api/integrations/${providerId}/callback`;
  const authUrl = provider.buildAuthUrl(state, redirectUri);

  return NextResponse.redirect(authUrl);
}
