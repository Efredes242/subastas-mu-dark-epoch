/**
 * Lo que salió en una semana.
 *
 * El historial va de a un Kundun y solo llega a los últimos doce, que con dos por día son seis
 * días: una semana entera no entra. Esto es la otra mirada, la de arriba — cuánto salió de cada
 * cosa entre lunes y domingo, para tener una idea de cómo viene el mes sin abrir Kundun por
 * Kundun.
 *
 * La semana va de lunes 00:00 a domingo 23:59 EN HORA DEL SERVIDOR, y eso no es un detalle: el
 * drop del asedio cae a las 22:00 del domingo, que en UTC ya es lunes. Contado en UTC, el
 * asedio caería siempre en la semana siguiente.
 */
import { medianocheServidor, type Horario } from './horarios';

const DIA = 86_400_000;

export interface Semana {
  /** Lunes 00:00 y domingo 23:59:59, en hora del servidor, escritos en UTC. */
  desde: string;
  hasta: string;
  /** "lun 20 — dom 26 de oct", en hora del servidor. */
  etiqueta: string;
  /** 0 es la semana en curso, 1 la anterior, y así. */
  atras: number;
  /** Si hay drops más viejos todavía: con esto la flecha de atrás se apaga sola al final. */
  hayAnterior: boolean;
  /** Cuántos Kundun de la semana repartieron algo. */
  kundunes: number;
  /** Cuántos drops salieron en total. */
  total: number;
  /** Cuánto salió de cada cosa, de lo que más salió a lo que menos. */
  items: Array<{ catalogoId: number | null; nombre: string; cantidad: number }>;
  /**
   * Qué se llevó cada uno. Solo para el admin: al gremio le alcanza con saber qué salió, y
   * quién se llevó qué está en el historial de cada Kundun.
   */
  porPersona: Array<{
    personaje: string;
    total: number;
    items: Array<{ catalogoId: number | null; nombre: string; cantidad: number }>;
  }> | null;
}

/** El lunes de la semana a la que pertenece un momento, en hora del servidor. */
function lunesDe(momento: Date, offsetServidor: number): number {
  const medianoche = medianocheServidor(momento, offsetServidor);
  // getUTCDay sobre la medianoche ya corrida al servidor: 0 domingo, 1 lunes...
  const dia = new Date(medianoche + offsetServidor * 3_600_000).getUTCDay();
  // Cuántos días pasaron desde el lunes. El domingo es el último, no el primero.
  return medianoche - ((dia + 6) % 7) * DIA;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "lun 20 — dom 26 de oct", o con los dos meses cuando la semana los cruza. */
function etiquetaDe(lunes: number, offsetServidor: number): string {
  const enServidor = (ms: number) => new Date(ms + offsetServidor * 3_600_000);
  const l = enServidor(lunes);
  const d = enServidor(lunes + 6 * DIA);
  const mesL = MESES[l.getUTCMonth()];
  const mesD = MESES[d.getUTCMonth()];
  return mesL === mesD
    ? `lun ${l.getUTCDate()} — dom ${d.getUTCDate()} de ${mesD}`
    : `lun ${l.getUTCDate()} de ${mesL} — dom ${d.getUTCDate()} de ${mesD}`;
}

interface FilaDrop {
  catalogo_id: number | null;
  nombre: string;
  personaje: string | null;
}

export async function armarSemana(
  db: D1Database,
  horario: Horario,
  atras: number,
  esAdmin: boolean,
  ahora = new Date(),
): Promise<Semana> {
  const offset = horario.offsetServidor;
  const lunes = lunesDe(ahora, offset) - atras * 7 * DIA;
  const siguiente = lunes + 7 * DIA;
  const desde = new Date(lunes).toISOString();
  const hasta = new Date(siguiente).toISOString();

  /*
   * Por la fecha del EVENTO, no la del item.
   *
   * Son casi siempre la misma, pero no el domingo: el drop del asedio se carga pasada la
   * medianoche UTC y por su propia fecha se iría a la semana que viene, separado del Kundun
   * del que salió.
   */
  const enLaSemana = `e.es_prueba = 0
       AND COALESCE(e.empieza_en, e.creado_en) >= ?1
       AND COALESCE(e.empieza_en, e.creado_en) <  ?2`;

  const [dropsR, kundunesR, anteriorR] = await db.batch([
    db
      .prepare(
        `SELECT i.catalogo_id, i.nombre, u.personaje
           FROM items i
           JOIN eventos e ON e.id = i.evento_id
           LEFT JOIN usuarios u ON u.id = i.asignado_a
          WHERE ${enLaSemana}
          ORDER BY i.id`,
      )
      .bind(desde, hasta),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM eventos e
          WHERE ${enLaSemana}
            AND (SELECT COUNT(*) FROM items i WHERE i.evento_id = e.id) > 0`,
      )
      .bind(desde, hasta),
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM items i
           JOIN eventos e ON e.id = i.evento_id
          WHERE e.es_prueba = 0
            AND COALESCE(e.empieza_en, e.creado_en) < ?1`,
      )
      .bind(desde),
  ]);

  const drops = dropsR.results as FilaDrop[];

  // Cuánto salió de cada cosa. Se cuenta por nombre y no por catalogo_id: un item borrado del
  // catálogo deja sus drops con catalogo_id en null y los nombres son lo único que queda.
  const porItem = new Map<string, { catalogoId: number | null; nombre: string; cantidad: number }>();
  for (const d of drops) {
    const ya = porItem.get(d.nombre);
    if (ya) ya.cantidad++;
    else porItem.set(d.nombre, { catalogoId: d.catalogo_id, nombre: d.nombre, cantidad: 1 });
  }

  // Lo mismo pero por persona, y con el catalogo_id para que la pantalla pueda ponerle el
  // icono a cada renglon.
  const porPersona = new Map<string, Map<string, { catalogoId: number | null; cantidad: number }>>();
  if (esAdmin) {
    for (const d of drops) {
      if (!d.personaje) continue;
      const suyos = porPersona.get(d.personaje) ?? new Map<string, { catalogoId: number | null; cantidad: number }>();
      const ya = suyos.get(d.nombre);
      if (ya) ya.cantidad++;
      else suyos.set(d.nombre, { catalogoId: d.catalogo_id, cantidad: 1 });
      porPersona.set(d.personaje, suyos);
    }
  }

  const masPrimero = <T extends { cantidad: number; nombre: string }>(a: T, b: T) =>
    b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es');

  return {
    desde,
    // El domingo termina un segundo antes del lunes que viene: lo que se muestra, no lo que se consulta.
    hasta: new Date(siguiente - 1000).toISOString(),
    etiqueta: etiquetaDe(lunes, offset),
    atras,
    hayAnterior: ((anteriorR.results[0] as { n: number } | undefined)?.n ?? 0) > 0,
    kundunes: (kundunesR.results[0] as { n: number } | undefined)?.n ?? 0,
    total: drops.length,
    items: [...porItem.values()].sort(masPrimero),
    porPersona: esAdmin
      ? [...porPersona.entries()]
          .map(([personaje, suyos]) => ({
            personaje,
            total: [...suyos.values()].reduce((a, b) => a + b.cantidad, 0),
            items: [...suyos.entries()]
              .map(([nombre, { catalogoId, cantidad }]) => ({ catalogoId, nombre, cantidad }))
              .sort(masPrimero),
          }))
          .sort((a, b) => b.total - a.total || a.personaje.localeCompare(b.personaje, 'es'))
      : null,
  };
}
