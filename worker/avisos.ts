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

/** Lo que dura un evento si nadie dijo otra cosa. */
export const DURA_POR_DEFECTO = 10;
/** Seis horas. Más que eso no es un evento, es un día. */
export const DURA_MAXIMA = 360;

/**
 * Una de las horas en las que cae el evento, con lo que dura esa vez.
 *
 * La duración va por horario y no por evento porque el mismo evento no siempre dura lo mismo: el
 * Kundun del mediodía son diez minutos y el de la noche quince.
 */
export interface HoraAviso {
  /** Hora del servidor, en minutos desde medianoche. */
  minutos: number;
  /** Cuánto dura, en minutos. */
  dura: number;
}

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
  /** En qué horas del servidor cae, y cuánto dura cada vez. */
  horas: HoraAviso[];
  /** Si además se avisa en el momento en que arranca. */
  alEmpezar: boolean;
  /** El texto de ese aviso. Vacío = el de fábrica. */
  mensajeInicio: string;
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
  ['{termina}', 'A qué hora termina'],
  ['{dura}', 'Cuánto dura: "10 minutos"'],
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
  datos: {
    evento: string;
    hora: number;
    antes: number;
    dia?: string;
    emoji?: string;
    estilo?: Titulo;
    dura?: number;
  },
): string {
  const dura = datos.dura ?? DURA_POR_DEFECTO;
  return plantilla
    .replace(/\{titulo\}/g, comoTitulo(datos.evento, datos.estilo ?? 'simple', datos.emoji ?? ''))
    .replace(/\{termina\}/g, comoHora(datos.hora + dura))
    .replace(/\{dura\}/g, comoFalta(dura))
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

/**
 * El texto de fábrica para el momento en que arranca.
 *
 * Es el único aviso que no habla del futuro, así que no lleva {falta}: lo que importa es hasta
 * cuándo hay tiempo.
 */
export function mensajeInicioPorDefecto(): string {
  return ['{titulo}', '', '🟢 *Arrancó.* Hay tiempo hasta las *{termina}*, hora del servidor.'].join('\n');
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
    .map((a) => ({ ...a, primera: Math.min(...a.horas.map((h) => h.minutos)) }))
    .sort((a, b) => a.primera - b.primera);

  const lista =
    delDia.length === 0
      ? 'Hoy no hay eventos cargados.'
      : delDia
          .map((a) => {
            const horas = a.horas.map((h) => comoHora(h.minutos));
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
  al_empezar: number;
  mensaje_inicio: string;
  dias: string;
  horas: string;
  antes: string;
  mensaje: string;
  activo: number;
  orden: number;
}

/**
 * Las horas guardadas: "780:10,1245:15" es 13:00 durando diez minutos y 20:45 durando quince.
 *
 * Un número pelado —como se guardaba antes de que la duración existiera— vale igual y toma la
 * duración de fábrica, así no hay que reescribir lo que ya estaba.
 */
export function leerHoras(crudo: string): HoraAviso[] {
  const vistas = new Map<number, number>();
  for (const trozo of crudo.split(',')) {
    const [h, d] = trozo.split(':');
    const minutos = Number((h ?? '').trim());
    if (!Number.isFinite(minutos) || minutos < 0 || minutos >= DIA_MIN) continue;
    const dura = Number((d ?? '').trim());
    vistas.set(minutos, Number.isFinite(dura) && dura >= 1 && dura <= DURA_MAXIMA ? dura : DURA_POR_DEFECTO);
  }
  return [...vistas.entries()]
    .map(([minutos, dura]) => ({ minutos, dura }))
    .sort((a, b) => a.minutos - b.minutos);
}

export const comoGuardadasHoras = (horas: HoraAviso[]): string =>
  horas.map((h) => `${h.minutos}:${h.dura}`).join(',');

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
    horas: leerHoras(fila.horas),
    alEmpezar: (fila.al_empezar ?? 1) === 1,
    mensajeInicio: fila.mensaje_inicio || mensajeInicioPorDefecto(),
    antes: [...new Set(numeros(fila.antes).filter((a) => a >= 1 && a <= ANTES_MAXIMO))].sort((a, b) => b - a),
    mensaje: fila.mensaje,
    activo: fila.activo === 1,
  };
}

/** Las horas como las manda el panel: [{minutos, dura}], o números pelados de una versión vieja. */
function leerHorasDelPanel(crudo: unknown): HoraAviso[] {
  if (!Array.isArray(crudo)) return [];
  const vistas = new Map<number, number>();
  for (const x of crudo) {
    const minutos = typeof x === 'number' ? x : Number((x as { minutos?: unknown })?.minutos);
    if (!Number.isInteger(minutos) || minutos < 0 || minutos >= DIA_MIN) continue;
    const dura = Number((x as { dura?: unknown })?.dura);
    vistas.set(minutos, Number.isInteger(dura) && dura >= 1 && dura <= DURA_MAXIMA ? dura : DURA_POR_DEFECTO);
  }
  return [...vistas.entries()]
    .map(([minutos, dura]) => ({ minutos, dura }))
    .sort((a, b) => a.minutos - b.minutos);
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
    horas: leerHorasDelPanel(x.horas),
    alEmpezar: x.alEmpezar !== false,
    mensajeInicio:
      typeof x.mensajeInicio === 'string' && x.mensajeInicio.trim()
        ? x.mensajeInicio.slice(0, 1000)
        : mensajeInicioPorDefecto(),
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
  /**
   * Cuándo termina el evento, que es cuándo este mensaje se borra del grupo.
   *
   * Un recordatorio de algo que ya pasó es basura en el chat: el aviso vive lo que vive el evento
   * y después se va solo, igual que los ensayos.
   */
  termina: Date;
  /** Cuántos minutos antes es este aviso. 0 = es el de "arrancó". */
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
      const empieza = new Date(medianoche + h.minutos * MIN);
      const termina = new Date(empieza.getTime() + h.dura * MIN);

      const armar = (plantilla: string, antes: number) =>
        armarMensaje(plantilla, {
          evento: aviso.nombre,
          hora: h.minutos,
          antes,
          emoji: aviso.emoji,
          estilo: aviso.titulo,
          dura: h.dura,
        });

      for (const antes of aviso.antes) {
        const cuando = new Date(empieza.getTime() - antes * MIN);
        if (cuando < desde || cuando > hasta) continue;
        salida.push({ cuando, empieza, termina, antes, texto: armar(aviso.mensaje, antes) });
      }

      // Y el de "arrancó", que va justo cuando empieza.
      if (aviso.alEmpezar && empieza >= desde && empieza <= hasta) {
        salida.push({ cuando: empieza, empieza, termina, antes: 0, texto: armar(aviso.mensajeInicio, 0) });
      }
    }
  }

  return salida.sort((a, b) => a.cuando.getTime() - b.cuando.getTime());
}
