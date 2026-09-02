// Genera los íconos de la app a partir de imagenes/Kundun.png.
// Se recorta al busto porque a 32 píxeles la figura entera queda en una mancha:
// así se distinguen la corona, la gema del pecho y el brillo del báculo.
import sharp from 'sharp';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const ORIGEN = join(RAIZ, 'imagenes', 'Kundun.png');
const DESTINO = join(RAIZ, 'public');

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
  await sharp(ORIGEN)
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
