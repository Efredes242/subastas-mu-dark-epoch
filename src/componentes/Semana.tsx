/**
 * Lo que salió en una semana.
 *
 * El historial va de a un Kundun; esto es la mirada de arriba — cuánto salió de cada cosa entre
 * lunes y domingo. El mismo panel se usa en el tablero y adentro del panel de admin, con la
 * diferencia de que el admin ve además qué se llevó cada uno (eso lo decide el servidor: el
 * resumen por persona ni siquiera viaja si no lo pide él).
 */
import { useEffect, useState } from 'react';
import { api } from '../api';
import { IconoItem } from '../iconos';
import type { Semana } from '../../worker/semana';

export function PanelSemana({ imagenDe }: { imagenDe: (catalogoId: number | null) => string | null }) {
  const [atras, setAtras] = useState(0);
  const [semana, setSemana] = useState<Semana | null>(null);
  const [error, setError] = useState('');
  const [solapa, setSolapa] = useState<'items' | 'personas'>('items');

  useEffect(() => {
    let vigente = true;
    setError('');
    api<Semana>(`/semana?atras=${atras}`)
      .then((s) => vigente && setSemana(s))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : 'No se pudo cargar la semana.'));
    return () => {
      vigente = false;
    };
  }, [atras]);

  // Mientras carga la semana nueva se deja la anterior en pantalla: parpadear en cada flecha
  // marea más de lo que informa.
  if (!semana) {
    return <div className="vacio">{error || 'Cargando…'}</div>;
  }

  const porPersona = semana.porPersona;

  return (
    <div className="semana">
      <div className="semana-barra">
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => setAtras(atras + 1)}
          disabled={!semana.hayAnterior}
        >
          ‹ Anterior
        </button>
        <div className="semana-cuando">
          <b>{semana.atras === 0 ? 'Esta semana' : semana.etiqueta}</b>
          <span>
            {semana.atras === 0 && `${semana.etiqueta} · `}
            {semana.kundunes === 0
              ? 'sin drops todavía'
              : `${semana.kundunes} Kundun · ${semana.total} ${semana.total === 1 ? 'drop' : 'drops'}`}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => setAtras(Math.max(0, atras - 1))}
          disabled={atras === 0}
        >
          Siguiente ›
        </button>
      </div>

      {error && <div className="vacio">{error}</div>}

      {porPersona && (
        <div className="solapas-drops">
          <button type="button" className={solapa === 'items' ? 'activa' : ''} onClick={() => setSolapa('items')}>
            Qué salió
          </button>
          <button type="button" className={solapa === 'personas' ? 'activa' : ''} onClick={() => setSolapa('personas')}>
            Por persona
          </button>
        </div>
      )}

      {semana.items.length === 0 ? (
        <div className="vacio">
          {atras === 0 ? 'Todavía no salió nada esta semana.' : 'Esa semana no se repartió nada.'}
        </div>
      ) : solapa === 'items' || !porPersona ? (
        <div className="semana-items">
          {semana.items.map((it) => (
            <div className="semana-item" key={it.nombre}>
              <IconoItem icono="caja" imagen={imagenDe(it.catalogoId)} rareza="comun" tam={34} />
              <span className="semana-nombre">{it.nombre}</span>
              <span className="semana-cuantos">{it.cantidad}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="semana-personas">
          {porPersona.map((p) => (
            <div className="semana-persona" key={p.personaje}>
              <div className="semana-quien">
                <b>{p.personaje}</b>
                <span className="semana-cuantos">{p.total}</span>
              </div>
              <div className="semana-suyos">
                {p.items.map((it) => (
                  <div className="semana-suyo" key={it.nombre}>
                    <IconoItem icono="caja" imagen={imagenDe(it.catalogoId)} rareza="comun" tam={26} />
                    <span>{it.nombre}</span>
                    <b>{it.cantidad}</b>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
