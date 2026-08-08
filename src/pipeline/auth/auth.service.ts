import prisma from '../database/prisma-client';
import { passwordService } from './password.service';
import { jwtService } from './jwt.service';
import { permissionsForRole } from './rbac.service';

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await passwordService.verify(password, user.passwordHash))) {
    throw new Error('Invalid credentials');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const permissions = permissionsForRole(user.role);
  return { token: jwtService.sign({ userId: user.id, email: user.email, role: user.role, permissions }), user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}
