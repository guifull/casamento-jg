const crypto = require('node:crypto');

function encryptionKey() {
  const value = String(process.env.PHONE_ENCRYPTION_KEY || '');
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('Chave de criptografia de telefone inválida');
  return key;
}

function encryptPhone(phone, key = encryptionKey()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(phone), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptPhone(value, key = encryptionKey()) {
  if (!value) return null;
  const [version, iv, tag, ciphertext, extra] = String(value).split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { decryptPhone, encryptPhone };
