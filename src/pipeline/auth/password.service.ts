import bcrypt from 'bcryptjs';
const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
export const passwordService = {
  hash: (password: string) => bcrypt.hash(password, rounds),
  verify: (password: string, hash: string) => bcrypt.compare(password, hash),
  needsRehash: async (hash: string) => bcrypt.getRounds(hash) !== rounds,
};
