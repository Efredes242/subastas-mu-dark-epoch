/**
 * Qué se ve y quién puede tocar qué.
 *
 * Dos mapas guardados en la fila de ajustes, los dos manejados por el admin desde el menú
 * Desarrollador:
 *
 *   - `interfaz`: para cada pedazo de la app, quién lo ve. Sirve para esconder cosas que
 *     estorban o mostrar la app entera cuando se la está enseñando a alguien.
 *   - `permisos`: para las dos cosas que de verdad cambian las reglas del reparto, si las
 *     puede hacer el Grand Master o solo el admin. Esto se controla en el servidor, no en la
 *     pantalla: esconder un botón no es un permiso.
 */

/** Quién ve un pedazo de la app. Lo que no está en el mapa lo ve todo el mundo. */
export type Alcance = 'todos' | 'admin' | 'nadie';

/** Lo que se guarda: 'todos' no hace falta, es el valor de fábrica. */
export type Escondido = Exclude<Alcance, 'todos'>;

/** Quién puede hacer algo que cambia las reglas. */
export type Quien = 'gm' | 'admin';

/**
 * Todo lo que se puede esconder. El nombre que se lee de cada uno vive en el panel: acá está
 * la lista para no guardar cualquier cosa en la base.
 */
export const PARTES = [
  // El tablero
  'tablero_items',
  'tablero_almas',
  'tablero_asedio',
  'tablero_gremio',
  'tablero_cartel',
  'boton_puja',
  'boton_drops',
  'boton_historial',
  'boton_horarios',
  'boton_tema',
  'boton_zona',
  // El panel
  'panel_catalogo',
  'panel_listas',
  'panel_miembros',
  'panel_turnos',
  'panel_chat',
  'panel_pruebas',
  'panel_horarios',
  'panel_orden',
  'panel_anterior',
] as const;

export type Parte = (typeof PARTES)[number];

/** Las dos que cambian las reglas. Por defecto las dos son del admin. */
export const PERMISOS = ['catalogo', 'turnos'] as const;
export type Permiso = (typeof PERMISOS)[number];

export const PERMISOS_POR_DEFECTO: Record<Permiso, Quien> = {
  // Renombrar un item, cambiarle la palabra con la que se carga o sacarlo de una lista cambia
  // cómo se reparte de ahí en adelante, y no queda rastro. Va al admin.
  catalogo: 'admin',
  // Mover el "le toca a" de una rueda saltea a alguien sin que se note. Va al admin.
  turnos: 'admin',
};

const esAlcance = (v: unknown): v is Alcance => v === 'todos' || v === 'admin' || v === 'nadie';
const esQuien = (v: unknown): v is Quien => v === 'gm' || v === 'admin';

/** Lo guardado es JSON; si viene roto o vacío, vale lo de siempre. */
export function leerInterfaz(crudo: string | null): Record<string, Escondido> {
  const salida: Record<string, Escondido> = {};
  if (!crudo) return salida;
  try {
    const leido = JSON.parse(crudo) as Record<string, unknown>;
    for (const parte of PARTES) {
      const v = leido[parte];
      // 'todos' es el valor de fábrica: no hace falta guardarlo.
      if (esAlcance(v) && v !== 'todos') salida[parte] = v;
    }
  } catch {
    /* fila vieja o rota: se ve todo */
  }
  return salida;
}

export function leerPermisos(crudo: string | null): Record<Permiso, Quien> {
  const salida = { ...PERMISOS_POR_DEFECTO };
  if (!crudo) return salida;
  try {
    const leido = JSON.parse(crudo) as Record<string, unknown>;
    for (const p of PERMISOS) if (esQuien(leido[p])) salida[p] = leido[p] as Quien;
  } catch {
    /* fila vieja o rota: manda el admin */
  }
  return salida;
}

/** Lo que llega del panel, limpio y listo para guardar. */
export function comoInterfaz(crudo: unknown): Record<string, Escondido> {
  const entra = (crudo ?? {}) as Record<string, unknown>;
  const salida: Record<string, Escondido> = {};
  for (const parte of PARTES) {
    const v = entra[parte];
    if (esAlcance(v) && v !== 'todos') salida[parte] = v;
  }
  return salida;
}

export function comoPermisos(crudo: unknown): Record<Permiso, Quien> {
  const entra = (crudo ?? {}) as Record<string, unknown>;
  const salida = { ...PERMISOS_POR_DEFECTO };
  for (const p of PERMISOS) if (esQuien(entra[p])) salida[p] = entra[p] as Quien;
  return salida;
}

/** Si un rol puede hacer algo, según cómo esté configurado. */
export function puede(permisos: Record<Permiso, Quien>, cual: Permiso, rol: string): boolean {
  if (rol === 'admin') return true;
  return permisos[cual] === 'gm' && rol === 'grandmaster';
}
