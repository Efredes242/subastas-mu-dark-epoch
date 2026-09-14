/**
 * Los avisos que el gremio recibe antes de cada evento.
 *
 * Un aviso es: un evento con nombre propio (el Kundun, el asedio, lo que venga), los días y las
 * horas en que cae, cuánto antes hay que recordarlo, y el texto que se manda. El texto lleva
 * marcas entre llaves que se reemplazan al mandarlo: así un solo texto sirve para el aviso de
 * una hora antes y para el de cinco minutos.
 *
 * Todavía no se manda a ningún lado: acá está la configuración y el texto ya armado, para poder
 * verlo y corregirlo antes de colgarlo de un bot.
 */

const MIN = 60_000;
const DIA_MIN = 1440;

/** El recordatorio más temprano que tiene sentido. Más de una hora antes nadie lo registra. */
export const ANTES_MAXIMO = 60;

export interface Aviso {
  id: number;
  /** Cómo se llama el evento en el aviso: "Kundun", "Asedio al castillo". */
  nombre: string;
  /** Días de la semana en que cae, 0 = domingo. Vacío = ninguno, o sea apagado de hecho. */
  dias: number[];
  /** Horas del servidor, en minutos desde medianoche. */
  horas: number[];
  /** Cuánto antes avisar, en minutos. 60 = una hora antes. Ordenados de mayor a menor. */
  antes: number[];
  /** El texto que se manda, con marcas entre llaves. */
  mensaje: string;
  activo: boolean;
}

export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Las marcas que se pueden usar en el texto. El panel las lista y el simulador las reemplaza,
 * así que agregar una acá la hace visible en los dos lados.
 */
export const MARCAS: Array<[string, string]> = [
  ['{evento}', 'El nombre del evento'],
  ['{hora}', 'A qué hora arranca, en hora del servidor'],
  ['{falta}', 'Cuánto falta: "1 hora", "30 minutos"'],
  ['{dia}', 'Qué día cae: "hoy", "mañana", "el domingo"'],
];

/** "1 hora", "30 minutos", "1 minuto". */
export function comoFalta(minutos: number): string {
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    const enHoras = `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    return resto === 0 ? enHoras : `${enHoras} y ${resto} min`;
  }
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}

/** 780 → "13:00". */
export function comoHora(minutos: number): string {
  const m = ((minutos % DIA_MIN) + DIA_MIN) % DIA_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * El texto final, con las marcas reemplazadas.
 *
 * Lo que no se entienda queda tal cual: si alguien escribe {loquesea} se manda así y se ve el
 * error en el simulador, que es justamente para eso.
 */
export function armarMensaje(
  plantilla: string,
  datos: { evento: string; hora: number; antes: number; dia?: string },
): string {
  return plantilla
    .replace(/\{evento\}/g, datos.evento)
    .replace(/\{hora\}/g, comoHora(datos.hora))
    .replace(/\{falta\}/g, comoFalta(datos.antes))
    .replace(/\{dia\}/g, datos.dia ?? 'hoy');
}

/** El texto de fábrica, para un evento recién creado o para el que quiere empezar de nuevo. */
export function mensajePorDefecto(nombre: string): string {
  return `⚔️ *${nombre || 'El evento'}* en {falta}\n\nArranca {dia} a las {hora} hora del servidor. Prepárense.`;
}

// ── Cómo se guarda ───────────────────────────────────────────────────────────

export interface FilaAviso {
  id: number;
  nombre: string;
  dias: string;
  horas: string;
  antes: string;
  mensaje: string;
  activo: number;
  orden: number;
}

const numeros = (crudo: string): number[] =>
  crudo
    .split(',')
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));

export function comoAviso(fila: FilaAviso): Aviso {
  return {
    id: fila.id,
    nombre: fila.nombre,
    dias: [...new Set(numeros(fila.dias).filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b),
    horas: [...new Set(numeros(fila.horas).filter((h) => h >= 0 && h < DIA_MIN))].sort((a, b) => a - b),
    antes: [...new Set(numeros(fila.antes).filter((a) => a >= 1 && a <= ANTES_MAXIMO))].sort((a, b) => b - a),
    mensaje: fila.mensaje,
    activo: fila.activo === 1,
  };
}

/** Lo que llega del panel, limpio. Devuelve null si no se entiende algo que no se puede inventar. */
export function leerAviso(crudo: unknown): Omit<Aviso, 'id'> | null {
  const x = (crudo ?? {}) as Record<string, unknown>;

  const nombre = typeof x.nombre === 'string' ? x.nombre.trim().slice(0, 60) : '';
  if (nombre.length < 2) return null;

  const lista = (v: unknown, min: number, max: number) =>
    Array.isArray(v)
      ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= min && n <= max))]
      : [];

  const antes = lista(x.antes, 1, ANTES_MAXIMO).sort((a, b) => b - a);

  return {
    nombre,
    dias: lista(x.dias, 0, 6).sort((a, b) => a - b),
    horas: lista(x.horas, 0, DIA_MIN - 1).sort((a, b) => a - b),
    // Sin ningún recordatorio el aviso no existe: por lo menos uno, quince minutos antes.
    antes: antes.length > 0 ? antes : [15],
    mensaje: typeof x.mensaje === 'string' ? x.mensaje.slice(0, 1000) : mensajePorDefecto(nombre),
    activo: x.activo !== false,
  };
}

// ── Cuándo sale cada aviso ───────────────────────────────────────────────────

export interface Disparo {
  /** Cuándo se manda. */
  cuando: Date;
  /** A qué hora arranca el evento que se está anunciando. */
  empieza: Date;
  /** Cuántos minutos antes es este aviso. */
  antes: number;
  /** El texto ya armado. */
  texto: string;
}

/**
 * Los avisos que salen entre `desde` y `hasta`.
 *
 * Se miran los tres días alrededor porque un aviso de una hora antes de un evento de las 00:30
 * cae el día anterior, y el huso del servidor puede correr todo medio día.
 */
export function disparosEntre(
  aviso: Aviso,
  desde: Date,
  hasta: Date,
  offsetServidor: number,
): Disparo[] {
  if (!aviso.activo || aviso.dias.length === 0 || aviso.horas.length === 0) return [];

  const salida: Disparo[] = [];
  const hora = 3_600_000;

  for (const salto of [-1, 0, 1]) {
    const base = new Date(desde.getTime() + salto * DIA_MIN * MIN);
    const local = new Date(base.getTime() + offsetServidor * hora);
    const medianoche =
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetServidor * hora;
    const diaSemana = new Date(medianoche + offsetServidor * hora).getUTCDay();
    if (!aviso.dias.includes(diaSemana)) continue;

    for (const h of aviso.horas) {
      const empieza = new Date(medianoche + h * MIN);
      for (const antes of aviso.antes) {
        const cuando = new Date(empieza.getTime() - antes * MIN);
        if (cuando < desde || cuando > hasta) continue;
        salida.push({
          cuando,
          empieza,
          antes,
          texto: armarMensaje(aviso.mensaje, { evento: aviso.nombre, hora: h, antes }),
        });
      }
    }
  }

  return salida.sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
}
