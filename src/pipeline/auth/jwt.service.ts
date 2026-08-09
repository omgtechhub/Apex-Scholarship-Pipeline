import jwt from 'jsonwebtoken';
export interface AuthPayload { userId: string; email: string; role: string; permissions?: string[]; }
const secret = () => process.env.JWT_SECRET ?? 'change-me-in-production-min-32-chars!!';
export const jwtService = {
  sign(payload: AuthPayload): string { return jwt.sign(payload, secret(), { expiresIn: (process.env.JWT_EXPIRES_IN ?? '24h') as jwt.SignOptions['expiresIn'] }); },
  verify(token: string): AuthPayload { return jwt.verify(token, secret()) as AuthPayload; },
};
