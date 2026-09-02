import { useState } from 'react';
import { BIBLIOTECA, type IconoBiblioteca } from '../biblioteca';
import { achicarImagen } from '../api';
import { Subir } from '../iconos';

/**
 * Elegir la imagen de una clase o de un item.
 *
 * Lo normal es tocar una de la biblioteca: son archivos que ya están en Cloudflare, así que
 * no hay nada que subir. Subir una queda igual como salida de emergencia, para cuando entra
 * algo que todavía no tiene ícono guardado.
 */
export function SelectorIcono({
  tipo,
  actual,
  alElegir,
  alError,
  ocupado,
  alCerrar,
}: {
  tipo: IconoBiblioteca['tipo'];
  actual: string | null;
  alElegir: (imagen: string) => void;
  alError: (m: string) => void;
  ocupado: boolean;
  alCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');

  const termino = busqueda.trim().toLowerCase();
  const opciones = BIBLIOTECA.filter(
    (i) => (termino === '' || i.nombre.toLowerCase().includes(termino)) && (termino !== '' || i.tipo === tipo),
  );

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    try {
      alElegir(await achicarImagen(archivo, 128));
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No pude usar esa imagen.');
    }
  }

  return (
    <div className="selector-icono">
      <div className="cabecera">
        <input
          className="campo campo-chico"
          value={busqueda}
          placeholder={`Buscar entre ${BIBLIOTECA.length} íconos`}
          disabled={ocupado}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button type="button" className="btn btn-chico" onClick={alCerrar}>
          Cerrar
        </button>
      </div>

      {opciones.length === 0 ? (
        <div className="vacio" style={{ padding: 16, fontSize: 12.5 }}>
          No hay ningún ícono con ese nombre.
        </div>
      ) : (
        <div className="grilla-iconos">
          {opciones.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`opcion-icono${actual === i.url ? ' elegido' : ''}`}
              disabled={ocupado}
              title={i.nombre}
              onClick={() => alElegir(i.url)}
            >
              <img src={i.url} alt={i.nombre} width={44} height={44} loading="lazy" />
              <span className="recorte">{i.nombre}</span>
            </button>
          ))}
        </div>
      )}

      <label className="subir-suelta">
        <Subir tam={14} />
        <span>¿No está en la lista? Subir una imagen</span>
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          disabled={ocupado}
          onChange={(ev) => {
            void subir(ev.target.files?.[0]);
            ev.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
