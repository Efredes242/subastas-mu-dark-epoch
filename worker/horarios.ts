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
}

/** Lo que valía antes de que el horario fuera configurable. Sirve de red si falta la fila. */
export const HORARIO_POR_DEFECTO: Horario = {
  minutos: [13 * 60, 21 * 60],
  offsetServidor: -3,
  abreAntesMin: 15,
  pinAntesMin: 15,
  cierraDespuesMin: 20,
  cierraRegistroAntesMin: 5,
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
}

const corrida = (empieza: Date, h: Horario): Corrida => ({
  clave: empieza.toISOString().slice(0, 16) + 'Z',
  abre: new Date(empieza.getTime() - h.abreAntesMin * MIN),
  pinDesde: new Date(empieza.getTime() - h.pinAntesMin * MIN),
  empieza,
  // Si el corte se pasa del cierre, anotarse termina cuando arranca el Kundun.
  registroHasta: new Date(
    empieza.getTime() + Math.max(h.cierraDespuesMin - h.cierraRegistroAntesMin, 0) * MIN,
  ),
  cierra: new Date(empieza.getTime() + h.cierraDespuesMin * MIN),
});

/**
 * Las corridas de ayer, hoy y mañana. Con tres días alcanza para cualquier ventana que
 * cruce la medianoche, venga del huso que venga.
 */
function cercanas(ahora: Date, h: Horario): Corrida[] {
  const salida: Corrida[] = [];
  for (const dia of [-1, 0, 1]) {
    const base = new Date(ahora.getTime() + dia * DIA * MIN);
    const medianoche = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
    for (const minutos of h.minutos) {
      // El horario está en hora del servidor: restarle su offset lo lleva a UTC.
      salida.push(corrida(new Date(medianoche + (minutos - h.offsetServidor * 60) * MIN), h));
    }
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
