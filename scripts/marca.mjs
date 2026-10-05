// La marca de la app: el escudo del gremio, dibujado, no recortado de una captura.
//
// Devuelve el SVG del ícono en dos variantes:
//
//   - `plena`    el escudo ocupa casi todo el cuadro. Es la que se ve en una pestaña del
//                navegador y en iOS, donde el sistema recorta las esquinas y nada más.
//   - `recortable` el mismo escudo más chico, con aire alrededor. Android recorta el ícono con
//                la forma que tenga el teléfono —círculo, cuadrado redondeado, gota— y se come
//                hasta un 10% de cada borde: lo que queda afuera de la zona segura se pierde.
//
// El escudo es el mismo trazo que usa la app en pantalla (src/iconos.tsx), para que el ícono
// del teléfono y el de adentro sean la misma cosa.

/** El trazo del escudo, en el lienzo de 24×24 en el que está dibujado. */
const ESCUDO = [
  'M12 3 5 5.5v5.8c0 4.3 2.9 8 7 9.7 4.1-1.7 7-5.4 7-9.7V5.5L12 3Z',
  'M12 8.5v5',
  'M9.5 11h5',
];

/**
 * @param {number} lado   el lado del cuadro, en píxeles
 * @param {number} escala cuánto del cuadro ocupa el escudo (1 = todo)
 */
function dibujar(lado, escala) {
  // El escudo vive en 24×24; se lleva al centro del cuadro con el tamaño pedido.
  const tam = lado * escala;
  const borde = (lado - tam) / 2;
  const k = tam / 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#262a52"/>
      <stop offset="1" stop-color="#0d1020"/>
    </linearGradient>
    <!--
      En coordenadas del lienzo y no de cada trazo: la cruz de adentro del escudo son dos
      líneas rectas, y una línea recta tiene caja de área cero. Atado a la caja, el degradado
      no sabe dónde empieza ni termina y el trazo no se pinta: la cruz desaparecía.
    -->
    <linearGradient id="trazo" gradientUnits="userSpaceOnUse"
                    x1="0" y1="${borde}" x2="0" y2="${borde + tam}">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#a8a9ff"/>
    </linearGradient>
  </defs>
  <rect width="${lado}" height="${lado}" fill="url(#fondo)"/>
  <g transform="translate(${borde} ${borde}) scale(${k})"
     fill="none" stroke="url(#trazo)" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
    ${ESCUDO.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>`;
}

/** Para la pestaña y para iOS: el escudo grande, que el sistema solo le redondea las esquinas. */
export const plena = (lado) => dibujar(lado, 0.72);

/**
 * Para Android: el escudo adentro de la zona segura.
 *
 * El sistema puede recortar hasta el 10% de cada lado, así que el dibujo se queda en el 60%
 * del centro —con margen de sobra— y el fondo llega hasta el borde para que el recorte,
 * sea la forma que sea, caiga siempre sobre color y no sobre un plato blanco.
 */
export const recortable = (lado) => dibujar(lado, 0.58);
