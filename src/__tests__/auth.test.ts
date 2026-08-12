import { describe, it, expect } from 'vitest';
import { passwordService } from '../pipeline/auth/password.service';
import { jwtService } from '../pipeline/auth/jwt.service';
import { permissionsForRole, hasPermission } from '../pipeline/auth/rbac.service';

describe('Authentication & Authorization', () => {
  it('should hash and verify passwords correctly', async () => {
    const password = 'SecurePassword123!';
    const hash = await passwordService.hash(password);
    expect(hash).not.toBe(password);
    const isValid = await passwordService.verify(password, hash);
    expect(isValid).toBe(true);
    const isInvalid = await passwordService.verify('WrongPassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should sign and verify JWT tokens', () => {
    const payload = { userId: '123', email: 'test@example.com', role: 'ADMIN', permissions: ['*'] };
    const token = jwtService.sign(payload);
    expect(typeof token).toBe('string');
    const decoded = jwtService.verify(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.role).toBe(payload.role);
  });

  it('should enforce RBAC permissions correctly', () => {
    const adminPerms = permissionsForRole('ADMIN');
    const editorPerms = permissionsForRole('EDITOR');
    const viewerPerms = permissionsForRole('VIEWER');

    expect(hasPermission(adminPerms, 'anything:write')).toBe(true);
    expect(hasPermission(editorPerms, 'articles:publish')).toBe(true);
    expect(hasPermission(viewerPerms, 'articles:publish')).toBe(false);
    expect(hasPermission(viewerPerms, 'scholarships:read')).toBe(true);
  });
});
