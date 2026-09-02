import { claseDe } from '../../worker/clases';

/**
 * El retrato de la clase de un personaje. Sin clase asignada no dibuja nada:
 * el nombre queda solo, sin un hueco vacío al lado.
 */
export function RetratoClase({ clase, tam = 30 }: { clase: string; tam?: number }) {
  const info = claseDe(clase);
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
