import { useEffect, useState } from 'react';
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

  const opciones = [
    { valor: AUTO, texto: `Automática — la de este equipo (${nombreCortoZona(propia)})` },
    { valor: delServidor, texto: `Hora del servidor (${nombreCortoZona(delServidor)})` },
  ];
  if (!automatica && zona !== delServidor) {
    opciones.push({ valor: zona, texto: `${zona} (${nombreCortoZona(zona)})` });
  }

  return (
    <select
      className="campo campo-chico"
      style={{ width: 'auto', minWidth: 210, maxWidth: '100%', paddingRight: 10, cursor: 'pointer' }}
      value={automatica ? AUTO : zona}
      onChange={(e) => alCambiar(e.target.value)}
      aria-label="Zona horaria"
    >
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.texto}
        </option>
      ))}
    </select>
  );
}
