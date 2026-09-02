import { createContext, useContext, type ReactNode } from 'react';
import type { Estado } from '../../worker/types';

export type Clase = Estado['clases'][number];

/**
 * Las clases llegan con el estado y se usan en media docena de lugares, varios de ellos
 * lejos de donde vive `estado`. Un contexto evita pasarlas de la mano por toda la pantalla.
 */
const ContextoClases = createContext<Clase[]>([]);

export function ProveedorClases({ clases, children }: { clases: Clase[]; children: ReactNode }) {
  return <ContextoClases.Provider value={clases}>{children}</ContextoClases.Provider>;
}

export const useClases = () => useContext(ContextoClases);

/**
 * El retrato de la clase de un personaje. Sin clase asignada no dibuja nada:
 * el nombre queda solo, sin un hueco vacío al lado.
 */
export function RetratoClase({ clase, tam = 30 }: { clase: string; tam?: number }) {
  const info = useClases().find((c) => c.codigo === clase);
  if (!info) return null;

  return (
    <img
      className="retrato-clase"
      src={info.imagen}
      alt={info.nombre}
      title={info.nombre}
      width={tam}
      height={tam}
      loading="lazy"
      style={{ width: tam, height: tam }}
    />
  );
}
