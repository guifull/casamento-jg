const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hashValue,
  normalizeName,
  normalizePhone,
  safeEqual,
  signSession,
  verifySession,
} = require('../api/_lib/security');
const { decryptPhone, encryptPhone } = require('../api/_lib/phone-crypto');

test('normaliza telefone brasileiro com ou sem código do país', () => {
  assert.equal(normalizePhone('(21) 98636-1743'), '21986361743');
  assert.equal(normalizePhone('+55 21 98636-1743'), '21986361743');
  assert.equal(normalizePhone('123'), null);
});

test('normaliza nome sem acentos e espaços duplicados', () => {
  assert.equal(normalizeName('  Júlia   Gonçalves '), 'julia goncalves');
});

test('hash é determinístico e não revela o telefone', () => {
  const hash = hashValue('21986361743', 'segredo-de-teste');
  assert.equal(hash, hashValue('21986361743', 'segredo-de-teste'));
  assert.equal(hash.length, 64);
  assert.ok(!hash.includes('21986361743'));
});

test('token válido é aceito e adulteração é rejeitada', () => {
  const token = signSession({ invitationId: 'convite-1' }, 'segredo-de-teste', 60);
  assert.equal(verifySession(token, 'segredo-de-teste').invitationId, 'convite-1');
  assert.equal(verifySession(`${token}x`, 'segredo-de-teste'), null);
  assert.equal(verifySession(token, 'outro-segredo'), null);
});

test('comparação segura aceita somente valores idênticos', () => {
  assert.equal(safeEqual('senha-forte', 'senha-forte'), true);
  assert.equal(safeEqual('senha-forte', 'senha-errada'), false);
  assert.equal(safeEqual('curta', 'uma-senha-maior'), false);
});

test('telefone criptografado pode ser recuperado somente com a chave correta', () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptPhone('21999990000', key);
  assert.equal(decryptPhone(encrypted, key), '21999990000');
  assert.equal(decryptPhone(encrypted, Buffer.alloc(32, 8)), null);
  assert.ok(!encrypted.includes('21999990000'));
});
