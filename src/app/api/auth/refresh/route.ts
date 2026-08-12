import { NextRequest } from 'next/server';
import { jwtService } from '@/pipeline/auth/jwt.service';
import { handleApiError, apiResponse } from '@/pipeline/middleware/auth.middleware';
import prisma from '@/pipeline/database/prisma-client';
import { permissionsForRole } from '@/pipeline/auth/rbac.service';

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }
    const token = authHeader.substring(7);
    const payload = jwtService.verify(token);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.active) {
      throw new Error('User not found or inactive');
    }
    const permissions = permissionsForRole(user.role);
    const newToken = jwtService.sign({ userId: user.id, email: user.email, role: user.role, permissions });
    return apiResponse({ token: newToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    return handleApiError(e);
  }
}
