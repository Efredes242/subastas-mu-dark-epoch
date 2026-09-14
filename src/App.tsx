import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type EstadoConAviso } from './api';
import { useTema } from './componentes/BotonTema';
import { ProveedorClases } from './componentes/Clase';
import Login from './paginas/Login';
import Tablero from './paginas/Tablero';
import Admin from './paginas/Admin';
import Jugador from './paginas/Jugador';
import { CambiarClave } from './paginas/CambiarClave';

export function ir(ruta: string) {
  if (window.location.pathname === ruta) return;
  window.history.pushState({}, '', ruta);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function useRuta(): string {
  const [ruta, setRuta] = useState(window.location.pathname);
  useEffect(() => {
    const alCambiar = () => setRuta(window.location.pathname);
    window.addEventListener('popstate', alCambiar);
    return () => window.removeEventListener('popstate', alCambiar);
  }, []);
  return ruta;
}

export default function App() {
  const ruta = useRuta();
  const [tema, alternarTema] = useTema();
  const [estado, setEstado] = useState<EstadoConAviso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState('');

  const recargar = useCallback(async () => {
    try {
      setEstado(await api<EstadoConAviso>('/estado'));
      setFallo('');
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se pudo conectar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // Mientras hay un Kundun en curso, refrescamos cada 8 s para ver lo que carga el admin.
  useEffect(() => {
    if (!estado?.evento || estado.evento.cerrado) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void recargar();
    }, 8000);
    return () => clearInterval(t);
  }, [estado?.evento, recargar]);

  if (cargando) {
    return (
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center' }}>
        <div className="cargando" />
      </div>
    );
  }

  if (!estado) {
    return (
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="aviso mal" style={{ maxWidth: 420 }}>
          {fallo || 'No se pudo cargar la app.'}
        </div>
      </div>
    );
  }

  const props = { estado, setEstado, recargar, tema, alternarTema };
  const conClases = (pantalla: ReactNode) => (
    <ProveedorClases clases={estado.clases}>{pantalla}</ProveedorClases>
  );

  /*
   * Sin sesión no se ve nada, ni siquiera el tablero.
   *
   * Va antes que cualquier ruta a propósito: así el login también atiende los rebotes de Google,
   * que vuelven a "/" con el motivo en la URL. Con el tablero abierto de par en par, ese mensaje
   * no lo leía nadie y el intento fallido parecía un parpadeo.
   */
  if (!estado.yo) {
    return <Login tema={tema} alternarTema={alternarTema} alEntrar={recargar} googleActivo={estado.googleActivo} />;
  }

  // Con la contraseña que le puso el admin todavía sin cambiar, lo único que se puede hacer es
  // elegir la propia. El servidor rechaza el resto igual.
  if (estado.yo.debeCambiarClave) {
    return <CambiarClave estado={estado} tema={tema} alternarTema={alternarTema} alListo={recargar} />;
  }

  if (ruta === '/admin') {
    // El jugador entra a su propia pantalla: ve lo mismo que el que reparte, pero no puede tocar
    // nada. No es el panel con los botones escondidos, es otra pantalla que no sabe escribir.
    if (estado.yo.rol === 'jugador') return conClases(<Jugador {...props} />);
    return conClases(<Admin {...props} />);
  }

  return conClases(<Tablero {...props} />);
}

export interface PropsPagina {
  estado: EstadoConAviso;
  setEstado: (e: EstadoConAviso) => void;
  recargar: () => Promise<void>;
  tema: 'oscuro' | 'claro';
  alternarTema: () => void;
}
