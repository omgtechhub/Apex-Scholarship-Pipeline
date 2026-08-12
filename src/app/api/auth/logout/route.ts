import { NextRequest } from 'next/server';
import { apiResponse } from '@/pipeline/middleware/auth.middleware';

export async function POST(req: NextRequest) {
  // Stateless JWT logout is handled on client by discarding token. 
  // Session/token blacklist can be implemented here if persistent sessions are used.
  return apiResponse({ success: true, message: 'Logged out successfully' });
}
