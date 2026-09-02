import { useEffect, useState } from 'react';
import { Luna, Sol } from '../iconos';

export type Tema = 'oscuro' | 'claro';
const CLAVE = 'sk_tema';

function temaGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro';
  } catch {
    return 'oscuro';
  }
}

/** El tema vive en <html data-tema>, así que el CSS lo resuelve solo. Por defecto, oscuro. */
export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(temaGuardado);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.documentElement.style.colorScheme = tema === 'oscuro' ? 'dark' : 'light';
    try {
      localStorage.setItem(CLAVE, tema);
    } catch {
      /* modo incógnito: el tema simplemente no se recuerda */
    }
  }, [tema]);

  return [tema, () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))];
}

export function BotonTema({ tema, alternar }: { tema: Tema; alternar: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-icono"
      onClick={alternar}
      title={tema === 'oscuro' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
      aria-label={tema === 'oscuro' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}
    >
      {tema === 'oscuro' ? <Sol tam={19} /> : <Luna tam={19} />}
    </button>
  );
}
