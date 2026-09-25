import { useRef, useState } from 'react';
import { api } from '../api';
import { Alerta, Mas, Tacho } from '../iconos';

/**
 * Las capturas que acompañan a un aviso.
 *
 * Para decir dónde aparecen los jefes no alcanza con el texto: una captura del mapa con el punto
 * marcado se entiende de un vistazo. Y como los jefes suelen ser varios, un aviso lleva varias.
 *
 * Telegram manda hasta diez juntas como álbum. Cada una puede tener su etiqueta —"Lorencia
 * 132,124"— que se ve al abrir la foto.
 */

export interface ImagenDeAviso {
  id: number;
  etiqueta: string;
}

/** Cuántas entran en un álbum de Telegram. */
const MAXIMAS = 10;

/**
 * Achicar la imagen antes de subirla.
 *
 * Una captura de pantalla cruda son varios megas, y de ese tamaño no sirve a nadie: Telegram la
 * recomprime igual y en el medio ocupa lugar en la base y tarda en subir. Mil seiscientos píxeles
 * de ancho alcanzan para leer un mapa con comodidad.
 *
 * Sale siempre como JPEG, que es lo que Telegram digiere sin quejarse. El webp y el avif, que hoy
 * tira cualquier captura, los rechaza seguido.
 */
async function achicar(archivo: File): Promise<string> {
  const LADO_MAXIMO = 1600;
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((listo, falla) => {
      const i = new Image();
      i.onload = () => listo(i);
      i.onerror = () => falla(new Error('No se pudo leer la imagen.'));
      i.src = url;
    });

    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);

    const pincel = lienzo.getContext('2d');
    if (!pincel) throw new Error('No se pudo procesar la imagen.');
    pincel.drawImage(img, 0, 0, lienzo.width, lienzo.height);

    // Si con buena calidad todavía pesa mucho, se baja de a poco antes que rechazarla.
    for (const calidad of [0.82, 0.7, 0.55, 0.4]) {
      const salida = lienzo.toDataURL('image/jpeg', calidad);
      if (salida.length <= 900_000) return salida;
    }
    throw new Error('Esa imagen pesa demasiado incluso achicada. Recortala un poco.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ImagenesDelAviso({
  avisoId,
  imagenes,
  alCambiar,
  alError,
  ocupado,
}: {
  avisoId: number;
  imagenes: ImagenDeAviso[];
  alCambiar: (imagenes: ImagenDeAviso[]) => void;
  alError: (m: string) => void;
  ocupado: boolean;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function sumar(archivos: FileList | null) {
    if (!archivos || archivos.length === 0) return;
    setSubiendo(true);
    alError('');
    try {
      let ultimas = imagenes;
      // De a una: si la cuarta falla, las tres primeras ya quedaron subidas.
      for (const archivo of Array.from(archivos).slice(0, MAXIMAS - imagenes.length)) {
        const datos = await achicar(archivo);
        const r = await api<{ imagenes: ImagenDeAviso[] }>(`/avisos/${avisoId}/imagenes`, {
          cuerpo: { datos, etiqueta: '' },
        });
        ultimas = r.imagenes;
        alCambiar(ultimas);
      }
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo subir la imagen.');
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  async function correr(fn: () => Promise<{ imagenes: ImagenDeAviso[] }>) {
    alError('');
    try {
      alCambiar((await fn()).imagenes);
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo.');
    }
  }

  const lleno = imagenes.length >= MAXIMAS;

  return (
    <div className="imagenes-aviso">
      <span className="etiqueta">Imágenes que acompañan al aviso</span>

      <div className="tira">
        {imagenes.map((im) => (
          <figure key={im.id} className="captura">
            <img src={`/api/avisos/imagen/${im.id}`} alt={im.etiqueta || 'captura del aviso'} />
            <button
              type="button"
              className="sacar"
              disabled={ocupado || subiendo}
              title="Sacar esta imagen"
              onClick={() => void correr(() => api(`/avisos/imagenes/${im.id}`, { metodo: 'DELETE' }))}
            >
              <Tacho tam={13} />
            </button>
            <figcaption>
              <input
                className="campo campo-chico"
                defaultValue={im.etiqueta}
                disabled={ocupado || subiendo}
                maxLength={80}
                placeholder="Lorencia 132,124"
                title="Se ve al abrir la foto en Telegram"
                onBlur={(e) => {
                  if (e.target.value === im.etiqueta) return;
                  void correr(() =>
                    api(`/avisos/imagenes/${im.id}`, {
                      metodo: 'PATCH',
                      cuerpo: { etiqueta: e.target.value },
                    }),
                  );
                }}
              />
            </figcaption>
          </figure>
        ))}

        {!lleno && (
          <button
            type="button"
            className="sumar-captura"
            disabled={ocupado || subiendo}
            onClick={() => entrada.current?.click()}
          >
            {subiendo ? <div className="cargando" /> : <Mas tam={20} />}
            <span>{subiendo ? 'Subiendo…' : 'Agregar'}</span>
          </button>
        )}
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void sumar(e.target.files)}
      />

      <p className="pie">
        {imagenes.length === 0
          ? 'Sin imágenes el aviso sale como siempre, de texto. Con una o más, sale como foto o como álbum.'
          : `${imagenes.length} de ${MAXIMAS}. Se achican solas y salen como JPEG, que es lo que Telegram no rechaza.`}
      </p>

      {lleno && (
        <div className="aviso" style={{ marginTop: 8, fontSize: 12 }}>
          <Alerta tam={14} /> Telegram no manda más de {MAXIMAS} fotos juntas.
        </div>
      )}
    </div>
  );
}
