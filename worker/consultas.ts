import { comoClases, type FilaClase } from './clases';
import { googleConfigurado } from './google';
import { leerInterfaz, leerPermisos, type Escondido, type Permiso, type Quien } from './interfaz';
import {
  asedioDelDia,
  comoHora,
  HORARIO_POR_DEFECTO,
  type Horario,
  leerGuardadas,
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
  asedio_minutos: number | null;
  asedio_dura_min: number | null;
  asedio_premio_min: number | null;
  cartel_sin_kundun: number | null;
  interfaz: string | null;
  permisos: string | null;
}

export interface Ajustes {
  horario: Horario;
  /** Qué pedazos de la app están escondidos y para quién. */
  interfaz: Record<string, Escondido>;
  /** Quién puede tocar lo que cambia las reglas del reparto. */
  permisos: Record<Permiso, Quien>;
}

/**
 * Todo lo que el admin configuró, de un solo viaje: son una sola fila.
 */
export async function leerAjustes(db: D1Database): Promise<Ajustes> {
  const fila = await db.prepare('SELECT * FROM ajustes WHERE id = 1').first<FilaAjustes>();
  return {
    horario: comoHorario(fila),
    interfaz: leerInterfaz(fila?.interfaz ?? null),
    permisos: leerPermisos(fila?.permisos ?? null),
  };
}

/** El horario que fijó el admin. Si todavía no hay fila, vale el de siempre. */
export async function leerHorario(db: D1Database): Promise<Horario> {
  return comoHorario(await db.prepare('SELECT * FROM ajustes WHERE id = 1').first<FilaAjustes>());
}

function comoHorario(fila: FilaAjustes | null): Horario {
  if (!fila) return HORARIO_POR_DEFECTO;

  const franjas = leerGuardadas(fila.horas, HORARIO_POR_DEFECTO.franjas[0]);

  return {
    franjas: franjas.length > 0 ? franjas : HORARIO_POR_DEFECTO.franjas,
    offsetServidor: fila.offset_servidor,
    abreAntesMin: fila.abre_antes_min,
    pinAntesMin: fila.pin_antes_min,
    cierraRegistroAntesMin: fila.cierra_registro_antes_min,
    asedio: {
      minutos: fila.asedio_minutos ?? HORARIO_POR_DEFECTO.asedio.minutos,
      duraMin: fila.asedio_dura_min ?? HORARIO_POR_DEFECTO.asedio.duraMin,
      premioMin: fila.asedio_premio_min ?? HORARIO_POR_DEFECTO.asedio.premioMin,
    },
    mostrarCartel: (fila.cartel_sin_kundun ?? 1) === 1,
  };
}

/**
 * Desde cuándo se pueden cargar los drops del asedio del evento en curso.
 *
 * El drop del asedio aparece más tarde que el del Kundun, así que hasta esa hora no hay nada
 * que cargar y el cuadro queda apagado. null significa "ya": las pruebas, que están para
 * ensayar el circuito entero, y cualquier evento que ya pasó la hora.
 */
function asedioDesde(evento: FilaEvento | null, horario: Horario, ahora: Date): string | null {
  if (!evento || evento.es_prueba === 1) return null;
  const suyo = asedioDelDia(evento.empieza_en ? enUtc(evento.empieza_en) : ahora, horario);
  // Lo que importa no es cuándo arranca el asedio, sino cuándo cae su drop: antes de eso no
  // hay nada que cargar.
  if (!suyo || suyo.premios.getTime() <= ahora.getTime()) return null;
  return suyo.premios.toISOString();
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
export function agruparParticipantes(filas: { cola: string; usuario_id: number }[]): Record<string, Set<number>> {
  const mapa: Record<string, Set<number>> = { items: new Set(), almas: new Set(), asedio: new Set() };
  for (const p of filas) (mapa[p.cola] ??= new Set()).add(p.usuario_id);
  return mapa;
}

export async function participantesDe(db: D1Database): Promise<Record<string, Set<number>>> {
  const { results } = await db
    .prepare('SELECT cola, usuario_id FROM participantes')
    .all<{ cola: string; usuario_id: number }>();
  return agruparParticipantes(results);
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
export function agruparColas(filas: { catalogo_id: number; cola: string }[]): Map<number, Cola[]> {
  const results = filas;
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

export async function colasDeCatalogo(db: D1Database): Promise<Map<number, Cola[]>> {
  const { results } = await db
    .prepare('SELECT catalogo_id, cola FROM catalogo_colas')
    .all<{ catalogo_id: number; cola: string }>();
  return agruparColas(results);
}

/**
 * De qué lista sale un item cuando nadie fuerza nada.
 * El asedio queda último: solo manda si es lo único que tiene el item.
 */
export function colaPorDefecto(colas: Cola[] | undefined): Cola {
  return colas?.find((k) => k !== 'asedio') ?? colas?.[0] ?? 'items';
}

/**
 * Todos los turnos de una, para armar el estado.
 *
 * Antes esto era una consulta por rueda adentro de un bucle anidado: con cinco items en dos
 * listas cada uno eran nueve viajes a la base cada vez que alguien tocaba algo, y crece con el
 * catálogo. La clave del mapa es "catalogoId|cola".
 */
export function agruparTurnos(
  filas: { catalogo_id: number; cola: string; usuario_id: number | null }[],
): Map<string, number | null> {
  return new Map(filas.map((t) => [`${t.catalogo_id}|${t.cola}`, t.usuario_id]));
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
  const ajustes = await leerAjustes(db);
  const horario = ajustes.horario;
  const evento = await asegurarEvento(db, ahora, horario);
  const yoId = usuario?.id ?? null;
  const eventoId = evento?.id ?? 0;

  /**
   * Todo lo que no depende de nada más, en un solo viaje.
   *
   * En producción cada consulta es una ida y vuelta del Worker a D1: hacerlas en fila ponía
   * `/api/estado` en tres segundos, y el tablero lo pide cada ocho. Agrupadas es un viaje.
   */
  const [
    ordenR,
    catalogoR,
    asistenciasR,
    itemsR,
    pedidosR,
    previoR,
    participantesR,
    colasR,
    turnosR,
    clasesR,
    historialR,
  ] = await db.batch([
    db.prepare('SELECT * FROM usuarios WHERE activo = 1 ORDER BY orden ASC, pc DESC, id ASC'),
    db.prepare('SELECT * FROM catalogo ORDER BY nombre'),
    db.prepare('SELECT usuario_id FROM asistencias WHERE evento_id = ?').bind(eventoId),
    db.prepare('SELECT * FROM items WHERE evento_id = ? ORDER BY id DESC').bind(eventoId),
    db
      .prepare(
        `SELECT p.item_id, p.usuario_id
           FROM pedidos p
           JOIN items i ON i.id = p.item_id
          WHERE i.evento_id = ?`,
      )
      .bind(eventoId),
    db.prepare('SELECT * FROM eventos WHERE id <> ? AND es_prueba = 0 ORDER BY id DESC LIMIT 1').bind(eventoId),
    db.prepare('SELECT cola, usuario_id FROM participantes'),
    db.prepare('SELECT catalogo_id, cola FROM catalogo_colas'),
    db.prepare('SELECT catalogo_id, cola, usuario_id FROM turnos'),
    db.prepare('SELECT codigo, nombre, imagen, orden FROM clases ORDER BY orden ASC, codigo ASC'),
    db
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
      .bind(yoId ?? 0, yoId ?? 0),
  ]);

  const orden = ordenR.results as FilaUsuario[];
  const posicionDe = new Map(orden.map((u, i) => [u.id, i + 1]));
  const nombreDe = new Map(orden.map((u) => [u.id, u.personaje]));

  const catalogo = catalogoR.results as FilaCatalogo[];
  const delCatalogo = new Map(catalogo.map((e) => [e.id, e]));

  let vinieron = new Set<number>();
  let items: ItemPublico[] = [];

  if (evento) {
    vinieron = new Set((asistenciasR.results as { usuario_id: number }[]).map((a) => a.usuario_id));

    const porItem = new Map<number, number[]>();
    for (const p of pedidosR.results as { item_id: number; usuario_id: number }[]) {
      const lista = porItem.get(p.item_id);
      if (lista) lista.push(p.usuario_id);
      else porItem.set(p.item_id, [p.usuario_id]);
    }

    items = (itemsR.results as FilaItem[]).map((it) =>
      aPublico(it, porItem.get(it.id) ?? [], nombreDe, posicionDe, yoId, delCatalogo),
    );
  }

  // ── El Kundun anterior, para que todos vean quién se llevó qué ──────────────
  const previo = (previoR.results as FilaEvento[])[0] ?? null;

  // El historial es público: la pantalla del gremio no tiene login. Ya vino en el batch.
  const historial = historialR as unknown as {
    results: {
      id: number;
      numero: number;
      fecha: string;
      participantes: number;
      items: number;
      estuve: number;
      miItem: string | null;
    }[];
  };

  /**
   * Lo último que falta, también en un solo viaje: los drops del Kundun anterior, cuánta gente
   * hubo en él y qué salió en cada Kundun del historial.
   */
  const idsHistorial = historial.results.map((h) => h.id);
  const [itemsPrevioR, cuantosPrevioR, dropsViejosR] = await db.batch([
    db.prepare('SELECT * FROM items WHERE evento_id = ? ORDER BY asignado_a IS NULL, id ASC').bind(previo?.id ?? 0),
    db.prepare('SELECT COUNT(*) AS n FROM asistencias WHERE evento_id = ?').bind(previo?.id ?? 0),
    db.prepare(
      `SELECT id, evento_id, nombre, rareza, icono, catalogo_id, cola, copia, copias, asignado_a
         FROM items
        WHERE evento_id IN (${idsHistorial.length > 0 ? idsHistorial.map(() => '?').join(', ') : 'NULL'})
        ORDER BY asignado_a IS NULL, id ASC`,
    ).bind(...idsHistorial),
  ]);

  let anterior: Estado['anterior'] = null;
  if (previo) {
    const filas = { results: itemsPrevioR.results as FilaItem[] };
    const cuantos = (cuantosPrevioR.results as { n: number }[])[0];

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

  // Qué salió en cada uno de esos Kundun. Sin la imagen: la pone el tablero desde el catálogo.
  const dropsPorEvento = new Map<number, Estado['historial'][number]['drops']>();
  {
    for (const it of dropsViejosR.results as FilaItem[]) {
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

  const quienes = agruparParticipantes(participantesR.results as { cola: string; usuario_id: number }[]);
  const colasDe = agruparColas(colasR.results as { catalogo_id: number; cola: string }[]);
  const ultimos = agruparTurnos(turnosR.results as { catalogo_id: number; cola: string; usuario_id: number | null }[]);
  const turnos: Estado['turnos'] = [];

  for (const entrada of catalogo) {
    for (const cola of colasDe.get(entrada.id) ?? []) {
      const vuelta = vueltaDesde(enLaRueda(orden, cola, quienes), ultimos.get(`${entrada.id}|${cola}`) ?? null);
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
          clase: u.clase,
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
    interfaz: ajustes.interfaz,
    permisos: ajustes.permisos,
    agenda: {
      horasServidor: horario.franjas.map((f) => comoHora(f.minutos)),
      franjas: horario.franjas.map((f) => ({
        hora: comoHora(f.minutos),
        duraMin: f.duraMin,
        premioMin: f.premioMin,
        premiosHora: comoHora(f.minutos + f.duraMin),
      })),
      offsetServidorHoras: horario.offsetServidor,
      abreAntesMin: horario.abreAntesMin,
      mostrarCartel: horario.mostrarCartel,
      // El Kundun de las 21 termina de repartirse ya entrado el lunes en el servidor, así que
      // el domingo lo decide el evento en curso, no el reloj.
      esDomingo:
        evento?.forzar_domingo === 1 ||
        esDomingoEnElServidor(evento?.empieza_en ? enUtc(evento.empieza_en) : ahora, horario.offsetServidor),
      asedio: {
        hora: comoHora(horario.asedio.minutos),
        duraMin: horario.asedio.duraMin,
        premioMin: horario.asedio.premioMin,
        premiosHora: comoHora(horario.asedio.minutos + horario.asedio.duraMin),
        desde: asedioDesde(evento, horario, ahora),
      },
      proximo: {
        abre: proximo.abre.toISOString(),
        empieza: proximo.empieza.toISOString(),
        premios: proximo.premios.toISOString(),
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
          asistenciaLista: evento.asistencia_lista === 1,
          empiezaEn: evento.empieza_en,
          abreEn: evento.abre_en,
          repartoEn: evento.reparto_en,
          creadoEn: evento.creado_en,
          esPrueba: evento.es_prueba === 1,
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
      clase: u.clase,
      listas: COLAS.filter((cola) => quienes[cola]?.has(u.id)),
    })),
    items,
    turnos,
    anterior,
    clases: comoClases(clasesR.results as FilaClase[]),
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
