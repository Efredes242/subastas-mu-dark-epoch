/**
 * A qué hora cae el Kundun.
 *
 * El horario lo fija el admin desde el panel (tabla `ajustes`), porque el servidor del juego
 * los cambia de vez en cuando. Acá adentro todo se calcula en UTC; la traducción a la hora de
 * cada uno la hace el navegador con su propia zona.
 *
 *   13:00 GMT-3 = 16:00 UTC     21:00 GMT-3 = 00:00 UTC del día siguiente
 */

const MIN = 60_000;
const DIA = 1440;

export interface Horario {
  /** Minutos desde medianoche, en hora del servidor. 13:00 → 780. */
  minutos: number[];
  /** Diferencia del servidor contra UTC, en horas. GMT-3 → -3. */
  offsetServidor: number;
  /** El registro abre estos minutos antes de la hora del Kundun. */
  abreAntesMin: number;
  /** El PIN recién aparece estos minutos antes, no cuando abre el registro. */
  pinAntesMin: number;
  /** Y el evento se cierra solo esto después de la hora del Kundun. */
  cierraDespuesMin: number;
  /** Anotarse corta esto antes del cierre, para que nadie entre con el reparto empezado. */
  cierraRegistroAntesMin: number;
  /** A qué hora del servidor cae el asedio al castillo, los domingos. 21:30 → 1290. */
  asedioMinutos: number;
  /** Cuánto queda el drop del asedio en la subasta del gremio antes de irse a la mundial. */
  asedioDuraMin: number;
}

/** Lo que valía antes de que el horario fuera configurable. Sirve de red si falta la fila. */
export const HORARIO_POR_DEFECTO: Horario = {
  minutos: [13 * 60, 20 * 60 + 45],
  offsetServidor: -3,
  abreAntesMin: 15,
  pinAntesMin: 15,
  cierraDespuesMin: 35,
  cierraRegistroAntesMin: 5,
  asedioMinutos: 21 * 60 + 30,
  asedioDuraMin: 40,
};

/** 780 → "13:00". */
export function comoHora(minutos: number): string {
  const m = ((minutos % DIA) + DIA) % DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "13:00", "13", "13.30", "1330" → 780. Devuelve null si no se entiende. */
export function leerHora(crudo: string): number | null {
  const t = crudo.trim();
  const m = t.match(/^(\d{1,2})\s*(?:[:.hH]\s*(\d{1,2}))?$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;

  const horas = Number(m[1]);
  const mins = m[2] === undefined ? 0 : Number(m[2]);
  if (horas > 23 || mins > 59) return null;
  return horas * 60 + mins;
}

/** "13:00, 21:00" → [780, 1260], ordenado y sin repetidos. */
export function leerHoras(crudo: string): number[] | null {
  const partes = crudo.split(/[\n,;/]+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0 || partes.length > 12) return null;

  const minutos = new Set<number>();
  for (const parte of partes) {
    const m = leerHora(parte);
    if (m === null) return null;
    minutos.add(m);
  }
  return [...minutos].sort((a, b) => a - b);
}

/** GMT-3 → "GMT-3". */
export function comoGmt(offsetHoras: number): string {
  return `GMT${offsetHoras >= 0 ? '+' : '−'}${Math.abs(offsetHoras)}`;
}

export interface Corrida {
  /** Identifica la corrida programada: "2026-09-01T16:00Z". Es única por horario. */
  clave: string;
  abre: Date;
  /** Desde cuándo se puede ver el PIN y anotarse de verdad. */
  pinDesde: Date;
  empieza: Date;
  /** Hasta cuándo se puede uno anotar. Siempre antes de `cierra`. */
  registroHasta: Date;
  cierra: Date;
  /**
   * Cuándo cae el asedio, si esta corrida es la que lo lleva colgado. Los domingos el drop del
   * asedio aparece más tarde que el del Kundun, mientras el del Kundun todavía está en el
   * gremio: se cargan en el mismo evento pero no al mismo tiempo.
   */
  asedio: Date | null;
}

const corrida = (empieza: Date, h: Horario, asedio: Date | null = null): Corrida => {
  // El evento tiene que seguir abierto hasta que el asedio termine: si cerrara antes, el que
  // está repartiendo los drops del asedio se queda sin evento a mitad de camino.
  const propio = empieza.getTime() + h.cierraDespuesMin * MIN;
  const conAsedio = asedio === null ? propio : Math.max(propio, asedio.getTime() + h.asedioDuraMin * MIN);

  return {
    clave: empieza.toISOString().slice(0, 16) + 'Z',
    abre: new Date(empieza.getTime() - h.abreAntesMin * MIN),
    pinDesde: new Date(empieza.getTime() - h.pinAntesMin * MIN),
    empieza,
    // Si el corte se pasa del cierre, anotarse termina cuando arranca el Kundun.
    registroHasta: new Date(Math.max(conAsedio - h.cierraRegistroAntesMin * MIN, empieza.getTime())),
    cierra: new Date(conAsedio),
    asedio,
  };
};

/** Medianoche, en hora del servidor, del día al que pertenece un momento. */
function medianocheServidor(momento: Date, offsetServidor: number): number {
  const local = new Date(momento.getTime() + offsetServidor * 3_600_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetServidor * 3_600_000;
}

/**
 * Cuándo cae el asedio del día al que pertenece `momento`, mire desde donde se mire.
 * Devuelve null si ese día no es domingo.
 */
export function asedioDelDia(momento: Date, h: Horario): Date | null {
  const medianoche = medianocheServidor(momento, h.offsetServidor);
  if (new Date(medianoche + h.offsetServidor * 3_600_000).getUTCDay() !== 0) return null;
  return new Date(medianoche + h.asedioMinutos * MIN);
}

/**
 * Las corridas de ayer, hoy y mañana. Con tres días alcanza para cualquier ventana que
 * cruce la medianoche, venga del huso que venga.
 */
function cercanas(ahora: Date, h: Horario): Corrida[] {
  const salida: Corrida[] = [];
  for (const dia of [-1, 0, 1]) {
    const base = new Date(ahora.getTime() + dia * DIA * MIN);
    const medianoche = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    // El horario está en hora del servidor: restarle su offset lo lleva a UTC.
    const empiezan = h.minutos.map((m) => new Date(medianoche + (m - h.offsetServidor * 60) * MIN));

    // El asedio se cuelga del último Kundun del domingo que arranca antes que él: es el que
    // sigue abierto cuando aparece el drop del asedio.
    const asedio = empiezan.length > 0 ? asedioDelDia(empiezan[0], h) : null;
    const conElAsedio =
      asedio === null
        ? -1
        : empiezan.reduce((mejor, e, i) => (e.getTime() <= asedio.getTime() ? i : mejor), -1);

    empiezan.forEach((empieza, i) => salida.push(corrida(empieza, h, i === conElAsedio ? asedio : null)));
  }
  return salida.sort((a, b) => a.empieza.getTime() - b.empieza.getTime());
}

/** La corrida cuya ventana de registro está abierta ahora mismo, si hay alguna. */
export function ventanaVigente(ahora: Date, h: Horario): Corrida | null {
  const t = ahora.getTime();
  return cercanas(ahora, h).find((c) => t >= c.abre.getTime() && t <= c.cierra.getTime()) ?? null;
}

/** La próxima corrida que todavía no empezó. Siempre existe. */
export function proximaCorrida(ahora: Date, h: Horario): Corrida {
  const t = ahora.getTime();
  const todas = cercanas(ahora, h);
  return todas.find((c) => c.empieza.getTime() > t) ?? todas[0];
}
