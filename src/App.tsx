import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api, type EstadoConAviso } from './api';
import { useTema } from './componentes/BotonTema';
import { ProveedorClases } from './componentes/Clase';
import Login from './paginas/Login';
import Tablero from './paginas/Tablero';
import Admin from './paginas/Admin';

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

  // Solo hay dos pantallas: el tablero público y el panel, que es el único con contraseña.
  if (ruta === '/admin') {
    if (!estado.yo) {
      return <Login tema={tema} alternarTema={alternarTema} alEntrar={recargar} googleActivo={estado.googleActivo} />;
    }
    // La Grand Master entra al panel: carga drops y reparte, pero no ve miembros ni el orden.
    if (estado.yo.rol === 'invitado') {
      ir('/');
      return null;
    }
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
