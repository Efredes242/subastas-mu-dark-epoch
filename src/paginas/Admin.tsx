import { useEffect, useState } from 'react';
import { api, comoGmt, fechaHoraEn, formatoPC, horaEn, horariosEnZona, leerPC, marcaDeListas, nombreCortoZona, restante, type EstadoConAviso } from '../api';
import { BotonTema } from '../componentes/BotonTema';
import { RetratoClase, useClases } from '../componentes/Clase';
import { SelectorIcono } from '../componentes/SelectorIcono';
import { SelectorZona, useZona } from '../componentes/Zona';
import { ir, type PropsPagina } from '../App';
import {
  Abajo,
  Alerta,
  Arriba,
  Escudo,
  Gente,
  Glifo,
  IconoItem,
  Mas,
  Orden,
  Reloj,
  Subir,
  Tacho,
  Tilde,
} from '../iconos';

type Solapa = 'evento' | 'catalogo' | 'listas' | 'miembros';

/** De qué lista sale cada drop. La rareza y el ícono ya no se eligen: manda la imagen. */
/** Las tres listas: clave, nombre corto para el panel y nombre largo. */
const LISTAS = [
  ['items', 'Kundun', 'Items del Kundun'],
  ['almas', 'Almas', 'Almas de guerra'],
  ['asedio', 'Asedio', 'Castle Siege'],
] as const;

const LISTA_DE: Record<string, string> = {
  items: 'Lista de items del Kundun',
  almas: 'Lista de almas de guerra',
  asedio: 'Lista del Castle Siege',
};

const ROLES = [
  ['invitado', 'Invitado'],
  ['grandmaster', 'Grand Master'],
  ['admin', 'Admin'],
] as const;

interface Miembro {
  id: number;
  usuario: string;
  personaje: string;
  email: string | null;
  rol: 'admin' | 'grandmaster' | 'invitado';
  pc: number;
  activo: boolean;
  clase: string;
  tieneGoogle: boolean;
  tienePassword: boolean;
}

interface EntradaCatalogo {
  id: number;
  clave: string;
  nombre: string;
  alias: string;
  rareza: string;
  icono: string;
  imagen: string | null;
  veces: number;
  /** El nombre de otro item que usa esta clave como alias, si lo hay. */
  choque: string | null;
  /** En qué listas sale. La CQC cae en el Kundun y en el asedio; el Cofre, solo en el asedio. */
  colas: string[];
}

/**
 * La lista para marcar quiénes estuvieron. La usan dos lugares: el cartel que salta cuando
 * arranca el Kundun y el paso 1 del panel, para corregirla después.
 */
function ListaAsistencia({
  estado,
  evento,
  ocupado,
  accion,
}: {
  estado: EstadoConAviso;
  evento: NonNullable<EstadoConAviso['evento']>;
  ocupado: boolean;
  accion: (fn: () => Promise<EstadoConAviso>) => Promise<void>;
}) {
  const vinieron = estado.orden.filter((p) => p.vino).length;

  return (
    <>
        <div style={{ display: 'flex', gap: 7, padding: '0 6px 10px' }}>
          <button
            type="button"
            className="btn btn-chico"
            style={{ flex: 1 }}
            disabled={ocupado}
            onClick={() => accion(() => api(`/eventos/${evento.id}/presentes/todos`, { cuerpo: { presente: true } }))}
          >
            Fueron todos
          </button>
          <button
            type="button"
            className="btn btn-chico"
            style={{ flex: 1 }}
            disabled={ocupado || vinieron === 0}
            onClick={() => accion(() => api(`/eventos/${evento.id}/presentes/todos`, { cuerpo: { presente: false } }))}
          >
            Limpiar
          </button>
        </div>

        {estado.orden.map((p) => (
          <button
            key={p.id}
            type="button"
            className="fila"
            disabled={ocupado}
            onClick={() =>
              accion(() => api(`/eventos/${evento.id}/presentes`, { cuerpo: { usuarioId: p.id, presente: !p.vino } }))
            }
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '10px 8px',
              border: 'none',
              background: p.vino ? 'var(--okBg)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              color: 'var(--tx)',
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                flexShrink: 0,
                borderRadius: 7,
                border: `1px solid ${p.vino ? 'var(--ok)' : 'var(--line2)'}`,
                background: p.vino ? 'var(--ok)' : 'transparent',
                color: 'var(--okBg)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {p.vino && <Tilde tam={14} />}
            </span>
            <RetratoClase clase={p.clase} tam={22} />
            <span className="recorte" style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>
              {p.personaje}
            </span>
            <span className="num" style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx3)', flexShrink: 0 }}>
              {formatoPC(p.pc)}
            </span>
          </button>
        ))}
    </>
  );
}

/** El último Kundun del que ya se avisó, para no repetir el cartel en cada refresco. */
const AVISADO = 'sk_avisado';

function yaAvisado(): number | null {
  try {
    const guardado = localStorage.getItem(AVISADO);
    return guardado ? Number(guardado) : null;
  } catch {
    return null;
  }
}

/**
 * El cartel que salta cuando arranca un Kundun.
 *
 * El panel se refresca solo cada 8 segundos, así que el evento aparece sin que nadie recargue
 * y el cartel se abre encima. Sirve para dos cosas: enterarse de que empezó, y acordarse de que
 * la asistencia va antes que los drops.
 *
 * Se muestra una vez por Kundun. Si ya se confirmó la asistencia no aparece: no hay nada que
 * recordar. Las pruebas tampoco lo abren, que se piden a propósito.
 */
function AvisoDeKundun({
  estado,
  evento,
  zona,
  ocupado,
  accion,
  alCerrar,
}: {
  estado: EstadoConAviso;
  evento: NonNullable<EstadoConAviso['evento']>;
  zona: string;
  ocupado: boolean;
  accion: (fn: () => Promise<EstadoConAviso>) => Promise<void>;
  alCerrar: () => void;
}) {
  const vinieron = estado.orden.filter((p) => p.vino).length;
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [alCerrar]);

  return (
    <div className="hoja" onClick={alCerrar} role="presentation">
      <div
        className="hoja-cuerpo aviso-kundun"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Empezó el Kundun"
      >
        <div className="sello-kundun">
          <Escudo tam={30} />
        </div>

        <h2>Empezó el Kundun #{evento.numero}</h2>
        <p className="cuando">{evento.empiezaEn ? fechaHoraEn(evento.empiezaEn, zona) : 'ahora'}</p>

        <p className="para-que">
          Marcá quiénes estuvieron. Recién después se habilita cargar los drops, que se reparten
          solos entre estos.
        </p>

        <div className="gente">
          <ListaAsistencia estado={estado} evento={evento} ocupado={ocupado} accion={accion} />
        </div>

        <div className="cierre">
          <button
            type="button"
            className="btn btn-ok"
            style={{ width: '100%', justifyContent: 'center' }}
            disabled={ocupado || vinieron === 0}
            onClick={() => accion(() => api(`/eventos/${evento.id}/asistencia`, { cuerpo: { listo: true } }))}
          >
            <Tilde tam={16} />
            {vinieron === 0 ? 'Marcá al menos a uno' : `Listo, estuvieron ${vinieron}`}
          </button>
          <button type="button" className="btn btn-chico" style={{ width: '100%', justifyContent: 'center' }} onClick={alCerrar}>
            Lo hago después
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin({ estado, setEstado, recargar, tema, alternarTema }: PropsPagina) {
  const yo = estado.yo!;
  const esAdmin = yo.rol === 'admin';

  const [solapa, setSolapa] = useState<Solapa>('evento');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());
  const [zona, setZona] = useZona(yo.zona);

  const [lote, setLote] = useState('');
  const [avisado, setAvisado] = useState<number | null>(() => yaAvisado());
  const [loteAsedio, setLoteAsedio] = useState('');

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const evento = estado.evento;
  const cuenta = restante(evento?.cierraEn ?? null, ahora);
  const abierto = !!evento && evento.registroAbierto && cuenta !== null;
  const sinAsignar = estado.items.filter((i) => i.estado === 'abierto').length;
  const vinieron = estado.orden.filter((p) => p.vino).length;

  async function accion(fn: () => Promise<EstadoConAviso>) {
    setOcupado(true);
    setError('');
    try {
      const r = await fn();
      setEstado(r);
      setAviso(r.aviso ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  const domingo = estado.agenda.esDomingo;

  const cargarLote = () =>
    accion(async () => {
      let r: EstadoConAviso | null = null;
      if (lote.trim().length >= 2) {
        r = await api('/items/lote', { cuerpo: { texto: lote } });
        setLote('');
      }
      // Los del asedio entran forzados a su lista aunque el catálogo los tenga como items.
      if (domingo && loteAsedio.trim().length >= 2) {
        r = await api('/items/lote', { cuerpo: { texto: loteAsedio, cola: 'asedio' } });
        setLoteAsedio('');
      }
      return r ?? estado;
    });

  const mover = (indice: number, delta: number) => {
    const ids = estado.orden.map((p) => p.id);
    const destino = indice + delta;
    if (destino < 0 || destino >= ids.length) return;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    return accion(() => api('/orden', { cuerpo: { ids } }));
  };

  // Un Kundun nuevo, sin la asistencia confirmada y del que todavía no se avisó.
  const avisar = !!evento && !evento.esPrueba && !evento.asistenciaLista && avisado !== evento.id;

  const cerrarAviso = () => {
    if (!evento) return;
    setAvisado(evento.id);
    try {
      localStorage.setItem(AVISADO, String(evento.id));
    } catch {
      // Storage bloqueado: el cartel vuelve a salir en el próximo refresco y no pasa nada.
    }
  };

  return (
    <div className="pagina-ancha">
      {avisar && evento && (
        <AvisoDeKundun
          estado={estado}
          evento={evento}
          zona={zona}
          ocupado={ocupado}
          accion={accion}
          alCerrar={cerrarAviso}
        />
      )}

      <div className="barra-admin">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
          <div className="icono-item r-divino" style={{ width: 40, height: 40, borderRadius: 13 }}>
            <Escudo tam={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {evento ? `Kundun #${evento.numero}` : 'Sin Kundun en curso'}
          </h1>
          {evento ? (
            <>
              <span className={`pastilla ${abierto ? 'ok' : 'mal'}`}>
                <span className="punto latir" />
                {abierto ? 'Registro abierto' : 'Registro cerrado'}
              </span>
              <span
                className="num"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--tx2)' }}
              >
                <Reloj tam={15} />
                {cuenta ?? '00:00'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)' }}>
                {vinieron} anotados
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--tx3)' }}>
              Próximo a las {horaEn(estado.agenda.proximo.empieza, zona)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
          <SelectorZona zona={zona} alCambiar={setZona} offsetServidor={estado.agenda.offsetServidorHoras} />
          <button type="button" className="btn btn-chico" onClick={() => ir('/')}>
            Ver el tablero
          </button>
          <BotonTema tema={tema} alternar={alternarTema} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" className={`btn btn-chico${solapa === 'evento' ? ' btn-suave' : ''}`} onClick={() => setSolapa('evento')}>
          <Escudo tam={15} /> Evento
        </button>
        <button type="button" className={`btn btn-chico${solapa === 'catalogo' ? ' btn-suave' : ''}`} onClick={() => setSolapa('catalogo')}>
          <Glifo nombre="joya" tam={15} /> Catálogo
        </button>
        {esAdmin && (
          <button type="button" className={`btn btn-chico${solapa === 'listas' ? ' btn-suave' : ''}`} onClick={() => setSolapa('listas')}>
            <Gente tam={15} /> Listas
          </button>
        )}
        {esAdmin && (
          <button type="button" className={`btn btn-chico${solapa === 'miembros' ? ' btn-suave' : ''}`} onClick={() => setSolapa('miembros')}>
            <Gente tam={15} /> Miembros
          </button>
        )}
      </div>

      {error && (
        <div className="aviso mal aparecer" style={{ marginBottom: 16 }}>
          <Alerta tam={17} />
          <span>{error}</span>
        </div>
      )}

      {evento?.esPrueba && (
        <div
          className="aviso aparecer"
          style={{ marginBottom: 16, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}
        >
          <span>
            <b>Estás en un Kundun de prueba.</b> No cuenta para el historial y las ruedas vuelven a su lugar
            cuando lo borres. Probá lo que quieras.
          </span>
          {esAdmin && (
            <button
              type="button"
              className="btn btn-mal btn-chico"
              disabled={ocupado}
              onClick={() => accion(() => api('/eventos/prueba', { metodo: 'DELETE' }))}
            >
              Terminar la prueba
            </button>
          )}
        </div>
      )}

      {solapa === 'listas' && esAdmin && <Listas estado={estado} alError={setError} setEstado={setEstado} />}
      {solapa === 'miembros' && esAdmin && (
        <div style={{ marginBottom: 16 }}>
          <Clases estado={estado} alError={setError} setEstado={setEstado} />
        </div>
      )}
      {solapa === 'miembros' && esAdmin && <Miembros alError={setError} alListo={recargar} yoId={yo.id} />}
      {solapa === 'catalogo' && <Catalogo estado={estado} alError={setError} alListo={recargar} setEstado={setEstado} />}

      {solapa === 'evento' && (
        <div className="admin-grid">
          <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            {!evento ? (
              <div className="panel subir" style={{ padding: 24, display: 'grid', gap: 14, justifyItems: 'start' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>No hay ningún Kundun en curso</h2>
                  <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                    Se abre solo {estado.agenda.abreAntesMin} minutos antes de cada horario. El próximo es a las{' '}
                    <b style={{ color: 'var(--tx2)' }}>{horaEn(estado.agenda.proximo.empieza, zona)}</b> (registro desde
                    las {horaEn(estado.agenda.proximo.abre, zona)}).
                  </p>
                </div>
                {esAdmin && (
                  <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
                    <button type="button" className="btn" disabled={ocupado} onClick={() => accion(() => api('/eventos', { cuerpo: {} }))}>
                      <Mas tam={16} /> Abrir uno fuera de hora
                    </button>
                    <button
                      type="button"
                      className="btn btn-suave"
                      disabled={ocupado}
                      title="Abre un Kundun de mentira con todo el gremio y drops de ejemplo"
                      onClick={() => accion(() => api('/eventos/prueba', { cuerpo: {} }))}
                    >
                      Probar un Kundun
                    </button>
                    <button
                      type="button"
                      className="btn btn-suave"
                      disabled={ocupado}
                      title="Como el anterior, pero se hace pasar por domingo: aparecen los dos campos de carga, el del Kundun y el del asedio"
                      onClick={() => accion(() => api('/eventos/prueba', { cuerpo: { domingo: true } }))}
                    >
                      Probar un domingo
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <section className="panel subir" style={{ padding: 18 }}>
                <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800 }}>
                  <span className="paso">2</span> Cargar lo que salió subastado
                </h2>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
                  Pegalo tal cual, separado por comas o por renglones. Cada unidad entra como un item aparte,
                  porque cada una la puja una persona distinta. <b>Al cargar se reparten solos</b>, siguiendo
                  la rueda de cada item.
                  {domingo && ' Hoy es domingo: separá los drops del asedio en el segundo campo.'}
                </p>

                {!evento.asistenciaLista && (
                  <div className="aviso" style={{ marginBottom: 12, fontSize: 13, lineHeight: 1.45 }}>
                    <Alerta tam={17} />
                    <span>
                      Primero marcá arriba quiénes estuvieron y tocá <b>Listo</b>. El reparto sale en el
                      momento de la carga, así que necesita saber entre quiénes.
                    </span>
                  </div>
                )}

                <div className={domingo ? 'campos-domingo' : undefined}>
                  <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                    {domingo && <span className="etiqueta">Drops del Kundun</span>}
                    <textarea
                      className="campo"
                      value={lote}
                      disabled={!evento.asistenciaLista}
                      onChange={(e) => setLote(e.target.value)}
                      placeholder={'1 cqc, 2 condor flame, 2 almas de guerra'}
                      rows={3}
                      style={{ padding: 14, minHeight: 92, lineHeight: 1.5, resize: 'vertical', fontSize: 15 }}
                    />
                  </label>

                  {domingo && (
                    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                      <span className="etiqueta">Drops del Castle Siege</span>
                      <textarea
                        className="campo"
                        value={loteAsedio}
                        disabled={!evento.asistenciaLista}
                        onChange={(e) => setLoteAsedio(e.target.value)}
                        placeholder={'1 cofre de asedio, 2 joyas'}
                        rows={3}
                        style={{ padding: 14, minHeight: 92, lineHeight: 1.5, resize: 'vertical', fontSize: 15 }}
                      />
                    </label>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn btn-oro"
                    disabled={
                      ocupado || !evento.asistenciaLista || (lote.trim().length < 2 && loteAsedio.trim().length < 2)
                    }
                    onClick={cargarLote}
                  >
                    <Mas tam={16} /> Cargar y repartir
                  </button>
                  <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
                    Los nombres nuevos quedan en el catálogo para ponerles la imagen una sola vez.
                  </span>
                </div>
              </section>
            )}

            {evento && (
              <section className="panel subir" style={{ padding: '17px 14px 14px', minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 14,
                    flexWrap: 'wrap',
                    padding: '0 4px 14px',
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Botín del evento</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx3)' }}>
                      {sinAsignar} sin repartir de {estado.items.length}
                    </span>
                    <button
                      type="button"
                      className="btn btn-oro btn-chico"
                      disabled={ocupado || sinAsignar === 0}
                      onClick={() => accion(() => api(`/eventos/${evento.id}/repartir`, { cuerpo: {} }))}
                    >
                      <Orden tam={15} /> Cerrar subasta y repartir
                    </button>
                  </div>
                </div>

                {aviso && (
                  <div className="aviso aparecer" style={{ margin: '0 4px 12px' }}>
                    <Orden tam={16} />
                    <span>{aviso}</span>
                  </div>
                )}

                {estado.items.length === 0 ? (
                  <div className="vacio">Todavía no cargaste ningún item.</div>
                ) : (
                  <div className="escalonado">
                    {estado.items.map((it) => (
                      <div key={it.id} className={`fila item-admin r-${it.rareza}`}>
                        <div className="datos">
                          <IconoItem icono={it.icono} imagen={it.imagen} rareza={it.rareza} tam={40} />
                          <div style={{ minWidth: 0 }}>
                            <div className="recorte" style={{ fontSize: 14, fontWeight: 700 }}>
                              {it.etiqueta}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 3 }}>
                              {LISTA_DE[it.cola] ?? it.cola}
                            </div>
                          </div>
                        </div>

                        <div className="dueno">
                          <div className="recorte" style={{ fontSize: 14, fontWeight: 700, color: it.dueno ? 'var(--oro)' : 'var(--tx3)' }}>
                            {it.dueno ?? 'Sin repartir'}
                          </div>
                          {it.metodo && (
                            <div className="recorte" style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--tx3)', marginTop: 2 }}>
                              {it.metodo}
                            </div>
                          )}
                        </div>

                        <div className="acciones">
                          {it.estado === 'abierto' && (
                            <button type="button" className="btn btn-suave btn-chico" disabled={ocupado} onClick={() => accion(() => api(`/items/${it.id}/asignar`, { cuerpo: {} }))}>
                              Repartir
                            </button>
                          )}
                          {it.estado === 'reclamado' && (
                            <button type="button" className="btn btn-ok btn-chico" disabled={ocupado} onClick={() => accion(() => api(`/items/${it.id}/entregar`, { cuerpo: {} }))}>
                              Ya lo ganó
                            </button>
                          )}
                          {it.estado === 'entregado' && (
                            <button type="button" className="btn btn-chico" disabled={ocupado} onClick={() => accion(() => api(`/items/${it.id}/reabrir`, { cuerpo: {} }))}>
                              Reabrir
                            </button>
                          )}
                          <button type="button" className="btn btn-chico" style={{ width: 36, padding: 0 }} title="Borrar item" disabled={ocupado} onClick={() => accion(() => api(`/items/${it.id}`, { metodo: 'DELETE' }))}>
                            <Tacho tam={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
            {evento && (
              <section className="panel subir" style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div className="etiqueta">{evento.esPrueba ? 'Kundun de prueba' : `Kundun #${evento.numero}`}</div>
                    <div
                      className="marca"
                      style={{
                        fontSize: 19,
                        marginTop: 6,
                        lineHeight: 1.15,
                        fontWeight: 800,
                        color: evento.asistenciaLista ? 'var(--ok)' : 'var(--av)',
                      }}
                    >
                      {evento.asistenciaLista ? 'Listo para cargar' : 'Falta marcar quiénes estuvieron'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="etiqueta">Cierra en</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 800, marginTop: 5, lineHeight: 1 }}>
                      {cuenta ?? '00:00'}
                    </div>
                  </div>
                </div>

                {evento.empiezaEn && (
                  <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginTop: 12, lineHeight: 1.5 }}>
                    Kundun de las {horaEn(evento.empiezaEn, zona)}
                    {evento.abreEn ? ` · abrió ${horaEn(evento.abreEn, zona)}` : ''}
                  </div>
                )}

                {esAdmin && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                    <button type="button" className={`btn btn-chico ${evento.registroAbierto ? 'btn-mal' : 'btn-ok'}`} disabled={ocupado} onClick={() => accion(() => api(`/eventos/${evento.id}`, { metodo: 'PATCH', cuerpo: { registroAbierto: !evento.registroAbierto } }))}>
                      {evento.registroAbierto ? 'Cerrar registro' : 'Reabrir registro'}
                    </button>
                    <button type="button" className="btn btn-chico" disabled={ocupado} onClick={() => accion(() => api(`/eventos/${evento.id}`, { metodo: 'PATCH', cuerpo: { minutos: 15 } }))}>
                      +15 min
                    </button>
                    <button type="button" className="btn btn-chico" disabled={ocupado} onClick={() => accion(() => api(`/eventos/${evento.id}`, { metodo: 'PATCH', cuerpo: { cerrado: true } }))}>
                      Cerrar evento
                    </button>
                  </div>
                )}
              </section>
            )}

            {evento && (
              <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px' }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                    <span className="paso">1</span> ¿Quiénes estuvieron?
                  </h2>
                  <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--oro)' }}>
                    {vinieron}/{estado.orden.length}
                  </span>
                </div>
                <p style={{ margin: '5px 6px 10px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.45 }}>
                  Solo estos entran en el reparto, y solo si además están en la lista del item que salga.
                  Al que no marques se lo saltea y pierde la vuelta.
                </p>

                <ListaAsistencia estado={estado} evento={evento} ocupado={ocupado} accion={accion} />

                <div style={{ padding: '12px 6px 4px' }}>
                  {evento.asistenciaLista ? (
                    <button
                      type="button"
                      className="btn btn-chico"
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={ocupado}
                      title="Vuelve a abrir el paso 1 para corregir quién estuvo"
                      onClick={() => accion(() => api(`/eventos/${evento.id}/asistencia`, { cuerpo: { listo: false } }))}
                    >
                      Corregir la asistencia
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ok"
                      style={{ width: '100%', justifyContent: 'center' }}
                      disabled={ocupado || vinieron === 0}
                      onClick={() => accion(() => api(`/eventos/${evento.id}/asistencia`, { cuerpo: { listo: true } }))}
                    >
                      <Tilde tam={16} />
                      {vinieron === 0 ? 'Marcá al menos a uno' : `Listo, estuvieron ${vinieron}`}
                    </button>
                  )}
                </div>
              </section>
            )}

            <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px' }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Orden de prioridad</h2>
                <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--oro)' }}>
                  {estado.orden.length}
                </span>
              </div>

              <p style={{ margin: '5px 6px 0', fontSize: 12, color: 'var(--tx3)', lineHeight: 1.45 }}>
                Este es el orden base. El turno de cada item corre por su cuenta y se ajusta desde el
                catálogo.
              </p>

              {esAdmin && (
                <button
                  type="button"
                  className="btn btn-suave btn-chico"
                  style={{ width: 'calc(100% - 12px)', margin: '11px 6px 8px', minHeight: 38 }}
                  disabled={ocupado}
                  onClick={() => accion(() => api('/orden/por-pc', { cuerpo: {} }))}
                >
                  <Orden tam={15} /> Ordenar por PC
                </button>
              )}

              <div className="scroll" style={{ maxHeight: 460, marginTop: esAdmin ? 0 : 10 }}>
                {estado.orden.map((p, i) => (
                  <div key={p.id} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 6px', opacity: evento && !p.vino ? 0.5 : 1 }}>
                    <div
                      className="num"
                      style={{
                        width: 25,
                        height: 25,
                        flexShrink: 0,
                        borderRadius: 9,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11.5,
                        fontWeight: 800,
                        background: i === 0 ? 'var(--oro)' : 'var(--panel2)',
                        color: i === 0 ? 'var(--sobreOro)' : 'var(--tx3)',
                      }}
                    >
                      {p.posicion}
                    </div>
                    <RetratoClase clase={p.clase} tam={22} />
                    <div className="recorte" style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>
                      {p.personaje}
                      {marcaDeListas(p.listas) && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tx3)', marginLeft: 6 }}>
                          {marcaDeListas(p.listas)}
                        </span>
                      )}
                    </div>
                    <span className="num" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--tx2)', flexShrink: 0 }}>
                      {formatoPC(p.pc)}
                    </span>

                    {esAdmin && (
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        <button type="button" className="btn" style={{ width: 26, minHeight: 26, padding: 0, borderRadius: 8 }} disabled={ocupado || i === 0} title="Subir en el orden" onClick={() => mover(i, -1)}>
                          <Arriba tam={12} />
                        </button>
                        <button type="button" className="btn" style={{ width: 26, minHeight: 26, padding: 0, borderRadius: 8 }} disabled={ocupado || i === estado.orden.length - 1} title="Bajar en el orden" onClick={() => mover(i, 1)}>
                          <Abajo tam={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {estado.anterior && (
              <section className="panel subir" style={{ padding: '16px 14px 12px' }}>
                <h2 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, padding: '0 4px' }}>
                  Puja anterior · #{estado.anterior.numero}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '0 4px 10px' }}>
                  {fechaHoraEn(estado.anterior.fecha, zona)}
                </div>
                {estado.anterior.items.slice(0, 8).map((it) => (
                  <div key={it.id} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px' }}>
                    <div className="recorte" style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
                      {it.etiqueta}
                    </div>
                    <span className="recorte" style={{ fontSize: 12.5, fontWeight: 700, color: it.dueno ? 'var(--oro)' : 'var(--tx3)', maxWidth: 110 }}>
                      {it.dueno ?? '—'}
                    </span>
                  </div>
                ))}
              </section>
            )}

            {esAdmin && <CajaHorario estado={estado} alError={setError} setEstado={setEstado} zona={zona} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Catálogo ──────────────────────────────────────────────────────────────────

/** En la base los alias van entre barras ("|pluma||plumas|"); acá se ven como lista. */
const aliasComoTexto = (alias: string) =>
  alias
    .split('|')
    .filter(Boolean)
    .join(', ');

/** Todo lo que se puede escribir para cargar este item: la clave y sus alias. */
const palabrasDe = (e: { clave: string; alias: string }) =>
  [e.clave, ...e.alias.split('|').filter(Boolean)].filter((p, i, todas) => todas.indexOf(p) === i);

function Catalogo({
  estado,
  alError,
  alListo,
  setEstado,
}: {
  estado: PropsPagina['estado'];
  alError: (m: string) => void;
  alListo: () => Promise<void>;
  setEstado: (e: EstadoConAviso) => void;
}) {
  const [lista, setLista] = useState<EntradaCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  async function traer() {
    try {
      const r = await api<{ catalogo: EntradaCatalogo[] }>('/catalogo');
      setLista(r.catalogo);
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo traer el catálogo.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardar(id: number, cambios: Record<string, unknown>) {
    setOcupado(true);
    alError('');
    try {
      const r = await api<{ ok: boolean; aviso?: string }>(`/catalogo/${id}`, { metodo: 'PATCH', cuerpo: cambios });
      // El servidor descarta los alias que ya son la forma de escribir otro item.
      if (r.aviso) alError(r.aviso);
      await traer();
      await alListo();
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setOcupado(false);
    }
  }

  const ruedaDe = (catalogoId: number, cola: string) =>
    estado.turnos.find((x) => x.catalogoId === catalogoId && x.cola === cola);

  /** A quién le toca hoy este item en esta lista, según la vuelta que manda el servidor. */
  function leTocaEn(catalogoId: number, cola: string): number | undefined {
    const t = ruedaDe(catalogoId, cola);
    if (!t) return undefined;
    const hayAusentes = t.vuelta.some((p) => !p.vino);
    return (hayAusentes ? t.vuelta.filter((p) => p.vino) : t.vuelta)[0]?.id;
  }

  /**
   * Para que le toque a `objetivo`, el turno tiene que quedar en el que va justo antes
   * dentro de la vuelta de ese item.
   */
  async function moverTurno(catalogoId: number, cola: string, objetivo: number) {
    const t = ruedaDe(catalogoId, cola);
    if (!t || t.vuelta.length === 0) return;
    const i = t.vuelta.findIndex((p) => p.id === objetivo);
    if (i < 0) return;
    const anterior = t.vuelta[(i - 1 + t.vuelta.length) % t.vuelta.length].id;

    setOcupado(true);
    alError('');
    try {
      setEstado(await api(`/turnos/${catalogoId}`, { cuerpo: { usuarioId: anterior, cola } }));
      await traer();
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo mover el turno.');
    } finally {
      setOcupado(false);
    }
  }

  // Qué item tiene abierto el selector de imagen.
  const [eligiendo, setEligiendo] = useState<number | null>(null);

  const sinImagen = lista.filter((e) => !e.imagen).length;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <section className="panel subir" style={{ padding: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Catálogo del gremio</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
          Cada nombre que se carga alguna vez queda acá. Debajo de cada uno están <b>todas las palabras
          que lo cargan</b>: la clave más los alias. Una palabra pertenece a un solo item, así que si
          intentás repetir una en otro, el panel te avisa y no la guarda.
          {sinImagen > 0 && (
            <>
              {' '}
              <b style={{ color: 'var(--av)' }}>
                {sinImagen} {sinImagen === 1 ? 'sin imagen' : 'sin imagen todavía'}.
              </b>
            </>
          )}
        </p>
      </section>

      <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
        {cargando ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}>
            <div className="cargando" />
          </div>
        ) : lista.length === 0 ? (
          <div className="vacio">Todavía no se cargó ningún item. Empezá por la solapa Evento.</div>
        ) : (
          <div className="escalonado">
            {lista.map((e) => (
              <div key={e.id} className={`fila r-${e.rareza}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="boton-icono"
                  title={e.imagen ? 'Cambiar la imagen' : 'Elegir la imagen'}
                  disabled={ocupado}
                  onClick={() => setEligiendo(eligiendo === e.id ? null : e.id)}
                >
                  <IconoItem icono={e.icono} imagen={e.imagen} rareza={e.rareza} tam={46} />
                  {!e.imagen && (
                    <span className="falta-imagen">
                      <Subir tam={11} />
                    </span>
                  )}
                </button>

                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <input
                    className="campo campo-chico"
                    style={{ fontWeight: 700, minHeight: 38 }}
                    defaultValue={e.nombre}
                    disabled={ocupado}
                    title="Cómo se muestra el item en toda la app"
                    onBlur={(ev) => {
                      const nombre = ev.target.value.trim();
                      if (nombre.length >= 2 && nombre !== e.nombre) void guardar(e.id, { nombre });
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, paddingLeft: 2 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--tx3)', flexShrink: 0 }}>escribís</span>
                    <input
                      className="campo campo-chico clave-item"
                      defaultValue={e.clave}
                      disabled={ocupado}
                      title="Lo que se escribe al cargar el drop. Si renombraste el item, acá se corrige."
                      onBlur={(ev) => {
                        const clave = ev.target.value.trim();
                        if (clave && clave !== e.clave) void guardar(e.id, { clave });
                        else ev.target.value = e.clave;
                      }}
                    />
                    <span style={{ fontSize: 11.5, color: 'var(--tx3)', flexShrink: 0 }}>
                      · salió {e.veces} {e.veces === 1 ? 'vez' : 'veces'}
                      {!e.imagen && ' · falta la imagen'}
                    </span>
                  </div>

                  <div className="palabras-item">
                    <span>se carga con</span>
                    {palabrasDe(e).map((p) => (
                      <code key={p}>{p}</code>
                    ))}
                  </div>

                  {e.choque && (
                    <div className="choque-clave">
                      <Alerta tam={13} />
                      <span>
                        <b>{e.nombre}</b> se queda con «{e.clave}», así que el alias de{' '}
                        <b>{e.choque}</b> nunca se usa. Cambiale la clave a uno de los dos.
                      </span>
                    </div>
                  )}
                </div>

                <label style={{ flex: '0 1 190px', minWidth: 0, display: 'grid', gap: 4 }}>
                  <span className="etiqueta">Otras formas de escribirlo</span>
                  <input
                    className="campo campo-chico"
                    style={{ minHeight: 38 }}
                    defaultValue={aliasComoTexto(e.alias)}
                    placeholder="pluma, plumas condor"
                    disabled={ocupado}
                    title="Separadas por coma. Si escribís cualquiera de estas al cargar, cae en este item."
                    onBlur={(ev) => {
                      const alias = ev.target.value.trim();
                      if (alias !== aliasComoTexto(e.alias)) void guardar(e.id, { alias });
                    }}
                  />
                </label>

                {/* En qué listas sale. Un item puede caer en más de una: cada una lleva su rueda. */}
                <div style={{ flex: '0 1 auto', display: 'grid', gap: 4, minWidth: 0 }}>
                  <span className="etiqueta">Sale en</span>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {LISTAS.map(([cola, corto, largo]) => {
                      const dentro = e.colas.includes(cola);
                      const ultima = dentro && e.colas.length === 1;
                      return (
                        <button
                          key={cola}
                          type="button"
                          className={`chip-lista${dentro ? ' dentro' : ''}`}
                          disabled={ocupado || ultima}
                          title={
                            ultima
                              ? 'Un item tiene que salir en alguna lista'
                              : `${dentro ? 'Sacar de' : 'Agregar a'}: ${largo}`
                          }
                          onClick={() =>
                            void guardar(e.id, {
                              colas: dentro ? e.colas.filter((k) => k !== cola) : [...e.colas, cola],
                            })
                          }
                        >
                          {corto}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* El turno de ESTE item en cada lista: quién se lo lleva la próxima vez que salga. */}
                <div style={{ flex: '1 1 220px', display: 'grid', gap: 4, minWidth: 0 }}>
                  <span className="etiqueta">Le toca a</span>
                  {LISTAS.filter(([cola]) => e.colas.includes(cola)).map(([cola, corto, largo]) => {
                    const vuelta = ruedaDe(e.id, cola)?.vuelta ?? [];
                    return (
                      <label key={cola} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                        {e.colas.length > 1 && (
                          <span
                            style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--tx3)', width: 44, flexShrink: 0 }}
                          >
                            {corto}
                          </span>
                        )}
                        <select
                          className="campo campo-chico"
                          style={{ minWidth: 130, flex: 1, cursor: 'pointer' }}
                          value={String(leTocaEn(e.id, cola) ?? '')}
                          disabled={ocupado || vuelta.length === 0}
                          title={`El próximo de este item en ${largo} se lo lleva quien elijas acá`}
                          onChange={(ev) => void moverTurno(e.id, cola, Number(ev.target.value))}
                        >
                          {vuelta.length === 0 && <option value="">nadie en esa lista</option>}
                          {vuelta.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.personaje}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })}
                </div>

                {e.imagen && (
                  <button
                    type="button"
                    className="btn btn-chico"
                    style={{ flexShrink: 0 }}
                    disabled={ocupado}
                    onClick={() => void guardar(e.id, { imagen: null })}
                  >
                    Quitar imagen
                  </button>
                )}

                {eligiendo === e.id && (
                  <SelectorIcono
                    tipo="item"
                    actual={e.imagen}
                    ocupado={ocupado}
                    alError={alError}
                    alCerrar={() => setEligiendo(null)}
                    alElegir={(imagen) => {
                      setEligiendo(null);
                      void guardar(e.id, { imagen });
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Miembros ──────────────────────────────────────────────────────────────────

function Miembros({
  alError,
  alListo,
  yoId,
}: {
  alError: (m: string) => void;
  alListo: () => Promise<void>;
  yoId: number;
}) {
  const clases = useClases();
  const [lista, setLista] = useState<Miembro[]>([]);
  const [bajas, setBajas] = useState<Miembro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const [personaje, setPersonaje] = useState('');
  const [pc, setPc] = useState('');
  const [password, setPassword] = useState('');
  const [clase, setClase] = useState('');

  async function traer() {
    try {
      const r = await api<{ miembros: Miembro[]; inactivos: Miembro[] }>('/miembros');
      setLista(r.miembros);
      setBajas(r.inactivos);
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo traer la lista.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function correr(fn: () => Promise<unknown>) {
    setOcupado(true);
    alError('');
    try {
      await fn();
      await traer();
      await alListo();
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(false);
    }
  }

  const crear = () =>
    correr(async () => {
      await api('/miembros', { cuerpo: { personaje, pc: leerPC(pc), password, clase } });
      setPersonaje('');
      setPc('');
      setPassword('');
      setClase('');
    });

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 960 }}>
      <section className="panel subir" style={{ padding: 18 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Dar de alta un miembro</h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
          Los invitados entran tocando su Main, sin contraseña. La clave solo hace falta para el admin y
          la Grand Master, y se pone abajo en la lista.
        </p>
        <div className="form-item">
          <div className="crece" style={{ display: 'grid', gap: 6 }}>
            <span className="etiqueta">Personaje</span>
            <input className="campo campo-chico" value={personaje} onChange={(e) => setPersonaje(e.target.value)} placeholder="Darkblade" />
          </div>
          <div style={{ flex: '0 1 150px', display: 'grid', gap: 6 }}>
            <span className="etiqueta">Clase</span>
            <select
              className="campo campo-chico"
              style={{ cursor: 'pointer' }}
              value={clase}
              onChange={(e) => setClase(e.target.value)}
            >
              <option value="">sin clase</option>
              {clases.map((cl) => (
                <option key={cl.codigo} value={cl.codigo}>
                  {cl.nombre} ({cl.codigo})
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: '0 1 130px', display: 'grid', gap: 6 }}>
            <span className="etiqueta">PC</span>
            <input
              className="campo campo-chico num"
              value={pc}
              onChange={(e) => setPc(e.target.value.replace(/[^0-9.,mkMK]/g, ''))}
              placeholder="30.07M"
              title="Como aparece en el juego: 30.07M. También vale 30070000."
            />
          </div>
          <div style={{ flex: '0 1 190px', display: 'grid', gap: 6 }}>
            <span className="etiqueta">Clave (opcional)</span>
            <input className="campo campo-chico" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="solo si maneja la app" />
          </div>
          <button
            type="button"
            className="btn btn-oro"
            disabled={ocupado || personaje.trim().length < 2}
            onClick={crear}
          >
            <Mas tam={16} /> Crear
          </button>
        </div>
      </section>

      <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 800, padding: '0 6px' }}>
          Miembros del gremio {lista.length > 0 && <span style={{ color: 'var(--tx3)', fontWeight: 700 }}>· {lista.length}</span>}
        </h2>

        {cargando ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}>
            <div className="cargando" />
          </div>
        ) : lista.length === 0 ? (
          <div className="vacio">Todavía no hay miembros cargados.</div>
        ) : (
          <div className="escalonado">
            {lista.map((m) => (
              <div key={m.id} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', flexWrap: 'wrap' }}>
                <RetratoClase clase={m.clase} tam={40} />

                <div style={{ flex: '1 1 130px', minWidth: 0 }}>
                  <div className="recorte" style={{ fontSize: 14.5, fontWeight: 700 }}>
                    {m.personaje}
                  </div>
                  <div className="recorte" style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                    {m.usuario}
                    {m.tieneGoogle && ' · Google vinculado'}
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <span className="etiqueta">Clase</span>
                  <select
                    className="campo campo-chico"
                    style={{ width: 'auto', minWidth: 130, cursor: 'pointer' }}
                    value={m.clase}
                    disabled={ocupado}
                    title="La clase del personaje. El retrato sale de acá."
                    onChange={(e) => void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { clase: e.target.value } }))}
                  >
                    <option value="">sin clase</option>
                    {clases.map((cl) => (
                      <option key={cl.codigo} value={cl.codigo}>
                        {cl.nombre} ({cl.codigo})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 7, flex: '0 1 220px', minWidth: 0 }}>
                  <span className="etiqueta">Gmail</span>
                  <input
                    className="campo campo-chico"
                    style={{ minWidth: 0 }}
                    defaultValue={m.email ?? ''}
                    placeholder="opcional"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    title="Vincular un Gmail para que pueda entrar con el botón de Google"
                    onBlur={(e) => {
                      const valor = e.target.value.trim().toLowerCase();
                      if (valor !== (m.email ?? '')) {
                        void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { email: valor || null } }));
                      }
                    }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <span className="etiqueta">PC</span>
                  <input
                    key={`pc-${m.id}-${m.pc}`}
                    className="campo campo-chico num"
                    style={{ width: 96 }}
                    defaultValue={m.pc > 0 ? formatoPC(m.pc) : ''}
                    placeholder="30.07M"
                    title="Como aparece en el juego: 30.07M"
                    onBlur={(e) => {
                      const valor = leerPC(e.target.value);
                      if (valor !== m.pc) void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { pc: valor } }));
                    }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <span className="etiqueta">Clave</span>
                  <input
                    className="campo campo-chico"
                    style={{ width: 130 }}
                    placeholder={m.tienePassword ? '••••••' : 'sin clave'}
                    title="Solo hace falta para el admin y la Grand Master. Se guarda al salir del campo."
                    onBlur={(e) => {
                      const clave = e.target.value;
                      if (clave.length === 0) return;
                      e.target.value = '';
                      void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { password: clave } }));
                    }}
                  />
                </label>

                <select
                  className="campo campo-chico"
                  style={{ width: 'auto', minWidth: 140, cursor: 'pointer', flexShrink: 0 }}
                  value={m.rol}
                  disabled={ocupado || m.id === yoId}
                  title={m.id === yoId ? 'No podés cambiarte el rol a vos mismo' : 'Rol'}
                  onChange={(e) => void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { rol: e.target.value } }))}
                >
                  {ROLES.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="btn btn-chico"
                  style={{ width: 36, padding: 0, flexShrink: 0 }}
                  title="Dar de baja"
                  disabled={ocupado || m.id === yoId}
                  onClick={() => void correr(() => api(`/miembros/${m.id}`, { metodo: 'DELETE' }))}
                >
                  <Tacho tam={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {bajas.length > 0 && (
        <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, padding: '0 6px' }}>
            Dados de baja <span style={{ color: 'var(--tx3)', fontWeight: 700 }}>· {bajas.length}</span>
          </h2>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5, padding: '0 6px' }}>
            No aparecen en la app ni en el orden, pero su historial sigue guardado. Borrarlos del todo
            deja sin dueño los items que tenían.
          </p>

          {bajas.map((m) => (
            <div key={m.id} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', flexWrap: 'wrap' }}>
              <div className="recorte" style={{ flex: '1 1 140px', fontSize: 14, fontWeight: 700, color: 'var(--tx3)' }}>
                {m.personaje}
              </div>
              <button
                type="button"
                className="btn btn-chico"
                disabled={ocupado}
                onClick={() => void correr(() => api(`/miembros/${m.id}`, { metodo: 'PATCH', cuerpo: { activo: true } }))}
              >
                Reactivar
              </button>
              <button
                type="button"
                className="btn btn-mal btn-chico"
                disabled={ocupado}
                title="Borra la fila para siempre"
                onClick={() => {
                  if (!confirm(`¿Borrar a ${m.personaje} para siempre? No se puede deshacer.`)) return;
                  void correr(() => api(`/miembros/${m.id}?definitivo=1`, { metodo: 'DELETE' }));
                }}
              >
                Borrar del todo
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

const CAJAS_LISTA = [
  ['items', 'Drops del Kundun', 'Los items que salen sorteados en el Kundun de todos los días.'],
  ['almas', 'Almas de guerra', 'Salen en todos los Kundun, una o dos por vez.'],
  ['asedio', 'Castle Siege', 'Las recompensas del asedio, los domingos.'],
] as const;

/**
 * Quién participa en cada sorteo. Las tres listas se arman por separado: alguien puede
 * estar en las almas y no en los items, o cobrar solo en el asedio.
 */
function Listas({
  estado,
  alError,
  setEstado,
}: {
  estado: EstadoConAviso;
  alError: (m: string) => void;
  setEstado: (e: EstadoConAviso) => void;
}) {
  const [ocupado, setOcupado] = useState(false);

  async function correr(fn: () => Promise<EstadoConAviso>) {
    setOcupado(true);
    alError('');
    try {
      setEstado(await fn());
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo guardar la lista.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="grilla-listas">
      {CAJAS_LISTA.map(([cola, titulo, pie]) => {
        const dentro = estado.orden.filter((p) => p.listas.includes(cola));
        const todos = dentro.length === estado.orden.length;

        return (
          <section key={cola} className="panel subir" style={{ padding: '15px 14px 12px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>{titulo}</h2>
              <span style={{ fontSize: 12, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                {dentro.length}/{estado.orden.length}
              </span>
            </div>
            <p style={{ margin: '5px 0 11px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.45 }}>{pie}</p>

            <div style={{ display: 'grid', gap: 5 }}>
              {estado.orden.map((p) => {
                const participa = p.listas.includes(cola);
                return (
                  <label key={p.id} className={`fila-lista${participa ? ' dentro' : ''}`}>
                    <input
                      type="checkbox"
                      checked={participa}
                      disabled={ocupado}
                      onChange={() =>
                        void correr(() =>
                          api(`/participantes/${cola}`, { cuerpo: { usuarioId: p.id, participa: !participa } }),
                        )
                      }
                    />
                    <span style={{ fontWeight: 700, fontSize: 13.5 }}>{p.personaje}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--tx3)' }}>{formatoPC(p.pc)}</span>
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-chico btn-suave"
              style={{ marginTop: 10, width: '100%' }}
              disabled={ocupado}
              onClick={() => void correr(() => api(`/participantes/${cola}/todos`, { cuerpo: { participa: !todos } }))}
            >
              {todos ? 'Sacar a todos' : 'Poner a todo el gremio'}
            </button>
          </section>
        );
      })}
    </div>
  );
}

/**
 * El horario del Kundun. Se escribe en hora del servidor del juego y la app se lo traduce
 * a cada uno a su hora local, así nadie tiene que hacer la cuenta.
 */
function CajaHorario({
  estado,
  alError,
  setEstado,
  zona,
}: {
  estado: EstadoConAviso;
  alError: (m: string) => void;
  setEstado: (e: EstadoConAviso) => void;
  zona: string;
}) {
  const { agenda } = estado;
  const [horas, setHoras] = useState(agenda.horasServidor.join(', '));
  const [offset, setOffset] = useState(String(agenda.offsetServidorHoras));
  const [abre, setAbre] = useState(String(agenda.abreAntesMin));
  const [cierra, setCierra] = useState(String(agenda.cierraDespuesMin));
  const [ocupado, setOcupado] = useState(false);

  // Cuando el servidor confirma el cambio, los campos se acomodan a lo que quedó guardado.
  useEffect(() => {
    setHoras(agenda.horasServidor.join(', '));
    setOffset(String(agenda.offsetServidorHoras));
    setAbre(String(agenda.abreAntesMin));
    setCierra(String(agenda.cierraDespuesMin));
  }, [agenda.horasServidor.join(','), agenda.offsetServidorHoras, agenda.abreAntesMin, agenda.cierraDespuesMin]);

  const guardado =
    horas.trim() === agenda.horasServidor.join(', ') &&
    Number(offset) === agenda.offsetServidorHoras &&
    Number(abre) === agenda.abreAntesMin &&
    Number(cierra) === agenda.cierraDespuesMin;

  async function guardar() {
    setOcupado(true);
    alError('');
    try {
      setEstado(
        await api('/horarios', {
          metodo: 'PATCH',
          cuerpo: {
            horas,
            offsetServidor: Number(offset),
            abreAntesMin: Number(abre),
            cierraDespuesMin: Number(cierra),
          },
        }),
      );
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo guardar el horario.');
    } finally {
      setOcupado(false);
    }
  }

  const enTuHora = horariosEnZona(agenda, zona);

  return (
    <section className="panel subir" style={{ padding: '16px 14px 14px' }}>
      <h2 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800 }}>Horario del Kundun</h2>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.45 }}>
        Escribilo como lo dice el juego. Cada uno lo ve en su propia hora sin tocar nada.
      </p>

      <label style={{ display: 'grid', gap: 6 }}>
        <span className="etiqueta">Horas del servidor</span>
        <input
          className="campo"
          value={horas}
          onChange={(e) => setHoras(e.target.value)}
          placeholder="13:00, 21:00"
          disabled={ocupado}
        />
      </label>

      <label style={{ display: 'grid', gap: 6, marginTop: 10 }}>
        <span className="etiqueta">Zona del servidor</span>
        <select
          className="campo"
          style={{ cursor: 'pointer' }}
          value={offset}
          disabled={ocupado}
          onChange={(e) => setOffset(e.target.value)}
        >
          {Array.from({ length: 27 }, (_, k) => k - 12).map((h) => (
            <option key={h} value={h}>
              GMT{h >= 0 ? '+' : '−'}
              {Math.abs(h)}
            </option>
          ))}
        </select>
      </label>

      <div className="minutos-horario">
        {(
          [
            ['Abre antes', abre, setAbre, 'Minutos antes del Kundun en que se abre el registro'],
            ['Cierra después', cierra, setCierra, 'Minutos después del Kundun en que el evento se cierra solo'],
          ] as const
        ).map(([rotulo, valor, poner, ayuda]) => (
          <label key={rotulo} style={{ display: 'grid', gap: 6, minWidth: 0 }} title={ayuda}>
            <span className="etiqueta">{rotulo}</span>
            <input
              className="campo campo-chico"
              type="number"
              min={0}
              max={480}
              value={valor}
              disabled={ocupado}
              onChange={(e) => poner(e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="aviso" style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, display: 'block' }}>
        Guardado: <b>{agenda.horasServidor.join(' y ')}</b> del servidor ({comoGmt(agenda.offsetServidorHoras)}).
        <br />
        En tu hora ({nombreCortoZona(zona)}): <b style={{ color: 'var(--oro)' }}>{enTuHora.join(' y ')}</b>. El
        evento abre {agenda.abreAntesMin} min antes y cierra solo {agenda.cierraDespuesMin} min después.
      </div>

      <button
        type="button"
        className="btn btn-oro btn-chico"
        style={{ marginTop: 12, width: '100%' }}
        disabled={ocupado || guardado}
        onClick={guardar}
      >
        {guardado ? 'Horario guardado' : 'Guardar horario'}
      </button>
    </section>
  );
}

// ── Clases de personaje ───────────────────────────────────────────────────────

/**
 * Las clases del gremio: se crean, se les cambia el nombre y se les sube el retrato.
 *
 * Las cuatro que vienen con la app traen su PNG adentro del bundle; al resto hay que
 * subirle una imagen, que se guarda en la base como las de los items del catálogo.
 */
function Clases({
  estado,
  alError,
  setEstado,
}: {
  estado: EstadoConAviso;
  alError: (m: string) => void;
  setEstado: (e: EstadoConAviso) => void;
}) {
  const clases = estado.clases;
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [imagen, setImagen] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function correr(fn: () => Promise<EstadoConAviso>) {
    setOcupado(true);
    alError('');
    try {
      setEstado(await fn());
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo guardar la clase.');
    } finally {
      setOcupado(false);
    }
  }

  // 'nueva' es el retrato de la clase que se está creando; si no, el código de la que se edita.
  const [eligiendo, setEligiendo] = useState<string | null>(null);

  const crear = () =>
    correr(async () => {
      const r = await api<EstadoConAviso>('/clases', { cuerpo: { codigo, nombre, imagen } });
      setCodigo('');
      setNombre('');
      setImagen(null);
      return r;
    });

  return (
    <section className="panel subir" style={{ padding: '17px 14px 14px' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Clases de personaje</h2>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
        El código es lo que se guarda en cada personaje; el nombre es lo que se lee. El retrato
        aparece al lado del nombre en todos lados.
      </p>

      <div className="form-item" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="soltar-retrato"
          title={imagen ? 'Cambiar el retrato' : 'Elegir el retrato'}
          disabled={ocupado}
          onClick={() => setEligiendo(eligiendo === 'nueva' ? null : 'nueva')}
        >
          {imagen ? <img src={imagen} alt="" width={46} height={46} style={{ borderRadius: 10 }} /> : <Subir tam={17} />}
        </button>

        <div style={{ flex: '0 1 110px', display: 'grid', gap: 6 }}>
          <span className="etiqueta">Código</span>
          <input
            className="campo campo-chico"
            value={codigo}
            disabled={ocupado}
            maxLength={8}
            placeholder="MG"
            title="Corto y en mayúsculas: BK, ELF, MG. Es lo que queda guardado en cada personaje."
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </div>

        <div className="crece" style={{ display: 'grid', gap: 6 }}>
          <span className="etiqueta">Nombre</span>
          <input
            className="campo campo-chico"
            value={nombre}
            disabled={ocupado}
            placeholder="Magic Gladiator"
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn btn-chico"
          disabled={ocupado || codigo.length < 1 || nombre.trim().length < 2 || !imagen}
          onClick={() => void crear()}
        >
          <Mas tam={15} /> Agregar
        </button>

        {eligiendo === 'nueva' && (
          <SelectorIcono
            tipo="clase"
            actual={imagen}
            ocupado={ocupado}
            alError={alError}
            alCerrar={() => setEligiendo(null)}
            alElegir={(dato) => {
              setImagen(dato);
              setEligiendo(null);
            }}
          />
        )}
      </div>

      <div className="escalonado">
        {clases.map((cl) => {
          const cuantos = estado.orden.filter((p) => p.clase === cl.codigo).length;
          return (
            <div
              key={cl.codigo}
              className="fila"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px', flexWrap: 'wrap' }}
            >
              <button
                type="button"
                className="boton-icono"
                title="Cambiar el retrato"
                disabled={ocupado}
                onClick={() => setEligiendo(eligiendo === cl.codigo ? null : cl.codigo)}
              >
                <img src={cl.imagen} alt={cl.nombre} width={40} height={40} className="retrato-clase" />
              </button>

              <span className="pastilla" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800 }}>
                {cl.codigo}
              </span>

              <input
                className="campo campo-chico"
                style={{ flex: '1 1 160px', minWidth: 0 }}
                defaultValue={cl.nombre}
                disabled={ocupado}
                onBlur={(e) => {
                  const nuevo = e.target.value.trim();
                  if (nuevo.length >= 2 && nuevo !== cl.nombre) {
                    void correr(() => api(`/clases/${cl.codigo}`, { metodo: 'PATCH', cuerpo: { nombre: nuevo } }));
                  }
                }}
              />

              <span style={{ fontSize: 12, color: 'var(--tx3)', flexShrink: 0 }}>
                {cuantos === 0 ? 'sin nadie' : cuantos === 1 ? '1 personaje' : `${cuantos} personajes`}
              </span>

              {cl.propia && (
                <button
                  type="button"
                  className="btn btn-chico"
                  disabled={ocupado}
                  title="Volver al retrato que trae la app"
                  onClick={() => void correr(() => api(`/clases/${cl.codigo}`, { metodo: 'PATCH', cuerpo: { imagen: null } }))}
                >
                  Retrato original
                </button>
              )}

              <button
                type="button"
                className="btn btn-mal btn-chico"
                disabled={ocupado}
                title={cuantos > 0 ? `${cuantos} quedarían sin clase` : 'Borrar la clase'}
                onClick={() => {
                  const aviso =
                    cuantos > 0
                      ? `¿Borrar ${cl.nombre}? ${cuantos} ${cuantos === 1 ? 'personaje queda' : 'personajes quedan'} sin clase.`
                      : `¿Borrar ${cl.nombre}?`;
                  if (!confirm(aviso)) return;
                  void correr(() => api(`/clases/${cl.codigo}`, { metodo: 'DELETE' }));
                }}
              >
                <Tacho tam={14} />
              </button>

              {eligiendo === cl.codigo && (
                <SelectorIcono
                  tipo="clase"
                  actual={cl.imagen}
                  ocupado={ocupado}
                  alError={alError}
                  alCerrar={() => setEligiendo(null)}
                  alElegir={(dato) => {
                    setEligiendo(null);
                    void correr(() => api(`/clases/${cl.codigo}`, { metodo: 'PATCH', cuerpo: { imagen: dato } }));
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
