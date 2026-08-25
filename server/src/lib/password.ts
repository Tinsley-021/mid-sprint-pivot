import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Deliberately generic, non-committal rules here — the strength check that matters
// is length + not-a-known-breached-password, not a contrived "must contain a
// symbol" rule that just pushes people toward "Password1!". Real breached-password
// checking (e.g. HaveIBeenPwned range API) is a good Phase-3 addition.
export function isPasswordStrongEnough(plain: string): boolean {
  return typeof plain === 'string' && plain.length >= 10;
}
