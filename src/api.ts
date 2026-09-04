import type { Estado } from '../worker/types';

export type EstadoConAviso = Estado & { aviso?: string };

/** Un fetch con las cookies de sesión y el error del servidor ya desempaquetado. */
export async function api<T = EstadoConAviso>(
  ruta: string,
  opciones: { metodo?: string; cuerpo?: unknown } = {},
): Promise<T> {
  const respuesta = await fetch(`/api${ruta}`, {
    method: opciones.metodo ?? (opciones.cuerpo ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: opciones.cuerpo ? { 'content-type': 'application/json' } : undefined,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  });

  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error((datos as { error?: string } | null)?.error ?? 'No se pudo conectar con el servidor.');
  }
  return datos as T;
}

export const conMiles = (n: number) => n.toLocaleString('es-AR');

/**
 * SQLite guarda "2026-09-01 18:08:06" (UTC, sin zona) y el worker manda ISO con Z.
 * Sin la Z el navegador lo lee como hora local y el reloj queda corrido.
 */
function aFecha(iso: string): Date {
  const normalizado = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z';
  return new Date(normalizado);
}

export function fechaCorta(iso: string): string {
  const d = aFecha(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Cuenta regresiva en mm:ss. Devuelve null cuando no hay fecha o ya venció. */
export function restante(iso: string | null, ahora: number): string | null {
  if (!iso) return null;
  const falta = aFecha(iso).getTime() - ahora;
  if (!Number.isFinite(falta) || falta <= 0) return null;
  const total = Math.floor(falta / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Achica una imagen antes de mandarla: la fila de D1 no es lugar para un PNG de 3 MB.
 * Queda en 128×128 webp, que ronda los 4 KB.
 */
export function achicarImagen(archivo: File, lado = 128): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No pude leer esa imagen.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('Ese archivo no parece una imagen.'));
      img.onload = () => {
        const lienzo = document.createElement('canvas');
        lienzo.width = lado;
        lienzo.height = lado;
        const ctx = lienzo.getContext('2d');
        if (!ctx) return rechazar(new Error('Tu navegador no pudo procesar la imagen.'));

        // Recorte cuadrado centrado, para que el ícono no salga deformado.
        const corte = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
        resolver(lienzo.toDataURL('image/webp', 0.85));
      };
      img.src = String(lector.result);
    };
    lector.readAsDataURL(archivo);
  });
}

// ── Horarios ──────────────────────────────────────────────────────────────────

/** La zona del dispositivo. Un mail no dice dónde está la persona; el navegador sí. */
/**
 * Si un pedazo de la app se ve.
 *
 * El admin esconde cosas desde el menú Desarrollador: 'nadie' lo saca para todos y 'admin' lo
 * deja solo para él. Lo que no figura en el mapa lo ve todo el mundo, que es lo normal.
 */
export function seVe(estado: EstadoConAviso, parte: string): boolean {
  const como = estado.interfaz?.[parte];
  if (!como) return true;
  return como === 'admin' && estado.yo?.rol === 'admin';
}

export function zonaDelDispositivo(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function nombreCortoZona(zona: string): string {
  try {
    const partes = new Intl.DateTimeFormat('es-AR', { timeZone: zona, timeZoneName: 'shortOffset' }).formatToParts(
      new Date(),
    );
    return partes.find((p) => p.type === 'timeZoneName')?.value ?? zona;
  } catch {
    return zona;
  }
}

/** Siempre en 24 horas: "20:00", no "08:00 p. m.". */
export function horaEn(iso: string, zona: string): string {
  const opciones: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  try {
    return aFecha(iso).toLocaleTimeString('es-AR', { ...opciones, timeZone: zona });
  } catch {
    return aFecha(iso).toLocaleTimeString('es-AR', opciones);
  }
}

export function fechaHoraEn(iso: string, zona: string): string {
  const opciones: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  try {
    return aFecha(iso).toLocaleString('es-AR', { ...opciones, timeZone: zona });
  } catch {
    return fechaCorta(iso);
  }
}

/**
 * Los horarios fijos del Kundun ("13:00" y "21:00" del servidor) pasados a la zona que se mire.
 * Se arma un instante real y se formatea, así los cambios de horario de verano salen solos.
 */
export function horariosEnZona(
  agenda: { horasServidor: string[]; offsetServidorHoras: number },
  zona: string,
): string[] {
  const hoy = new Date();
  return agenda.horasServidor.map((hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const utc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), h - agenda.offsetServidorHoras, m);
    return horaEn(new Date(utc).toISOString(), zona);
  });
}

/** Cuánto falta, en palabras: "en 3 h 12 min", "en 4 min", "ahora". */
export function faltan(iso: string, ahora: number): string {
  const ms = new Date(iso).getTime() - ahora;
  if (!Number.isFinite(ms) || ms <= 0) return 'ahora';
  const min = Math.round(ms / 60000);
  if (min < 60) return `en ${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `en ${horas} h` : `en ${horas} h ${resto} min`;
}

// ── PC de equipo ──────────────────────────────────────────────────────────────

/**
 * El juego muestra el PC del equipo en millones ("30.07M"), así que la app lo escribe igual.
 * Adentro siempre se guarda el número entero: 30.07M son 30070000.
 */
export function formatoPC(n: number): string {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/**
 * Lee lo que el admin tipea. Acepta las tres formas que salen naturales:
 * "30.07M", "30,07 m" y "30070000".
 */
export function leerPC(entrada: string): number {
  const limpio = entrada.trim().toLowerCase().replace(/\s+/g, '');
  if (!limpio) return 0;

  const conSufijo = limpio.match(/^([0-9]+(?:[.,][0-9]+)?)(m|k)$/);
  if (conSufijo) {
    const valor = Number(conSufijo[1].replace(',', '.'));
    if (!Number.isFinite(valor)) return 0;
    return Math.round(valor * (conSufijo[2] === 'm' ? 1_000_000 : 1_000));
  }

  // Sin sufijo, los puntos y las comas son separadores de miles.
  const digitos = limpio.replace(/[^0-9]/g, '');
  return digitos ? Number(digitos) : 0;
}

/** Lo normal es estar en items y almas. Solo se marca a quien se sale de eso. */
export function marcaDeListas(listas: string[]): string | null {
  const normal = listas.length === 2 && listas.includes('items') && listas.includes('almas');
  if (normal) return null;
  return listas.length === 0 ? 'sin listas' : listas.join(' · ');
}

/** -3 → "GMT−3". */
export function comoGmt(offsetHoras: number): string {
  return `GMT${offsetHoras >= 0 ? "+" : "−"}${Math.abs(offsetHoras)}`;
}
