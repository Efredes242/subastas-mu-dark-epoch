/**
 * A qué hora cae el Kundun y hasta cuándo se pueden repartir sus drops.
 *
 * Cada corrida tiene dos tramos y no hay que confundirlos:
 *
 *   1. el evento en sí, del arranque hasta que muere el Kundun y cae el drop;
 *   2. las recompensas, que es cuando el drop está en la subasta del gremio y se puede repartir.
 *      Cuando ese tramo termina, lo que quedó sin repartir se va a la subasta mundial.
 *
 * El evento de la app se abre un rato antes del arranque y se cierra solo cuando terminan las
 * recompensas, que es lo último que hay para hacer. Los domingos, además, se le cuelga el asedio,
 * que tiene sus propios dos tramos y cae más tarde: ese día el evento se estira hasta el final de
 * las recompensas del asedio.
 *
 * Todo esto lo fija el admin desde el panel (tabla `ajustes`), porque el servidor del juego los
 * cambia de vez en cuando. Acá adentro se calcula en UTC; la traducción a la hora de cada uno la
 * hace el navegador con su propia zona.
 *
 *   13:00 GMT-3 = 16:00 UTC     20:45 GMT-3 = 23:45 UTC
 */

const MIN = 60_000;
const HORA = 3_600_000;
const DIA = 1440;

/** Un evento del día: cuándo arranca, cuánto dura y cuánto quedan sus recompensas. */
export interface Franja {
  /** Minutos desde medianoche, en hora del servidor. 13:00 → 780. */
  minutos: number;
  /** Del arranque hasta que cae el drop. El Kundun del mediodía dura 10 min. */
  duraMin: number;
  /** Cuánto queda el drop en la subasta del gremio antes de irse a la mundial. */
  premioMin: number;
}

export interface Horario {
  /** Los Kundun del día, en hora del servidor. */
  franjas: Franja[];
  /** Diferencia del servidor contra UTC, en horas. GMT-3 → -3. */
  offsetServidor: number;
  /** El evento de la app abre estos minutos antes del arranque. */
  abreAntesMin: number;
  /** El PIN recién aparecía estos minutos antes. Sin PIN ya no se usa, pero la fila lo guarda. */
  pinAntesMin: number;
  /** Anotarse corta esto antes del cierre, para que nadie entre con el reparto empezado. */
  cierraRegistroAntesMin: number;
  /** El asedio al castillo, que sale los domingos y más tarde que el Kundun de la noche. */
  asedio: Franja;
  /**
   * Si el tablero tapa las cajas de drops con el cartel del próximo Kundun cuando no hay
   * ninguno en curso. El admin lo apaga cuando quiere mostrar la app entera.
   */
  mostrarCartel: boolean;
}

/** Lo que vale si todavía no hay fila de ajustes. */
export const HORARIO_POR_DEFECTO: Horario = {
  franjas: [
    { minutos: 13 * 60, duraMin: 10, premioMin: 30 },
    { minutos: 20 * 60 + 45, duraMin: 15, premioMin: 40 },
  ],
  offsetServidor: -3,
  abreAntesMin: 15,
  pinAntesMin: 15,
  cierraRegistroAntesMin: 5,
  asedio: { minutos: 21 * 60 + 30, duraMin: 30, premioMin: 40 },
  mostrarCartel: true,
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

/** Cómo se guardan las franjas en una sola columna: "780:10:30,1245:15:40". */
export function comoGuardadas(franjas: Franja[]): string {
  return franjas.map((f) => `${f.minutos}:${f.duraMin}:${f.premioMin}`).join(',');
}

/**
 * Lo inverso. Tolera el formato viejo, que era solo la lista de horas: a esas les pone las
 * duraciones de fábrica en vez de romperse.
 */
export function leerGuardadas(crudo: string, deFabrica: Franja): Franja[] {
  const salida: Franja[] = [];
  for (const trozo of crudo.split(/[,;]/)) {
    const partes = trozo.trim().split(':').map(Number);
    if (!Number.isFinite(partes[0])) continue;
    salida.push({
      minutos: partes[0],
      duraMin: Number.isFinite(partes[1]) ? partes[1] : deFabrica.duraMin,
      premioMin: Number.isFinite(partes[2]) ? partes[2] : deFabrica.premioMin,
    });
  }
  return salida.sort((a, b) => a.minutos - b.minutos);
}

/** GMT-3 → "GMT-3". */
export function comoGmt(offsetHoras: number): string {
  return `GMT${offsetHoras >= 0 ? '+' : '−'}${Math.abs(offsetHoras)}`;
}

/** Un tramo del día ya resuelto a fechas reales. */
export interface Tramo {
  empieza: Date;
  /** Cuándo cae el drop y arranca la subasta del gremio. */
  premios: Date;
  /** Cuándo el drop se va a la subasta mundial. */
  termina: Date;
}

export interface Corrida {
  /** Identifica la corrida programada: "2026-09-01T16:00Z". Es única por horario. */
  clave: string;
  abre: Date;
  /** Desde cuándo se podía ver el PIN. Sin PIN no se usa, pero la fila del evento lo guarda. */
  pinDesde: Date;
  empieza: Date;
  /** Cuándo cae el drop del Kundun y se puede empezar a repartir. */
  premios: Date;
  /** Hasta cuándo se puede uno anotar. Siempre antes de `cierra`. */
  registroHasta: Date;
  /** Cuándo se cierra el evento de la app: al final de todo lo que haya que repartir. */
  cierra: Date;
  /**
   * El asedio colgado de esta corrida, cuando la corrida es la del domingo a la noche.
   * Sus drops salen más tarde que los del Kundun, con el del Kundun todavía en el gremio.
   */
  asedio: Tramo | null;
}

const tramo = (empieza: Date, f: Franja): Tramo => {
  const premios = new Date(empieza.getTime() + f.duraMin * MIN);
  return { empieza, premios, termina: new Date(premios.getTime() + f.premioMin * MIN) };
};

const corrida = (empieza: Date, f: Franja, h: Horario, asedio: Tramo | null): Corrida => {
  const propio = tramo(empieza, f);
  // El evento no puede cerrar antes de que termine lo último que haya para repartir.
  const cierra = new Date(Math.max(propio.termina.getTime(), asedio?.termina.getTime() ?? 0));

  return {
    clave: empieza.toISOString().slice(0, 16) + 'Z',
    abre: new Date(empieza.getTime() - h.abreAntesMin * MIN),
    pinDesde: new Date(empieza.getTime() - h.pinAntesMin * MIN),
    empieza,
    premios: propio.premios,
    // Si el corte se pasa del arranque, anotarse termina cuando arranca el Kundun.
    registroHasta: new Date(
      Math.max(cierra.getTime() - h.cierraRegistroAntesMin * MIN, empieza.getTime()),
    ),
    cierra,
    asedio,
  };
};

/** Medianoche, en hora del servidor, del día al que pertenece un momento. */
function medianocheServidor(momento: Date, offsetServidor: number): number {
  const local = new Date(momento.getTime() + offsetServidor * HORA);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offsetServidor * HORA;
}

/**
 * El asedio del día al que pertenece `momento`, mire desde donde se mire.
 * Devuelve null si ese día no es domingo.
 */
export function asedioDelDia(momento: Date, h: Horario): Tramo | null {
  const medianoche = medianocheServidor(momento, h.offsetServidor);
  if (new Date(medianoche + h.offsetServidor * HORA).getUTCDay() !== 0) return null;
  return tramo(new Date(medianoche + h.asedio.minutos * MIN), h.asedio);
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
    const empiezan = h.franjas.map((f) => new Date(medianoche + (f.minutos - h.offsetServidor * 60) * MIN));
    if (empiezan.length === 0) continue;

    // El asedio se cuelga del último Kundun del domingo que arranca antes que él: es el que
    // sigue abierto cuando aparece el drop del asedio.
    const asedio = asedioDelDia(empiezan[0], h);
    const conElAsedio =
      asedio === null
        ? -1
        : empiezan.reduce((mejor, e, i) => (e.getTime() <= asedio.empieza.getTime() ? i : mejor), -1);

    empiezan.forEach((empieza, i) =>
      salida.push(corrida(empieza, h.franjas[i], h, i === conElAsedio ? asedio : null)),
    );
  }

  return salida.sort((a, b) => a.empieza.getTime() - b.empieza.getTime());
}

/** La corrida cuya ventana está abierta ahora mismo, si hay alguna. */
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
