import type { PrismaClient } from '@prisma/client';
import { verifyPassword } from '../../lib/password.js';
import { UnauthorizedError } from '../../lib/errors.js';

interface LoginResult {
  user: { id: string; email: string; name: string };
}

export async function login(
  prisma: PrismaClient,
  email: string,
  password: string,
): Promise<LoginResult> {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export async function getMe(
  prisma: PrismaClient,
  userId: string,
): Promise<{ id: string; email: string; name: string }> {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) {
    throw new UnauthorizedError('User not found');
  }
  return { id: user.id, email: user.email, name: user.name };
}
