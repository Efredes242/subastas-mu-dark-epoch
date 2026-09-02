/**
 * Las clases de personaje del gremio.
 *
 * Viven en la tabla `clases` y se manejan desde el panel: el admin las crea, les cambia el
 * nombre y les sube el retrato, sin que nadie toque el código.
 *
 * La imagen sale de dos lados. Si la fila tiene `imagen`, es una data URL que subió el admin.
 * Si está vacía, se usa el archivo estático `public/clases/<codigo>.png`, que es lo que pasa
 * con las cuatro que vinieron de fábrica: pesan menos y las cachea el navegador.
 */

export interface ClasePublica {
  codigo: string;
  nombre: string;
  /** Lista para poner en un `src`: data URL propia o la ruta del archivo estático. */
  imagen: string;
  /** Si la subió el admin. Las de fábrica se pueden volver a su retrato original. */
  propia: boolean;
}

interface FilaClase {
  codigo: string;
  nombre: string;
  imagen: string | null;
  orden: number;
}

/** Las que vienen con la app, con su PNG en public/clases/. */
export const DE_FABRICA = ['BK', 'ELF', 'SM', 'DL'];

export const rutaEstatica = (codigo: string) => `/clases/${codigo.toLowerCase()}.png`;

/**
 * El código es lo que se guarda en cada personaje: letras y números, corto y en mayúsculas.
 * Devuelve null si no sirve.
 */
export function normalizarCodigo(crudo: string): string | null {
  const codigo = crudo.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return codigo.length >= 1 && codigo.length <= 8 ? codigo : null;
}

export async function leerClases(db: D1Database): Promise<ClasePublica[]> {
  const { results } = await db
    .prepare('SELECT codigo, nombre, imagen, orden FROM clases ORDER BY orden ASC, codigo ASC')
    .all<FilaClase>();

  return results.map((c) => ({
    codigo: c.codigo,
    nombre: c.nombre,
    imagen: c.imagen ?? rutaEstatica(c.codigo),
    propia: c.imagen !== null,
  }));
}
