import { useEffect, useRef, useState } from 'react';
import { api, formatoPC, type EstadoConAviso } from '../api';
import { BotonTema, type Tema } from './BotonTema';
import { RetratoClase, useClases } from './Clase';
import { Alerta, Salir, Tilde } from '../iconos';

const NOMBRE_ROL: Record<string, string> = {
  admin: 'Admin',
  grandmaster: 'Grand Master',
  jugador: 'Jugador',
};

/**
 * La cuenta de quien está mirando, siempre en la misma esquina.
 *
 * Va fija arriba a la derecha en todas las pantallas y para todos los roles: cerrar sesión no
 * puede depender de en qué menú estés ni de encontrar un botón que se confunde con los demás.
 * El botón del tema viene en la misma esquina para que las dos cosas de "la app" vivan juntas.
 */
export function MiCuenta({
  estado,
  tema,
  alternarTema,
}: {
  estado: EstadoConAviso;
  tema: Tema;
  alternarTema: () => void;
}) {
  const clases = useClases();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  const [cambiando, setCambiando] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [problema, setProblema] = useState('');
  const [hecho, setHecho] = useState('');

  const yo = estado.yo;

  // Se cierra al tocar afuera o con Escape, como cualquier menú de cuenta.
  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', afuera);
    window.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', afuera);
      window.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  if (!yo) return null;

  const mio = estado.orden.find((p) => p.id === yo.id);
  const laClase = clases.find((c) => c.codigo === (mio?.clase ?? ''));

  async function cambiarClave() {
    setOcupado(true);
    setProblema('');
    setHecho('');
    try {
      await api('/auth/clave', { cuerpo: { actual, nueva } });
      setHecho('Listo, esa es tu contraseña.');
      setActual('');
      setNueva('');
      setCambiando(false);
    } catch (e) {
      setProblema(e instanceof Error ? e.message : 'No se pudo cambiar.');
    } finally {
      setOcupado(false);
    }
  }

  async function salir() {
    await api('/auth/logout', { cuerpo: {} }).catch(() => {});
    window.location.href = '/';
  }

  return (
    <div className="rincon-cuenta" ref={caja}>
      <BotonTema tema={tema} alternar={alternarTema} />

      <button
        type="button"
        className={`chapa-cuenta${abierto ? ' abierta' : ''}`}
        onClick={() => setAbierto(!abierto)}
        title="Tu cuenta"
      >
        <RetratoClase clase={mio?.clase ?? ''} tam={26} />
        <span className="recorte">{yo.personaje}</span>
      </button>

      {/* Salir siempre a la vista: es lo que uno busca cuando se quiere ir. */}
      <button type="button" className="btn-salir" onClick={() => void salir()} title="Cerrar sesión">
        <Salir tam={17} />
        <span>Salir</span>
      </button>

      {abierto && (
        <div className="panel subir ficha-cuenta" role="dialog" aria-label="Mi cuenta">
          <div className="encabezado">
            <RetratoClase clase={mio?.clase ?? ''} tam={44} />
            <div style={{ minWidth: 0 }}>
              <div className="recorte personaje">{yo.personaje}</div>
              <div className="recorte usuario">{yo.usuario}</div>
            </div>
            <span className="rol">{NOMBRE_ROL[yo.rol] ?? yo.rol}</span>
          </div>

          <div className="datos">
            <div>
              <span className="etiqueta">Clase</span>
              <b>{laClase?.nombre ?? 'sin clase'}</b>
            </div>
            <div>
              <span className="etiqueta">PC de equipo</span>
              <b className="num">{mio ? formatoPC(mio.pc) : '—'}</b>
            </div>
            <div>
              <span className="etiqueta">En el orden</span>
              <b className="num">{mio ? `#${mio.posicion} de ${estado.orden.length}` : '—'}</b>
            </div>
            <div>
              <span className="etiqueta">Listas de drops</span>
              <b>{mio && mio.listas.length > 0 ? mio.listas.join(' · ') : 'ninguna'}</b>
            </div>
          </div>

          {yo.email && (
            <div className="mail">
              <Tilde tam={13} /> Google vinculado a <b>{yo.email}</b>
            </div>
          )}

          {hecho && (
            <div className="aviso aparecer" style={{ marginTop: 12, fontSize: 12 }}>
              <Tilde tam={15} />
              <span>{hecho}</span>
            </div>
          )}

          {!cambiando ? (
            <button
              type="button"
              className="btn btn-chico"
              style={{ marginTop: 12, width: '100%' }}
              onClick={() => {
                setCambiando(true);
                setHecho('');
              }}
            >
              Cambiar mi contraseña
            </button>
          ) : (
            <div className="cambiar-clave">
              <label>
                <span className="etiqueta">Tu contraseña de ahora</span>
                <input
                  className="campo campo-chico"
                  type="password"
                  value={actual}
                  autoComplete="current-password"
                  disabled={ocupado}
                  onChange={(e) => setActual(e.target.value)}
                />
              </label>
              <label>
                <span className="etiqueta">La nueva</span>
                <input
                  className="campo campo-chico"
                  type="password"
                  value={nueva}
                  autoComplete="new-password"
                  placeholder="al menos 6 caracteres"
                  disabled={ocupado}
                  onChange={(e) => setNueva(e.target.value)}
                />
              </label>

              {problema && (
                <div className="aviso mal" style={{ fontSize: 12 }}>
                  <Alerta tam={15} />
                  <span>{problema}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 7 }}>
                <button
                  type="button"
                  className="btn btn-oro btn-chico"
                  style={{ flex: 1 }}
                  disabled={ocupado || nueva.length < 6 || actual.length === 0}
                  onClick={() => void cambiarClave()}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn btn-chico"
                  disabled={ocupado}
                  onClick={() => {
                    setCambiando(false);
                    setProblema('');
                    setActual('');
                    setNueva('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
