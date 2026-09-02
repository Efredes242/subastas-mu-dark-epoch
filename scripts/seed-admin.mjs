#!/usr/bin/env node
// Crea (o actualiza) el usuario admin a partir de .dev.vars y deja un Kundun abierto si no hay ninguno.
// Uso: node scripts/seed-admin.mjs --local   |   node scripts/seed-admin.mjs --remote

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ITERACIONES = 100_000; // tiene que coincidir con worker/auth.ts
const BASE = 'subastas-kundun';

const remoto = process.argv.includes('--remote');

function leerCredenciales() {
  let crudo;
  try {
    crudo = readFileSync('.env.seed', 'utf8');
  } catch {
    console.error('No encontré .env.seed. Copiá .env.seed.example y completalo.');
    process.exit(1);
  }
  const vars = {};
  for (const linea of crudo.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vars;
}

function hashear(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, ITERACIONES, 32, 'sha256');
  return `pbkdf2$${ITERACIONES}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

const sql = (v) => `'${String(v).replace(/'/g, "''")}'`;

const vars = leerCredenciales();
const usuario = (vars.ADMIN_USUARIO || '').toLowerCase();
const password = vars.ADMIN_PASSWORD || '';
const personaje = vars.ADMIN_PERSONAJE || usuario;

if (!usuario || !password) {
  console.error('Faltan ADMIN_USUARIO o ADMIN_PASSWORD en .env.seed.');
  process.exit(1);
}
if (password.length < 6) {
  console.error('La contraseña del admin necesita al menos 6 caracteres.');
  process.exit(1);
}

const hash = hashear(password);
const pin = String(Math.floor(1000 + Math.random() * 9000));

const guion = `
INSERT INTO usuarios (usuario, personaje, password_hash, rol, pc, orden, activo)
VALUES (${sql(usuario)}, ${sql(personaje)}, ${sql(hash)}, 'admin', 0, 1, 1)
ON CONFLICT(usuario) DO UPDATE SET
  personaje = excluded.personaje,
  password_hash = excluded.password_hash,
  rol = 'admin',
  activo = 1;

INSERT INTO eventos (numero, sala, pin, registro_abierto, cierra_en)
SELECT 1, 'Sala 1', ${sql(pin)}, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now','+15 minutes')
WHERE NOT EXISTS (SELECT 1 FROM eventos);
`;

const carpeta = mkdtempSync(join(tmpdir(), 'sk-seed-'));
const archivo = join(carpeta, 'seed.sql');
writeFileSync(archivo, guion, 'utf8');

// Llamamos al entrypoint .js de wrangler con node: en Windows, execFileSync no puede
// ejecutar npx.cmd sin shell, y meter un shell nos obligaria a escapar rutas a mano.
const wrangler = join('node_modules', 'wrangler', 'bin', 'wrangler.js');

try {
  execFileSync(
    process.execPath,
    [wrangler, 'd1', 'execute', BASE, remoto ? '--remote' : '--local', '--file', archivo],
    { stdio: 'inherit', env: { ...process.env, CI: '1' } },
  );
  console.log(`\nListo. Admin: ${usuario} (personaje ${personaje}) en la base ${remoto ? 'remota' : 'local'}.`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}
