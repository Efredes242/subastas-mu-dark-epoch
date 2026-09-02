import type { FilaCatalogo, Rareza } from './types';

/**
 * Clave de comparación: sin acentos, sin mayúsculas, sin signos, espacios colapsados.
 * "Cóndor Flame" y "condor  flame" caen en la misma clave.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Renglon {
  nombre: string;
  clave: string;
  cantidad: number;
}

/**
 * Convierte lo que el admin pega después de la subasta en una lista de items.
 *
 *   "1 cqc, 2 condor flame, 2 almas de guerra"
 *   → cqc ×1, condor flame ×2, almas de guerra ×2
 *
 * Acepta coma, punto y coma o salto de línea como separador, y la cantidad
 * adelante ("2 condor flame") o atrás ("condor flame x2").
 */
export function parsearLote(texto: string): Renglon[] {
  const renglones = new Map<string, Renglon>();

  for (const crudo of texto.split(/[\n,;]+/)) {
    const trozo = crudo.trim();
    if (!trozo) continue;

    let cantidad = 1;
    let nombre = trozo;

    const adelante = trozo.match(/^(\d{1,3})\s*[xX*]?\s+(.+)$/);
    const atras = trozo.match(/^(.+?)\s*[xX*]\s*(\d{1,3})$/);

    if (adelante) {
      cantidad = Number(adelante[1]);
      nombre = adelante[2];
    } else if (atras) {
      nombre = atras[1];
      cantidad = Number(atras[2]);
    }

    nombre = nombre.trim().replace(/\s+/g, ' ');
    const clave = normalizar(nombre);
    if (!clave) continue;

    cantidad = Math.min(Math.max(cantidad, 1), 50);

    const previo = renglones.get(clave);
    // "2 joyas, 1 joya" en la misma tanda se suma en vez de pisarse.
    if (previo) previo.cantidad = Math.min(previo.cantidad + cantidad, 50);
    else renglones.set(clave, { nombre, clave, cantidad });
  }

  return [...renglones.values()];
}

/** Las conectivas van en minúscula: "Almas de Guerra", no "Almas De Guerra". */
const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'con', 'a', 'en']);

/** Primera letra de cada palabra en mayúscula, respetando los "+9" y los "x12". */
export function comoTitulo(nombre: string): string {
  return nombre
    .split(' ')
    .map((palabra, i) => {
      const bajo = palabra.toLowerCase();
      if (i > 0 && MINUSCULAS.has(bajo)) return bajo;
      return palabra.replace(/^[a-záéíóúñ]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/**
 * Busca el item en el catálogo del gremio; si es la primera vez que sale, lo agrega
 * para que el admin le pueda poner la imagen una sola vez y valga para siempre.
 */
export async function asegurarEnCatalogo(db: D1Database, renglon: Renglon): Promise<FilaCatalogo> {
  // La clave propia SIEMPRE le gana a un alias ajeno: si alguien puso "condor" como alias
  // de la Llama, escribir "condor" tiene que seguir cayendo en la Pluma, que lo tiene de clave.
  const existente = await db
    .prepare(
      `SELECT * FROM catalogo
        WHERE clave = ?1 OR instr(alias, ?2) > 0
        ORDER BY (clave = ?1) DESC, id ASC
        LIMIT 1`,
    )
    .bind(renglon.clave, `|${renglon.clave}|`)
    .first<FilaCatalogo>();

  if (existente) return existente;

  await db
    .prepare('INSERT INTO catalogo (clave, nombre) VALUES (?, ?) ON CONFLICT(clave) DO NOTHING')
    .bind(renglon.clave, comoTitulo(renglon.nombre))
    .run();

  const creado = await db.prepare('SELECT * FROM catalogo WHERE clave = ?').bind(renglon.clave).first<FilaCatalogo>();
  if (!creado) throw new Error(`No se pudo registrar "${renglon.nombre}" en el catálogo.`);

  // Todo item nuevo arranca en la lista del Kundun; en el panel se le agregan las otras.
  await db
    .prepare("INSERT INTO catalogo_colas (catalogo_id, cola) VALUES (?, 'items') ON CONFLICT DO NOTHING")
    .bind(creado.id)
    .run();
  return creado;
}

export const RAREZAS: Rareza[] = ['comun', 'excelente', 'ancient', 'divino'];
export const ICONOS = ['arma', 'armadura', 'casco', 'alas', 'joya', 'anillo', 'pergamino', 'bota', 'zen', 'caja'];
