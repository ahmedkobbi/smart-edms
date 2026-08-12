/**
 * Smart EDMS Vendor Server — Authentication
 *
 * Simple JWT-based auth for vendor administrators.
 * The vendor server has its own AdminUser table (separate from the EDMS app).
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'vendor-secret-change-me-min-32-chars-long-string';
const encoder = new TextEncoder();

export interface VendorSession {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export async function signToken(payload: VendorSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(encoder.encode(JWT_SECRET));
}

export async function verifyToken(token: string): Promise<VendorSession | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(JWT_SECRET));
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<VendorSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('vendor-session')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set('vendor-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60, // 8 hours
    path: '/',
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete('vendor-session');
}
