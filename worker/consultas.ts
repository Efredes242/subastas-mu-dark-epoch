import { googleConfigurado } from './google';
import {
  comoHora,
  HORARIO_POR_DEFECTO,
  type Horario,
  proximaCorrida,
  ventanaVigente,
} from './horarios';
import type { Env, Estado, FilaCatalogo, FilaEvento, FilaItem, FilaUsuario, ItemPublico } from './types';

interface FilaAjustes {
  horas: string;
  offset_servidor: number;
  abre_antes_min: number;
  pin_antes_min: number;
  cierra_despues_min: number;
  cierra_registro_antes_min: number;
}

/** El horario que fijó el admin. Si todavía no hay fila, vale el de siempre. */
export async function leerHorario(db: D1Database): Promise<Horario> {
  const fila = await db.prepare('SELECT * FROM ajustes WHERE id = 1').first<FilaAjustes>();
  if (!fila) return HORARIO_POR_DEFECTO;

  const minutos = fila.horas
    .split(',')
    .map((m) => Number(m.trim()))
    .filter((m) => Number.isFinite(m))
    .sort((a, b) => a - b);

  return {
    minutos: minutos.length > 0 ? minutos : HORARIO_POR_DEFECTO.minutos,
    offsetServidor: fila.offset_servidor,
    abreAntesMin: fila.abre_antes_min,
    pinAntesMin: fila.pin_antes_min,
    cierraDespuesMin: fila.cierra_despues_min,
    cierraRegistroAntesMin: fila.cierra_registro_antes_min,
  };
}

/** El Kundun en curso: el último evento sin cerrar. */
export function eventoActivo(db: D1Database) {
  return db.prepare('SELECT * FROM eventos WHERE cerrado = 0 ORDER BY id DESC LIMIT 1').first<FilaEvento>();
}

const pinNuevo = () => String(Math.floor(1000 + Math.random() * 9000));

/** Las fechas se guardan en UTC. Si a alguna le falta la Z, se la ponemos antes de comparar. */
export const enMilis = (iso: string): number =>
  new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z').getTime();

/**
 * Cierra los Kundun a los que se les pasó la hora.
 *
 * Antes un evento quedaba abierto —con el PIN a la vista— hasta que se abría el siguiente,
 * ocho horas después. Los Kundun de prueba quedan afuera: los termina el admin a mano, y si
 * se cerraran solos desaparecería el botón para borrarlos.
 */
export async function cerrarVencidos(db: D1Database, ahora: Date): Promise<number> {
  const r = await db
    .prepare(
      `UPDATE eventos SET cerrado = 1, registro_abierto = 0
        WHERE cerrado = 0 AND es_prueba = 0 AND cierra_en IS NOT NULL AND cierra_en < ?`,
    )
    .bind(ahora.toISOString())
    .run();
  return r.meta.changes ?? 0;
}

/**
 * El Kundun cae siempre a la misma hora, así que el evento se crea solo al entrar en su ventana.
 * Es idempotente: el índice único sobre `clave` impide que dos visitas simultáneas creen dos.
 * Si el admin cerró a mano el evento de esta ventana, no se vuelve a crear.
 */
export async function asegurarEvento(db: D1Database, ahora: Date, horario: Horario): Promise<FilaEvento | null> {
  await cerrarVencidos(db, ahora);

  const activo = await eventoActivo(db);
  const ventana = ventanaVigente(ahora, horario);
  if (!ventana) return activo;
  if (activo && activo.clave === ventana.clave) return activo;

  const yaHubo = await db.prepare('SELECT * FROM eventos WHERE clave = ?').bind(ventana.clave).first<FilaEvento>();
  if (yaHubo) return yaHubo.cerrado === 1 ? activo : yaHubo;

  const ultimo = await db.prepare('SELECT MAX(numero) AS n FROM eventos').first<{ n: number | null }>();

  await db.prepare('UPDATE eventos SET cerrado = 1, registro_abierto = 0 WHERE cerrado = 0').run();
  await db
    .prepare(
      `INSERT INTO eventos (numero, sala, pin, registro_abierto, clave, abre_en, pin_desde, empieza_en, registro_hasta, cierra_en)
       VALUES (?, '', ?, 1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(clave) WHERE clave IS NOT NULL DO NOTHING`,
    )
    .bind(
      (ultimo?.n ?? 0) + 1,
      pinNuevo(),
      ventana.clave,
      ventana.abre.toISOString(),
      ventana.pinDesde.toISOString(),
      ventana.empieza.toISOString(),
      ventana.registroHasta.toISOString(),
      ventana.cierra.toISOString(),
    )
    .run();

  return db.prepare('SELECT * FROM eventos WHERE clave = ?').bind(ventana.clave).first<FilaEvento>();
}

/**
 * El orden de prioridad del gremio.
 * `orden` es la posición que fija el admin; el PC desempata y ordena a los que todavía no tienen.
 */
export async function ordenDePrioridad(db: D1Database): Promise<FilaUsuario[]> {
  const { results } = await db
    .prepare('SELECT * FROM usuarios WHERE activo = 1 ORDER BY orden ASC, pc DESC, id ASC')
    .all<FilaUsuario>();
  return results;
}

/** Reescribe la columna `orden` con 1..n según como quedó la lista. */
export async function guardarOrden(db: D1Database, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.batch(ids.map((id, i) => db.prepare('UPDATE usuarios SET orden = ? WHERE id = ?').bind(i + 1, id)));
}

export const etiquetaDe = (it: { nombre: string; copia: number; copias: number }) =>
  it.copias > 1 ? `${it.nombre} (${it.copia} de ${it.copias})` : it.nombre;

/** Quiénes estuvieron en el Kundun. Los marca el admin desde el panel. */
export async function presentesDe(db: D1Database, eventoId: number): Promise<Set<number>> {
  const { results } = await db
    .prepare('SELECT usuario_id FROM asistencias WHERE evento_id = ?')
    .bind(eventoId)
    .all<{ usuario_id: number }>();
  return new Set(results.map((a) => a.usuario_id));
}

export type Cola = 'items' | 'almas' | 'asedio';
export const COLAS: Cola[] = ['items', 'almas', 'asedio'];
export const NOMBRE_COLA: Record<Cola, string> = {
  items: 'Items del Kundun',
  almas: 'Almas de guerra',
  asedio: 'Castle Siege',
};

/** Quiénes participan en cada lista, tal como los armó el admin. */
export async function participantesDe(db: D1Database): Promise<Record<string, Set<number>>> {
  const { results } = await db
    .prepare('SELECT cola, usuario_id FROM participantes')
    .all<{ cola: string; usuario_id: number }>();

  const mapa: Record<string, Set<number>> = { items: new Set(), almas: new Set(), asedio: new Set() };
  for (const p of results) (mapa[p.cola] ??= new Set()).add(p.usuario_id);
  return mapa;
}

/** Los que dan la vuelta en una lista, en el orden del gremio. */
/** Lo que guarda SQLite viene sin zona; siempre es UTC. */
function enUtc(guardado: string): Date {
  return new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(guardado) ? guardado : guardado.replace(' ', 'T') + 'Z');
}

/** Los domingos se mezclan los drops del Kundun con los del Castle Siege. */
export function esDomingoEnElServidor(momento: Date, offsetServidor: number): boolean {
  return new Date(momento.getTime() + offsetServidor * 3_600_000).getUTCDay() === 0;
}

export function enLaRueda(usuarios: FilaUsuario[], cola: Cola, quienes: Record<string, Set<number>>): FilaUsuario[] {
  const conjunto = quienes[cola];
  return conjunto ? usuarios.filter((u) => conjunto.has(u.id)) : [];
}

/**
 * En qué listas sale cada item del catálogo. La CQC cae en el Kundun y en el asedio;
 * el Cofre de Asedio, solo en el asedio.
 */
export async function colasDeCatalogo(db: D1Database): Promise<Map<number, Cola[]>> {
  const { results } = await db
    .prepare('SELECT catalogo_id, cola FROM catalogo_colas')
    .all<{ catalogo_id: number; cola: string }>();

  const mapa = new Map<number, Cola[]>();
  for (const f of results) {
    if (!COLAS.includes(f.cola as Cola)) continue;
    const suyas = mapa.get(f.catalogo_id) ?? [];
    suyas.push(f.cola as Cola);
    mapa.set(f.catalogo_id, suyas);
  }
  // Siempre en el mismo orden: items, almas, asedio.
  for (const [id, suyas] of mapa) mapa.set(id, COLAS.filter((k) => suyas.includes(k)));
  return mapa;
}

/**
 * De qué lista sale un item cuando nadie fuerza nada.
 * El asedio queda último: solo manda si es lo único que tiene el item.
 */
export function colaPorDefecto(colas: Cola[] | undefined): Cola {
  return colas?.find((k) => k !== 'asedio') ?? colas?.[0] ?? 'items';
}

/** El último que cobró ESTE item EN ESTA lista. De ahí arranca su próxima vuelta. */
export async function turnoDe(db: D1Database, catalogoId: number, cola: Cola): Promise<number | null> {
  const fila = await db
    .prepare('SELECT usuario_id FROM turnos WHERE catalogo_id = ? AND cola = ?')
    .bind(catalogoId, cola)
    .first<{ usuario_id: number | null }>();
  return fila?.usuario_id ?? null;
}

export async function guardarTurno(
  db: D1Database,
  catalogoId: number,
  cola: Cola,
  usuarioId: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO turnos (catalogo_id, cola, usuario_id, actualizado_en)
       VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
       ON CONFLICT(catalogo_id, cola) DO UPDATE SET usuario_id = excluded.usuario_id, actualizado_en = excluded.actualizado_en`,
    )
    .bind(catalogoId, cola, usuarioId)
    .run();
}

/** Gira la lista de un item para que arranque en el que le toca. */
export function vueltaDesde(enRueda: FilaUsuario[], ultimoId: number | null): FilaUsuario[] {
  if (enRueda.length === 0) return [];
  const i = ultimoId === null ? -1 : enRueda.findIndex((u) => u.id === ultimoId);
  return [...enRueda.slice(i + 1), ...enRueda.slice(0, i + 1)];
}

/**
 * A quién le toca el próximo drop de una rueda.
 *
 * Arranca en el que sigue al último que cobró y da la vuelta. Al que no estuvo en el Kundun
 * lo saltea: pierde esa vuelta y tiene que esperar a que la rueda pase de nuevo por su nombre.
 * Devuelve null si ninguno de los que dan la vuelta estuvo presente.
 */
export function siguienteEnLaRueda(
  enRueda: FilaUsuario[],
  desde: number | null,
  presentes: Set<number>,
): { usuario: FilaUsuario; salteados: FilaUsuario[] } | null {
  if (enRueda.length === 0) return null;

  const ultimo = desde === null ? -1 : enRueda.findIndex((u) => u.id === desde);
  const salteados: FilaUsuario[] = [];

  for (let paso = 1; paso <= enRueda.length; paso++) {
    const candidato = enRueda[(ultimo + paso) % enRueda.length];
    // Sin nadie marcado todavía, entra el gremio entero.
    if (presentes.size === 0 || presentes.has(candidato.id)) {
      return { usuario: candidato, salteados };
    }
    salteados.push(candidato);
  }
  return null;
}

/**
 * A quién le toca ESTE item.
 *
 * Cada entrada del catálogo tiene su propia cuenta: se arranca en el que sigue al último
 * que se lo llevó y se saltea a los que no estuvieron en el Kundun.
 * Un item sin catálogo (cargado suelto) usa la lista de su tipo desde el principio.
 */
export async function elegirGanador(
  db: D1Database,
  item: FilaItem,
): Promise<{ id: number; personaje: string; catalogoId: number | null; cola: Cola; salteados: string[] } | null> {
  const cola: Cola = COLAS.includes(item.cola as Cola) ? (item.cola as Cola) : 'items';
  const presentes = await presentesDe(db, item.evento_id);
  const orden = await ordenDePrioridad(db);
  const enRueda = enLaRueda(orden, cola, await participantesDe(db));

  const ultimo = item.catalogo_id === null ? null : await turnoDe(db, item.catalogo_id, cola);
  const elegido = siguienteEnLaRueda(enRueda, ultimo, presentes);
  if (!elegido) return null;

  return {
    id: elegido.usuario.id,
    personaje: elegido.usuario.personaje,
    catalogoId: item.catalogo_id,
    cola,
    salteados: elegido.salteados.map((u) => u.personaje),
  };
}

function aPublico(
  it: FilaItem,
  quienes: number[],
  nombreDe: Map<number, string>,
  posicionDe: Map<number, number>,
  yoId: number | null,
  delCatalogo: Map<number, FilaCatalogo>,
): ItemPublico {
  const entrada = it.catalogo_id === null ? undefined : delCatalogo.get(it.catalogo_id);
  return {
    id: it.id,
    nombre: it.nombre,
    etiqueta: etiquetaDe(it),
    tipo: it.tipo,
    rareza: entrada?.rareza ?? it.rareza,
    icono: entrada?.icono ?? it.icono,
    imagen: entrada?.imagen ?? it.imagen,
    estado: it.estado,
    metodo: it.metodo,
    copia: it.copia,
    copias: it.copias,
    cola: it.cola,
    catalogoId: it.catalogo_id,
    duenoId: it.asignado_a,
    dueno: it.asignado_a === null ? null : (nombreDe.get(it.asignado_a) ?? null),
    duenoPosicion: it.asignado_a === null ? null : (posicionDe.get(it.asignado_a) ?? null),
    piden: quienes.length,
    loPedi: yoId !== null && quienes.includes(yoId),
  };
}

/** Todo lo que la UI necesita para pintar una pantalla, en una sola llamada. */
export async function construirEstado(env: Env, usuario: FilaUsuario | null, ahora = new Date()): Promise<Estado> {
  const db = env.DB;
  const horario = await leerHorario(db);
  const evento = await asegurarEvento(db, ahora, horario);
  const puedeVerPin = usuario?.rol === 'admin' || usuario?.rol === 'grandmaster';
  const pinDisponible = !!evento && (!evento.pin_desde || enMilis(evento.pin_desde) <= ahora.getTime());
  const yoId = usuario?.id ?? null;

  const orden = await ordenDePrioridad(db);
  const posicionDe = new Map(orden.map((u, i) => [u.id, i + 1]));
  const nombreDe = new Map(orden.map((u) => [u.id, u.personaje]));

  const { results: catalogo } = await db.prepare('SELECT * FROM catalogo ORDER BY nombre').all<FilaCatalogo>();
  const delCatalogo = new Map(catalogo.map((e) => [e.id, e]));

  let vinieron = new Set<number>();
  let items: ItemPublico[] = [];

  if (evento) {
    const asistencias = await db
      .prepare('SELECT usuario_id FROM asistencias WHERE evento_id = ?')
      .bind(evento.id)
      .all<{ usuario_id: number }>();
    vinieron = new Set(asistencias.results.map((a) => a.usuario_id));

    const filas = await db
      .prepare('SELECT * FROM items WHERE evento_id = ? ORDER BY id DESC')
      .bind(evento.id)
      .all<FilaItem>();

    const pedidos = await db
      .prepare(
        `SELECT p.item_id, p.usuario_id
           FROM pedidos p
           JOIN items i ON i.id = p.item_id
          WHERE i.evento_id = ?`,
      )
      .bind(evento.id)
      .all<{ item_id: number; usuario_id: number }>();

    const porItem = new Map<number, number[]>();
    for (const p of pedidos.results) {
      const lista = porItem.get(p.item_id);
      if (lista) lista.push(p.usuario_id);
      else porItem.set(p.item_id, [p.usuario_id]);
    }

    items = filas.results.map((it) => aPublico(it, porItem.get(it.id) ?? [], nombreDe, posicionDe, yoId, delCatalogo));
  }

  // ── El Kundun anterior, para que todos vean quién se llevó qué ──────────────
  const previo = await db
    .prepare('SELECT * FROM eventos WHERE id <> ? AND es_prueba = 0 ORDER BY id DESC LIMIT 1')
    .bind(evento?.id ?? 0)
    .first<FilaEvento>();

  let anterior: Estado['anterior'] = null;
  if (previo) {
    const filas = await db
      .prepare('SELECT * FROM items WHERE evento_id = ? ORDER BY asignado_a IS NULL, id ASC')
      .bind(previo.id)
      .all<FilaItem>();
    const cuantos = await db
      .prepare('SELECT COUNT(*) AS n FROM asistencias WHERE evento_id = ?')
      .bind(previo.id)
      .first<{ n: number }>();

    anterior = {
      id: previo.id,
      numero: previo.numero,
      fecha: previo.empieza_en ?? previo.creado_en,
      participantes: cuantos?.n ?? 0,
      items: filas.results.map((it) => {
        const entrada = it.catalogo_id === null ? undefined : delCatalogo.get(it.catalogo_id);
        return {
          id: it.id,
          etiqueta: etiquetaDe(it),
          rareza: entrada?.rareza ?? it.rareza,
          icono: entrada?.icono ?? it.icono,
          imagen: entrada?.imagen ?? it.imagen,
          dueno: it.asignado_a === null ? null : (nombreDe.get(it.asignado_a) ?? null),
          estado: it.estado,
        };
      }),
    };
  }

  // El historial es público: la pantalla del gremio no tiene login.
  const historial = await db
        .prepare(
          `SELECT e.id, e.numero, COALESCE(e.empieza_en, e.creado_en) AS fecha,
                  (SELECT COUNT(*) FROM asistencias a WHERE a.evento_id = e.id) AS participantes,
                  (SELECT COUNT(*) FROM items i WHERE i.evento_id = e.id) AS items,
                  (SELECT COUNT(*) FROM asistencias a WHERE a.evento_id = e.id AND a.usuario_id = ?) AS estuve,
                  (SELECT group_concat(i.nombre, ' · ') FROM items i
                    WHERE i.evento_id = e.id AND i.asignado_a = ?) AS miItem
             FROM eventos e
            WHERE e.cerrado = 1 AND e.es_prueba = 0
            ORDER BY e.id DESC
            LIMIT 12`,
        )
    .bind(yoId ?? 0, yoId ?? 0)
    .all<{
      id: number;
      numero: number;
      fecha: string;
      participantes: number;
      items: number;
      estuve: number;
      miItem: string | null;
    }>();

  // Qué salió en cada uno de esos Kundun. Sin la imagen: la pone el tablero desde el catálogo.
  const dropsPorEvento = new Map<number, Estado['historial'][number]['drops']>();
  if (historial.results.length > 0) {
    const ids = historial.results.map((h) => h.id);
    const { results: viejos } = await db
      .prepare(
        `SELECT id, evento_id, nombre, rareza, icono, catalogo_id, cola, copia, copias, asignado_a
           FROM items
          WHERE evento_id IN (${ids.map(() => '?').join(', ')})
          ORDER BY asignado_a IS NULL, id ASC`,
      )
      .bind(...ids)
      .all<FilaItem>();

    for (const it of viejos) {
      const entrada = it.catalogo_id === null ? undefined : delCatalogo.get(it.catalogo_id);
      const lista = dropsPorEvento.get(it.evento_id) ?? [];
      lista.push({
        id: it.id,
        etiqueta: etiquetaDe(it),
        rareza: entrada?.rareza ?? it.rareza,
        icono: entrada?.icono ?? it.icono,
        catalogoId: it.catalogo_id,
        cola: it.cola,
        dueno: it.asignado_a === null ? null : (nombreDe.get(it.asignado_a) ?? null),
      });
      dropsPorEvento.set(it.evento_id, lista);
    }
  }

  // A quién le toca cada item del catálogo, con su vuelta girada desde ahí.
  // Es lo que el gremio consulta: el turno de la CQC no es el mismo que el de la Pluma.

  const quienes = await participantesDe(db);
  const colasDe = await colasDeCatalogo(db);
  const turnos: Estado['turnos'] = [];

  for (const entrada of catalogo) {
    for (const cola of colasDe.get(entrada.id) ?? []) {
      const vuelta = vueltaDesde(enLaRueda(orden, cola, quienes), await turnoDe(db, entrada.id, cola));
      const suyos = items.filter((i) => i.catalogoId === entrada.id && i.cola === cola);

      turnos.push({
        catalogoId: entrada.id,
        nombre: entrada.nombre,
        icono: entrada.icono,
        imagen: entrada.imagen,
        rareza: entrada.rareza,
        cola,
        salieron: suyos.length,
        vuelta: vuelta.map((u) => ({
          id: u.id,
          personaje: u.personaje,
          vino: vinieron.has(u.id),
          seLlevo: suyos.filter((i) => i.duenoId === u.id).length,
        })),
      });
    }
  }

  const proximo = proximaCorrida(ahora, horario);

  return {
    yo: usuario
      ? {
          id: usuario.id,
          usuario: usuario.usuario,
          personaje: usuario.personaje,
          rol: usuario.rol,
          pc: usuario.pc,
          email: usuario.email,
          avatar: usuario.avatar,
          zona: usuario.zona,
        }
      : null,
    googleActivo: googleConfigurado(env),
    agenda: {
      horasServidor: horario.minutos.map(comoHora),
      offsetServidorHoras: horario.offsetServidor,
      abreAntesMin: horario.abreAntesMin,
      pinAntesMin: horario.pinAntesMin,
      cierraDespuesMin: horario.cierraDespuesMin,
      cierraRegistroAntesMin: horario.cierraRegistroAntesMin,
      // El Kundun de las 21 termina de repartirse ya entrado el lunes en el servidor, así que
      // el domingo lo decide el evento en curso, no el reloj.
      esDomingo: esDomingoEnElServidor(evento?.empieza_en ? enUtc(evento.empieza_en) : ahora, horario.offsetServidor),
      proximo: {
        abre: proximo.abre.toISOString(),
        pinDesde: proximo.pinDesde.toISOString(),
        empieza: proximo.empieza.toISOString(),
        registroHasta: proximo.registroHasta.toISOString(),
        cierra: proximo.cierra.toISOString(),
      },
    },
    evento: evento
      ? {
          id: evento.id,
          numero: evento.numero,
          sala: evento.sala,
          registroAbierto: evento.registro_abierto === 1,
          cerrado: evento.cerrado === 1,
          cierraEn: evento.cierra_en,
          registroHasta: evento.registro_hasta,
          registroVigente:
            evento.registro_abierto === 1 &&
            evento.cerrado === 0 &&
            pinDisponible &&
            (!evento.registro_hasta || enMilis(evento.registro_hasta) > ahora.getTime()),
          pinDesde: evento.pin_desde,
          pinDisponible,
          empiezaEn: evento.empieza_en,
          abreEn: evento.abre_en,
          repartoEn: evento.reparto_en,
          creadoEn: evento.creado_en,
          esPrueba: evento.es_prueba === 1,
          ...(puedeVerPin && pinDisponible ? { pin: evento.pin } : {}),
        }
      : null,
    anotado: yoId !== null && vinieron.has(yoId),
    meTocaPujar: yoId === null ? [] : items.filter((i) => i.duenoId === yoId),
    orden: orden.map((u, i) => ({
      id: u.id,
      personaje: u.personaje,
      pc: u.pc,
      posicion: i + 1,
      vino: vinieron.has(u.id),
      listas: COLAS.filter((cola) => quienes[cola]?.has(u.id)),
    })),
    items,
    turnos,
    anterior,
    historial: historial.results.map((h) => ({
      id: h.id,
      numero: h.numero,
      fecha: h.fecha,
      participantes: h.participantes,
      items: h.items,
      estuve: h.estuve > 0,
      miItem: h.miItem,
      drops: dropsPorEvento.get(h.id) ?? [],
    })),
  };
}
