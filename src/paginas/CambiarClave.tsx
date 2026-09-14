import { useState } from 'react';
import { api, type EstadoConAviso } from '../api';
import type { PropsPagina } from '../App';
import { BotonTema } from '../componentes/BotonTema';
import { Alerta, Escudo } from '../iconos';

/**
 * Elegir la propia contraseña.
 *
 * Sale sola la primera vez que alguien entra con la que le puso el admin: hasta que no elija la
 * suya, esa clave la sabe otro. Mientras tanto la cuenta no hace nada más, y no porque la pantalla
 * lo esconda —el servidor rechaza todo lo que escriba— sino porque no tendría sentido.
 */
export function CambiarClave({
  estado,
  tema,
  alternarTema,
  alListo,
}: {
  estado: EstadoConAviso;
  tema: PropsPagina['tema'];
  alternarTema: () => void;
  alListo: () => Promise<void>;
}) {
  const yo = estado.yo!;
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const corta = nueva.length > 0 && nueva.length < 6;
  const distintas = repetida.length > 0 && nueva !== repetida;
  const lista = nueva.length >= 6 && nueva === repetida;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      await api('/auth/clave', { cuerpo: { nueva } });
      await alListo();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setOcupado(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <BotonTema tema={tema} alternar={alternarTema} />
        </div>

        <form className="panel subir" onSubmit={guardar} style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
            <div className="icono-item r-divino" style={{ width: 46, height: 46, borderRadius: 15 }} aria-hidden="true">
              <Escudo tam={23} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>Elegí tu contraseña</div>
              <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginTop: 2 }}>{yo.personaje}</div>
            </div>
          </div>

          <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Entraste con la contraseña que te pasó el admin, así que la sabe alguien más. Elegí una
            tuya para seguir.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="etiqueta">Tu contraseña nueva</span>
              <input
                className="campo"
                type="password"
                value={nueva}
                autoFocus
                autoComplete="new-password"
                disabled={ocupado}
                onChange={(e) => setNueva(e.target.value)}
                placeholder="al menos 6 caracteres"
                style={{ minHeight: 48 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="etiqueta">Repetila</span>
              <input
                className="campo"
                type="password"
                value={repetida}
                autoComplete="new-password"
                disabled={ocupado}
                onChange={(e) => setRepetida(e.target.value)}
                placeholder="la misma otra vez"
                style={{ minHeight: 48 }}
              />
            </label>

            {(corta || distintas || error) && (
              <div className="aviso mal" style={{ fontSize: 12.5 }}>
                <Alerta tam={16} />
                <span>{error || (corta ? 'Necesita al menos 6 caracteres.' : 'Las dos no coinciden.')}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-oro"
              disabled={ocupado || !lista}
              style={{ minHeight: 52, fontSize: 15 }}
            >
              {ocupado ? <div className="cargando" /> : 'Guardar y entrar'}
            </button>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Es la única vez que ves esta pantalla. Si alguna vez la olvidás, el admin te pone una
            nueva y volvés a pasar por acá.
          </div>
        </form>
      </div>
    </div>
  );
}
