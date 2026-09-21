/**
 * Los pedidos de ingreso.
 *
 * Alguien entra con Google, Google confirma quién es, pero el gremio no lo tiene cargado. Antes
 * ahí se terminaba todo. Ahora queda un pedido y el admin decide: aceptar o rechazar.
 *
 * Lo que NO cambia es quién decide. Confirmar una identidad y autorizar un ingreso son dos cosas
 * distintas: Google hace la primera y el admin sigue haciendo la segunda. Pedir no abre ninguna
 * puerta.
 */

/** Un pedido, como lo ve el panel. */
export interface PedidoDeIngreso {
  id: number;
  email: string;
  /** El nombre de la cuenta de Google. Lo único que sabemos antes de aceptar a alguien. */
  nombre: string;
  avatar: string | null;
  estado: 'pendiente' | 'rechazado';
  pedidoEn: string;
  /** Cuántas veces lo intentó. Sirve para ver quién está esperando de verdad. */
  intentos: number;
}

export interface FilaPedido {
  id: number;
  email: string;
  google_sub: string;
  nombre: string;
  avatar: string | null;
  estado: string;
  pedido_en: string;
  intentos: number;
}

export const comoPedido = (f: FilaPedido): PedidoDeIngreso => ({
  id: f.id,
  email: f.email,
  nombre: f.nombre,
  avatar: f.avatar,
  estado: f.estado === 'rechazado' ? 'rechazado' : 'pendiente',
  pedidoEn: f.pedido_en,
  intentos: f.intentos,
});

/**
 * Un nombre de usuario a partir del mail, para proponerlo en el alta.
 *
 * Es solo la propuesta que el panel muestra en el formulario; el admin la cambia si quiere. La
 * columna es única, así que quien da el alta tiene que resolver los choques — de eso se encarga
 * `usuarioLibre`.
 */
export function usuarioSugerido(email: string): string {
  const base = (email.split('@')[0] ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 40);
  return base || 'jugador';
}

/**
 * El primer nombre de usuario libre a partir de uno propuesto.
 *
 * Si `pedro` está tomado prueba `pedro2`, `pedro3`, y así. Con veinte intentos alcanza y sobra
 * para un gremio; si se agotaran, devuelve uno con la hora pegada, que no va a chocar con nada.
 */
export async function usuarioLibre(db: D1Database, propuesto: string): Promise<string> {
  const base = usuarioSugerido(propuesto.includes('@') ? propuesto : `${propuesto}@x`);
  for (let i = 1; i <= 20; i++) {
    const intento = i === 1 ? base : `${base}${i}`;
    const tomado = await db.prepare('SELECT 1 FROM usuarios WHERE lower(usuario) = ?').bind(intento).first();
    if (!tomado) return intento;
  }
  return `${base}${Date.now().toString(36)}`;
}
