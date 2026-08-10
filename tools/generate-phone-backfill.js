const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const workbookPath = process.argv[2];
if (!workbookPath) throw new Error('Informe o caminho da planilha');
const builder = path.join(__dirname, 'build-rsvp-import.ps1');
const command = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & '${builder.replace(/'/g, "''")}' -Path '${workbookPath.replace(/'/g, "''")}'`;
const built = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', maxBuffer: 5_000_000 });
if (built.status !== 0) throw new Error(built.stderr || 'Falha ao ler a planilha');
const preview = JSON.parse(built.stdout);
const key = crypto.randomBytes(32);

function encrypt(phone) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

const lines = ['begin;'];
for (const invitation of preview.invitations) {
  const contactHash = fs.readFileSync(path.join(__dirname, '..', '.private', 'rsvp-import.sql'), 'utf8')
    .match(new RegExp(`phone_hash = '([a-f0-9]{64})'\\) then\\r?\\n\\s+insert into public\\.invitations \\(display_name\\) values \\('${invitation.invitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''")}\\'`))?.[1];
  if (!contactHash) throw new Error(`Hash não localizado: ${invitation.invitation}`);
  lines.push(`update public.invitation_contacts set phone_encrypted = '${encrypt(invitation.phone)}' where phone_hash = '${contactHash}';`);
}
lines.push('commit;');
lines.push('select count(*) as telefones_criptografados from public.invitation_contacts where phone_encrypted is not null;');
const outputDir = path.join(__dirname, '..', '.private');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'phone-backfill.sql'), lines.join('\n'), 'utf8');
const copied = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$input | Set-Clipboard'], { input: key.toString('base64url'), encoding: 'utf8' });
if (copied.status !== 0) throw new Error('Falha ao copiar a chave');
console.log(JSON.stringify({ invitations: preview.invitations.length, keyCopied: true, sqlCreated: true }));
