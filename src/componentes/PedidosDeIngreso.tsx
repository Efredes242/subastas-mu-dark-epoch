import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alerta, Gente, Tacho, Tilde } from '../iconos';

/**
 * Los pedidos de ingreso, para que el admin los acepte o los rechace.
 *
 * Quien entra con Google y no está cargado en el gremio deja un pedido. Google ya confirmó quién
 * es, así que acá se ve el nombre, la foto y el mail — lo suficiente para reconocer a alguien sin
 * tener que preguntarle nada por fuera de la app.
 *
 * Lo que se completa al aceptar es el nombre del personaje y el rol, y nada más. La clase, el PC y
 * las listas se cargan en Miembros como con cualquier otro: pedirlo todo de apuro en este momento
 * solo consigue que se complete mal.
 */

export interface PedidoDeIngreso {
  id: number;
  email: string;
  nombre: string;
  avatar: string | null;
  estado: 'pendiente' | 'rechazado';
  pedidoEn: string;
  intentos: number;
}

const ROLES: Array<[string, string, string]> = [
  ['jugador', 'Jugador', 'Solo mira: el reparto, quién estuvo y a quién le toca'],
  ['grandmaster', 'Grand Master', 'Además maneja el evento y reparte'],
];

const cuando = (iso: string): string => {
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return '';
  const horas = Math.floor((Date.now() - d.getTime()) / 3_600_000);
  if (horas < 1) return 'hace un rato';
  if (horas < 24) return `hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;
};

export function PedidosDeIngreso({
  alError,
  alResolver,
  cerrable,
}: {
  alError: (m: string) => void;
  /** Para que el panel de atrás se actualice: al aceptar a alguien aparece un miembro nuevo. */
  alResolver: () => void;
  /** Si se muestra como ventana, con su botón de cerrar. */
  cerrable?: () => void;
}) {
  const [pedidos, setPedidos] = useState<PedidoDeIngreso[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  /** El nombre de personaje y el rol que se está tipeando, por pedido. */
  const [alta, setAlta] = useState<Record<number, { personaje: string; rol: string }>>({});

  async function traer() {
    try {
      const r = await api<{ pedidos: PedidoDeIngreso[] }>('/ingresos');
      setPedidos(r.pedidos);
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudieron traer los pedidos.');
    }
  }

  useEffect(() => {
    void traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deQuien = (p: PedidoDeIngreso) =>
    alta[p.id] ?? { personaje: p.nombre.split(' ')[0] ?? '', rol: 'jugador' };

  async function correr(fn: () => Promise<{ pedidos: PedidoDeIngreso[]; aviso?: string }>) {
    setOcupado(true);
    alError('');
    setAviso('');
    try {
      const r = await fn();
      setPedidos(r.pedidos);
      setAviso(r.aviso ?? '');
      alResolver();
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  }

  const pendientes = pedidos?.filter((p) => p.estado === 'pendiente') ?? [];
  const rechazados = pedidos?.filter((p) => p.estado === 'rechazado') ?? [];

  return (
    <section className="panel subir pedidos-ingreso" style={{ padding: 18 }}>
      <div className="cima">
        <h2>
          <Gente tam={16} /> Piden entrar
          {pendientes.length > 0 && <span className="cuantos">{pendientes.length}</span>}
        </h2>
        {cerrable && (
          <button type="button" className="btn btn-chico" onClick={cerrable}>
            Después
          </button>
        )}
      </div>

      <p className="bajada">
        Google confirmó de quién es cada cuenta, pero entrar lo autorizás vos. Al aceptar, la persona
        queda como miembro y ya entra con el mismo botón de Google.
      </p>

      {!pedidos ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 24 }}>
          <div className="cargando" />
        </div>
      ) : pendientes.length === 0 && rechazados.length === 0 ? (
        <div className="vacio">Nadie pidió entrar.</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {pendientes.map((p) => {
            const eleccion = deQuien(p);
            return (
              <div key={p.id} className="pedido">
                <div className="quien">
                  {p.avatar ? (
                    <img src={p.avatar} alt="" className="cara" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="cara sin-foto">{(p.nombre || p.email)[0]?.toUpperCase()}</span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="nombre recorte">{p.nombre || '(sin nombre en Google)'}</div>
                    <div className="mail recorte">{p.email}</div>
                    <div className="desde">
                      {cuando(p.pedidoEn)}
                      {p.intentos > 1 && ` · lo intentó ${p.intentos} veces`}
                    </div>
                  </div>
                </div>

                <div className="alta">
                  <label>
                    <span className="etiqueta">Nombre del personaje</span>
                    <input
                      className="campo campo-chico"
                      value={eleccion.personaje}
                      disabled={ocupado}
                      placeholder="Cómo se llama en el juego"
                      onChange={(e) =>
                        setAlta((previo) => ({ ...previo, [p.id]: { ...eleccion, personaje: e.target.value } }))
                      }
                    />
                  </label>

                  <div>
                    <span className="etiqueta">Con qué rol</span>
                    <div className="chips">
                      {ROLES.map(([id, como, que]) => (
                        <button
                          key={id}
                          type="button"
                          className={`chip-lista${eleccion.rol === id ? ' dentro' : ''}`}
                          disabled={ocupado}
                          title={que}
                          onClick={() => setAlta((previo) => ({ ...previo, [p.id]: { ...eleccion, rol: id } }))}
                        >
                          {como}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="decidir">
                  <button
                    type="button"
                    className="btn btn-chico btn-ok"
                    disabled={ocupado || eleccion.personaje.trim().length < 2}
                    onClick={() =>
                      void correr(() =>
                        api(`/ingresos/${p.id}/aprobar`, {
                          cuerpo: { personaje: eleccion.personaje.trim(), rol: eleccion.rol },
                        }),
                      )
                    }
                  >
                    <Tilde tam={14} /> Aceptar
                  </button>
                  <button
                    type="button"
                    className="btn btn-chico btn-mal"
                    disabled={ocupado}
                    title="No entra. Si vuelve a intentar, no te avisa de nuevo."
                    onClick={() => void correr(() => api(`/ingresos/${p.id}/rechazar`, { cuerpo: {} }))}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            );
          })}

          {rechazados.length > 0 && (
            <div className="rechazados">
              <span className="etiqueta">Rechazados</span>
              <p className="bajada">
                No les avisa de nuevo aunque lo intenten. Borralo para que pueda volver a pedir.
              </p>
              {rechazados.map((p) => (
                <div key={p.id} className="fila-rechazado">
                  <span className="recorte">{p.nombre || p.email}</span>
                  <span className="mail recorte">{p.email}</span>
                  <button
                    type="button"
                    className="btn btn-chico"
                    style={{ width: 34, padding: 0, flexShrink: 0 }}
                    disabled={ocupado}
                    title="Borrar el rechazo: si vuelve a intentar, pide de nuevo"
                    onClick={() => void correr(() => api(`/ingresos/${p.id}`, { metodo: 'DELETE' }))}
                  >
                    <Tacho tam={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aviso && (
        <div className="aviso aparecer" style={{ marginTop: 12, fontSize: 12.5 }}>
          <Tilde tam={16} />
          <span>{aviso}</span>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="aviso" style={{ marginTop: 12, fontSize: 12, display: 'block', lineHeight: 1.5 }}>
          <Alerta tam={14} /> Al aceptar queda con el personaje y el rol de acá. La clase, el PC y las
          listas de drops se cargan después, en Miembros.
        </div>
      )}
    </section>
  );
}
