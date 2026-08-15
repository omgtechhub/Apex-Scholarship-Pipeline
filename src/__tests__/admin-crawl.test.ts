import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/admin/crawl/route';
import { jwtService } from '../pipeline/auth/jwt.service';

describe('Admin Crawl API Endpoint', () => {
  it('should reject unauthenticated requests with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/crawl', {
      method: 'POST',
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Unauthorized');
  });

  it('should reject non-admin requests with 403', async () => {
    const token = jwtService.sign({
      userId: 'user-123',
      email: 'viewer@example.com',
      role: 'VIEWER',
      permissions: ['scholarships:read'],
    });

    const req = new NextRequest('http://localhost:3000/api/admin/crawl', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Forbidden');
  });
});
