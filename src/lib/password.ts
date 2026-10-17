/* Password legível: sem caracteres ambíguos (0/O, 1/l/I). */
export function generatePassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => alphabet[n % alphabet.length]).join('');
}
