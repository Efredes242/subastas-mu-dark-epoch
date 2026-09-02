// Prepara todo lo que se sirve como archivo: el ícono de la app y la biblioteca de íconos.
//
// La biblioteca es lo que el admin ve en el panel para elegir la imagen de una clase o de un
// item, sin subir nada desde su equipo. Sale de la carpeta `imagenes/`: cada PNG que dejes ahí
// aparece solo en el panel.
//
//   node scripts/iconos.mjs
//
// Corre solo en cada `npm run build`, así que alcanza con dejar el archivo y desplegar.
import sharp from 'sharp';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ORIGENES = join(RAIZ, 'imagenes');
const DESTINO = join(RAIZ, 'public');

// ── El ícono de la app ────────────────────────────────────────────────────────
// Se recorta al busto porque a 32 píxeles la figura entera queda en una mancha:
// así se distinguen la corona, la gema del pecho y el brillo del báculo.
const RECORTE = { left: 145, top: 145, width: 215, height: 215 };

const TAMANOS = [
  ['favicon-32.png', 32],
  ['favicon-48.png', 48],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

fs.mkdirSync(DESTINO, { recursive: true });

for (const [nombre, tam] of TAMANOS) {
  await sharp(join(ORIGENES, 'Kundun.png'))
    .extract(RECORTE)
    .resize(tam, tam, { kernel: 'lanczos3' })
    // Sin alfa: iOS le pone fondo blanco a lo transparente y quedaría un halo.
    .flatten({ background: '#14110d' })
    .png({ compressionLevel: 9 })
    .toFile(join(DESTINO, nombre));

  console.log(nombre.padEnd(22), tam + 'x' + tam, (fs.statSync(join(DESTINO, nombre)).size / 1024).toFixed(1) + ' KB');
}

const manifiesto = {
  name: 'Subastas del Kundun',
  short_name: 'Kundun',
  description: 'El reparto de los drops del Kundun, para el gremio.',
  start_url: '/',
  display: 'standalone',
  background_color: '#14110d',
  theme_color: '#14110d',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};

fs.writeFileSync(join(DESTINO, 'manifest.webmanifest'), JSON.stringify(manifiesto, null, 2) + '\n');
console.log('manifest.webmanifest');

// ── La biblioteca de íconos ───────────────────────────────────────────────────

/** Archivos de `imagenes/` que no son íconos: el original del favicon y las maquetas. */
const AFUERA = new Set(['Kundun.png', 'OpcionA@1x.png']);

/** Los códigos de clase se reconocen por el nombre del archivo. */
const CLASES = new Set(['BK', 'ELF', 'SM', 'DL']);

/** "Cofre de Asedio.png" → "cofre-de-asedio". */
const aRuta = (nombre) =>
  nombre
    .replace(/\.[a-z]+$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const LADO = 128;
const biblioteca = [];

fs.mkdirSync(join(DESTINO, 'iconos'), { recursive: true });

for (const archivo of fs.readdirSync(ORIGENES).sort()) {
  if (AFUERA.has(archivo) || !/\.(png|jpe?g|webp)$/i.test(archivo)) continue;

  const base = archivo.replace(/\.[a-z]+$/i, '');
  const esClase = CLASES.has(base.toUpperCase());
  const ruta = esClase ? base.toLowerCase() : aRuta(archivo);

  // `contain` sobre transparente: nada se recorta ni se deforma, salgan como salgan.
  await sharp(join(ORIGENES, archivo))
    .resize(LADO, LADO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    // webp con alfa: la quinta parte de lo que pesa el mismo PNG y se ve igual a 30 píxeles.
    .webp({ quality: 88 })
    .toFile(join(DESTINO, 'iconos', ruta + '.webp'));

  biblioteca.push({
    id: ruta,
    nombre: base,
    url: `/iconos/${ruta}.webp`,
    tipo: esClase ? 'clase' : 'item',
  });
}

// El índice va al código del front: así el panel lo tiene sin pedir nada por red.
const indice = `// Generado por scripts/iconos.mjs. No editar a mano.
//
// La biblioteca de íconos que el panel ofrece para elegir, sin subir nada desde el equipo.
// Para sumar uno: dejá el PNG en \`imagenes/\` y volvé a desplegar.

export interface IconoBiblioteca {
  id: string;
  nombre: string;
  url: string;
  tipo: 'clase' | 'item';
}

export const BIBLIOTECA: IconoBiblioteca[] = ${JSON.stringify(biblioteca, null, 2)};
`;

fs.writeFileSync(join(RAIZ, 'src', 'biblioteca.ts'), indice);

console.log(`\nbiblioteca: ${biblioteca.length} íconos en public/iconos/`);
for (const i of biblioteca) {
  const peso = (fs.statSync(join(DESTINO, 'iconos', i.id + '.webp')).size / 1024).toFixed(1);
  console.log('  ' + i.url.padEnd(30), i.tipo.padEnd(6), peso + ' KB');
}
