/**
 * Las clases de personaje del gremio.
 *
 * El retrato es un archivo estático en `public/clases/` (lo genera `scripts/iconos.mjs`
 * desde `imagenes/`), no una imagen que se suba desde el panel: son cuatro y no cambian.
 *
 * Este módulo lo usan el Worker —para validar lo que llega— y el front, para pintar.
 */

export const CLASES = [
  { codigo: 'BK', nombre: 'Royal Knight', imagen: '/clases/bk.png' },
  { codigo: 'ELF', nombre: 'High Elf', imagen: '/clases/elf.png' },
  { codigo: 'SM', nombre: 'Warrior Mage', imagen: '/clases/sm.png' },
  { codigo: 'DL', nombre: 'Dark Lord', imagen: '/clases/dl.png' },
] as const;

export type Clase = (typeof CLASES)[number]['codigo'];

export const CODIGOS: readonly string[] = CLASES.map((c) => c.codigo);

/** Sin clase asignada devuelve null; el nombre queda solo, sin retrato. */
export function claseDe(codigo: string | null | undefined) {
  return CLASES.find((c) => c.codigo === codigo) ?? null;
}
