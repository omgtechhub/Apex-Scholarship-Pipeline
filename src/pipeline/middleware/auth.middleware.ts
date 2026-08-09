import { NextRequest, NextResponse } from 'next/server';
import { jwtService } from '../auth/jwt.service';
import { hasPermission } from '../auth/rbac.service';

export function getAuthPayload(request: NextRequest) {
  const header = request.headers.get('authorization');
  if (!header?.toLowerCase().startsWith('bearer ')) return null;
  try { return jwtService.verify(header.slice(7)); } catch { return null; }
}

export function requirePermission(permission: string, handler: (request: NextRequest, auth: ReturnType<typeof getAuthPayload>) => Promise<NextResponse>) {
  return async (request: NextRequest) => {
    const auth = getAuthPayload(request);
    if (!auth || !hasPermission(auth.permissions ?? [], permission)) return NextResponse.json({ success:false, error:'Forbidden' }, { status:403 });
    return handler(request, auth);
  };
}


export async function authenticate(request: NextRequest) {
  const payload = getAuthPayload(request);
  if (!payload) throw new Error('Unauthorized');
  return payload;
}

export async function requireEditorOrAbove(request: NextRequest) {
  const payload = await authenticate(request);
  if (payload.role !== 'ADMIN' && payload.role !== 'EDITOR') throw new Error('Forbidden');
  return payload;
}

export async function requireAdmin(request: NextRequest) {
  const payload = await authenticate(request);
  if (payload.role !== 'ADMIN') throw new Error('Forbidden');
  return payload;
}

export function apiResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Internal server error';
  const status = /unauthorized/i.test(message) ? 401 : /forbidden/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return NextResponse.json({ success: false, error: message }, { status });
}
