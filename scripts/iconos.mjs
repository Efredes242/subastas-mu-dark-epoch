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
import { plena, recortable } from './marca.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ORIGENES = join(RAIZ, 'imagenes');
const DESTINO = join(RAIZ, 'public');

/** El color de abajo del degradado del ícono: lo que se ve si algo pide un fondo plano. */
const FONDO = '#0d1020';

// ── El ícono de la app ────────────────────────────────────────────────────────
//
// Dibujado, no recortado de una captura del juego: a 32 píxeles una foto del Kundun es una
// mancha oscura sin forma. Es el mismo escudo que usa la app adentro.
//
// Dos juegos:
//   - los "plenos", para la pestaña del navegador y para iOS, que solo redondea las esquinas;
//   - los "recortables", para Android, que recorta el ícono con la forma del teléfono. Sin
//     uno de estos el sistema asume lo peor, encoge el dibujo y lo apoya sobre un plato
//     blanco — que es justo lo que se veía.
const PLENOS = [
  ['favicon-32.png', 32],
  ['favicon-48.png', 48],
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

const RECORTABLES = [
  ['icon-192-recortable.png', 192],
  ['icon-512-recortable.png', 512],
];

fs.mkdirSync(DESTINO, { recursive: true });

for (const [nombre, tam] of PLENOS) {
  // Se dibuja al doble y se baja: el trazo fino queda parejo en vez de dentado.
  await sharp(Buffer.from(plena(tam * 2)))
    .resize(tam, tam, { kernel: 'lanczos3' })
    // Sin alfa: iOS le pone fondo blanco a lo transparente y quedaría un halo.
    .flatten({ background: FONDO })
    .png({ compressionLevel: 9 })
    .toFile(join(DESTINO, nombre));

  console.log(nombre.padEnd(26), tam + 'x' + tam, (fs.statSync(join(DESTINO, nombre)).size / 1024).toFixed(1) + ' KB');
}

for (const [nombre, tam] of RECORTABLES) {
  await sharp(Buffer.from(recortable(tam * 2)))
    .resize(tam, tam, { kernel: 'lanczos3' })
    .flatten({ background: FONDO })
    .png({ compressionLevel: 9 })
    .toFile(join(DESTINO, nombre));

  console.log(nombre.padEnd(26), tam + 'x' + tam, (fs.statSync(join(DESTINO, nombre)).size / 1024).toFixed(1) + ' KB');
}

const manifiesto = {
  name: 'Subastas del Kundun',
  short_name: 'Kundun',
  description: 'El reparto de los drops del Kundun, para el gremio.',
  start_url: '/',
  display: 'standalone',
  // El fondo de la app, no el marrón del tema viejo: así la pantalla de arranque no pega un
  // salto de color contra lo que viene después.
  background_color: '#080a11',
  theme_color: '#0d1020',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icon-192-recortable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/icon-512-recortable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
