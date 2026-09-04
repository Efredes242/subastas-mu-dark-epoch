import { useEffect, useMemo, useState } from 'react';
import { nombreCortoZona, zonaDelDispositivo } from '../api';

const CLAVE = 'sk_zona';
/**
 * La zona del servidor sale del horario que cargó el admin, no de una constante.
 * Ojo con `Etc/GMT`: tiene el signo al revés, GMT-3 se escribe `Etc/GMT+3`.
 */
export function zonaDelServidor(offsetHoras: number): string {
  return `Etc/GMT${offsetHoras <= 0 ? '+' : '-'}${Math.abs(offsetHoras)}`;
}

/** Solo se guarda cuando alguien elige a mano; si no, manda la zona del equipo. */
function elegidaAMano(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

/**
 * Qué zona horaria usar para mostrar los horarios.
 *
 * Por defecto **la del equipo que abre la página**, siempre: si alguien viaja o le cambia la
 * hora al teléfono, los horarios lo siguen. Solo queda fija si la eligió a mano en el selector.
 */
export function useZona(zonaDelPerfil: string | null | undefined): [string, (z: string) => void] {
  const [zona, setZonaInterna] = useState<string>(
    () => elegidaAMano() ?? zonaDelPerfil ?? zonaDelDispositivo(),
  );

  // Si el equipo cambia de zona (un viaje, o el reloj mal puesto), la seguimos —
  // salvo que la persona haya elegido una a mano.
  useEffect(() => {
    if (elegidaAMano()) return;
    const propia = zonaDelDispositivo();
    if (propia !== zona) setZonaInterna(propia);
  }, [zona]);

  const setZona = (nueva: string) => {
    // 'auto' vuelve a seguir al equipo: se borra la elección guardada.
    if (nueva === AUTO) {
      try {
        localStorage.removeItem(CLAVE);
      } catch {
        /* nada que hacer */
      }
      setZonaInterna(zonaDelDispositivo());
      return;
    }

    setZonaInterna(nueva);
    try {
      localStorage.setItem(CLAVE, nueva);
    } catch {
      /* modo incógnito: no se recuerda, y está bien */
    }
  };

  return [zona, setZona];
}

export const AUTO = 'auto';

/**
 * Todas las zonas horarias que conoce el navegador, agrupadas por región.
 *
 * `Intl.supportedValuesOf` está en todos los navegadores modernos; si falta, quedan las de
 * siempre, que cubren de dónde entra el gremio. El desplazamiento se calcula una sola vez: son
 * cuatrocientas y pico y no cambian mientras la página está abierta.
 */
const DE_EMERGENCIA = [
  'America/Argentina/Buenos_Aires',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'Europe/London',
  'UTC',
];

function todasLasZonas(): string[] {
  try {
    const soportadas = (Intl as { supportedValuesOf?: (clave: string) => string[] }).supportedValuesOf;
    const lista = soportadas?.('timeZone');
    if (lista && lista.length > 0) return lista;
  } catch {
    /* navegador viejo: van las de siempre */
  }
  return DE_EMERGENCIA;
}

/** "America/Argentina/Buenos_Aires" → "Argentina / Buenos Aires". */
function comoSeLee(zona: string): string {
  const partes = zona.split('/');
  return partes.slice(1).join(' / ').replace(/_/g, ' ') || zona;
}

/** El desplazamiento en minutos, para poder ordenar de oeste a este. */
function desplazamiento(zona: string): number {
  const corto = nombreCortoZona(zona);
  const m = corto.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return 0;
  const signo = m[1] === '-' ? -1 : 1;
  return signo * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

export function SelectorZona({
  zona,
  alCambiar,
  offsetServidor,
}: {
  zona: string;
  alCambiar: (z: string) => void;
  offsetServidor: number;
}) {
  const propia = zonaDelDispositivo();
  const automatica = !elegidaAMano();
  const delServidor = zonaDelServidor(offsetServidor);

  // Las regiones se arman una sola vez: son cuatrocientas y pico de zonas.
  const regiones = useMemo(() => {
    const mapa = new Map<string, { valor: string; texto: string; min: number }[]>();
    for (const z of todasLasZonas()) {
      const region = z.includes('/') ? z.split('/')[0] : 'Otras';
      const suyas = mapa.get(region) ?? [];
      suyas.push({ valor: z, texto: `${comoSeLee(z)} (${nombreCortoZona(z)})`, min: desplazamiento(z) });
      mapa.set(region, suyas);
    }
    for (const [region, suyas] of mapa) {
      // De oeste a este, y a igual hora por nombre: así se encuentran las de al lado.
      suyas.sort((a, b) => a.min - b.min || a.texto.localeCompare(b.texto, 'es'));
      mapa.set(region, suyas);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }, []);

  return (
    <select
      className="campo campo-chico"
      style={{ width: 'auto', minWidth: 210, maxWidth: '100%', paddingRight: 10, cursor: 'pointer' }}
      value={automatica ? AUTO : zona}
      onChange={(e) => alCambiar(e.target.value)}
      aria-label="Zona horaria"
    >
      {/* Primero la de este equipo, que es la que casi siempre se quiere. */}
      <option value={AUTO}>Automática — la de este equipo ({nombreCortoZona(propia)})</option>
      <option value={delServidor}>Hora del servidor ({nombreCortoZona(delServidor)})</option>
      {regiones.map(([region, suyas]) => (
        <optgroup key={region} label={region.replace(/_/g, ' ')}>
          {suyas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
