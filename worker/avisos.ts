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
  /** El emoji que lo acompaña. Sale en el título y en el resumen de la mañana. */
  emoji: string;
  /** Con cuánto énfasis se muestra el nombre. */
  titulo: Titulo;
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

/**
 * Cómo se muestra el nombre del evento.
 *
 * Telegram deja poco margen: negrita, cursiva y poco más. Lo que sí entiende, porque es texto y
 * no formato, son las letras anchas de Unicode, que se ven gruesas en cualquier cliente sin
 * depender de que el mensaje se mande con formato. Ahí está casi todo el efecto.
 */
export type Titulo = 'simple' | 'ancho' | 'grueso' | 'bandera';

export const TITULOS: Titulo[] = ['simple', 'ancho', 'grueso', 'bandera'];

const esTitulo = (x: unknown): x is Titulo => TITULOS.includes(x as Titulo);

// Los alfabetos anchos de Unicode: sans-serif en negrita, mayúsculas, minúsculas y números.
const ANCHA_MAY = 0x1d5d4;
const ANCHA_MIN = 0x1d5ee;
const ANCHA_NUM = 0x1d7ec;

/**
 * El mismo texto en letras gruesas.
 *
 * Lo que no tiene equivalente —las tildes, la eñe, los signos— queda como está: es preferible una
 * letra fina en medio de la palabra antes que cambiarle la ortografía al nombre que eligió el
 * gremio.
 */
function enGrueso(texto: string): string {
  return [...texto]
    .map((c) => {
      const p = c.codePointAt(0) ?? 0;
      if (c >= 'A' && c <= 'Z') return String.fromCodePoint(ANCHA_MAY + (p - 65));
      if (c >= 'a' && c <= 'z') return String.fromCodePoint(ANCHA_MIN + (p - 97));
      if (c >= '0' && c <= '9') return String.fromCodePoint(ANCHA_NUM + (p - 48));
      return c;
    })
    .join('');
}

/** El nombre del evento, vestido para la ocasión. */
export function comoTitulo(nombre: string, estilo: Titulo, emoji: string): string {
  const limpio = (nombre || 'El evento').trim();
  const e = emoji.trim();
  const con = (x: string) => (e ? `${e} ${x}` : x);

  switch (estilo) {
    case 'ancho':
      return con(`*${[...limpio.toUpperCase()].join(' ')}*`);
    case 'grueso':
      return con(enGrueso(limpio.toUpperCase()));
    case 'bandera': {
      const medio = e ? `${e} ${enGrueso(limpio.toUpperCase())} ${e}` : enGrueso(limpio.toUpperCase());
      // La regla acompaña al largo del nombre para que el cartel no quede ni angosto ni infinito.
      const regla = '━'.repeat(Math.min(24, Math.max(13, Math.round(limpio.length * 1.7))));
      return `${regla}\n${medio}\n${regla}`;
    }
    default:
      return con(`*${limpio}*`);
  }
}

export const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Las marcas que se pueden usar en el texto. El panel las lista y el simulador las reemplaza,
 * así que agregar una acá la hace visible en los dos lados.
 */
export const MARCAS: Array<[string, string]> = [
  ['{titulo}', 'El nombre en grande, como esté elegido acá abajo'],
  ['{evento}', 'El nombre del evento, tal cual'],
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
  datos: { evento: string; hora: number; antes: number; dia?: string; emoji?: string; estilo?: Titulo },
): string {
  return plantilla
    .replace(/\{titulo\}/g, comoTitulo(datos.evento, datos.estilo ?? 'simple', datos.emoji ?? ''))
    .replace(/\{evento\}/g, datos.evento)
    .replace(/\{hora\}/g, comoHora(datos.hora))
    .replace(/\{falta\}/g, comoFalta(datos.antes))
    .replace(/\{dia\}/g, datos.dia ?? 'hoy');
}

/**
 * El texto de fábrica, para un evento recién creado o para el que quiere empezar de nuevo.
 *
 * El nombre no va escrito: va la marca, así sigue al del evento cuando se lo renombra en vez de
 * quedar clavado el que tenía el día que se creó.
 */
export function mensajePorDefecto(_nombre?: string): string {
  return [
    '{titulo}',
    '',
    '⏳ Falta *{falta}*',
    '🕐 Arranca {dia} a las *{hora}*, hora del servidor',
    '',
    '_Prepárense que después no hay excusas._',
  ].join('\n');
}

// ── El resumen de la mañana ──────────────────────────────────────────────────
//
// Una vez por día, a la hora que fije el admin, la lista de lo que cae ese día. Sirve para que
// el gremio arranque sabiendo qué hay, sobre todo si se agregó algo de noche.

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const RESUMEN_POR_DEFECTO =
  '📅 *Hoy es {dia} {fecha}*\n\n{lista}\n\n_Horarios del servidor._';

/** Las marcas que entiende el texto del resumen. */
export const MARCAS_RESUMEN: Array<[string, string]> = [
  ['{dia}', 'Qué día es: "domingo"'],
  ['{fecha}', 'La fecha: "20 de septiembre"'],
  ['{lista}', 'Los eventos del día, uno por renglón'],
  ['{cuantos}', 'Cuántos eventos hay'],
];

/**
 * El texto del resumen del día.
 *
 * `dia` es el momento que se quiere resumir; lo que importa es en qué día cae en hora del
 * servidor, porque a las 10 de la mañana del servidor puede ser otro día en UTC.
 */
export function armarResumen(
  avisos: Aviso[],
  dia: Date,
  offsetServidor: number,
  plantilla: string,
): string {
  const local = new Date(dia.getTime() + offsetServidor * 3_600_000);
  const diaSemana = local.getUTCDay();

  const delDia = avisos
    .filter((a) => a.activo && a.dias.includes(diaSemana) && a.horas.length > 0)
    .map((a) => ({ ...a, primera: Math.min(...a.horas) }))
    .sort((a, b) => a.primera - b.primera);

  const lista =
    delDia.length === 0
      ? 'Hoy no hay eventos cargados.'
      : delDia
          .map((a) => {
            const horas = a.horas.map(comoHora);
            const cuando = horas.length === 1 ? horas[0] : `${horas.slice(0, -1).join(', ')} y ${horas.at(-1)}`;
            return `${a.emoji || '•'} *${a.nombre}* — ${cuando}`;
          })
          .join('\n');

  return plantilla
    .replace(/\{dia\}/g, DIAS_LARGOS[diaSemana] ?? '')
    .replace(/\{fecha\}/g, `${local.getUTCDate()} de ${MESES[local.getUTCMonth()]}`)
    .replace(/\{cuantos\}/g, String(delDia.length))
    .replace(/\{lista\}/g, lista);
}

// ── Cómo se guarda ───────────────────────────────────────────────────────────

export interface FilaAviso {
  id: number;
  nombre: string;
  emoji: string;
  titulo: string;
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
    emoji: fila.emoji ?? '',
    titulo: esTitulo(fila.titulo) ? fila.titulo : 'simple',
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
    // Un emoji y nada más: si alguien pega media frase acá, el título deja de ser un título.
    emoji: typeof x.emoji === 'string' ? [...x.emoji.trim()].slice(0, 3).join('') : '',
    titulo: esTitulo(x.titulo) ? x.titulo : 'simple',
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
          texto: armarMensaje(aviso.mensaje, {
            evento: aviso.nombre,
            hora: h,
            antes,
            emoji: aviso.emoji,
            estilo: aviso.titulo,
          }),
        });
      }
    }
  }

  return salida.sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
}
