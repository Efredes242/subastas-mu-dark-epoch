import { useEffect, useState } from 'react';
import { fechaHoraEn, formatoPC, horaEn, nombreCortoZona, restante, seVe } from '../api';
import { RetratoClase } from '../componentes/Clase';
import { SelectorZona, useZona } from '../componentes/Zona';
import { ir, type PropsPagina } from '../App';
import { Escudo, IconoItem, Reloj, Tilde } from '../iconos';

/**
 * El panel del jugador: lo mismo que mira el que reparte, pero sin un solo botón que escriba.
 *
 * No alcanza con esconder los controles del panel del admin: si el componente está, tarde o
 * temprano queda una acción habilitada por descuido. Esta es una pantalla aparte que no sabe
 * mandar nada — lo único que guarda es la zona horaria, que es una preferencia de quien mira.
 * El servidor tampoco depende de esto: todas las rutas que escriben piden Grand Master o admin.
 */
export default function Jugador({ estado, tema, alternarTema }: PropsPagina) {
  const [ahora, setAhora] = useState(() => Date.now());
  const [zona, setZona] = useZona(estado.yo?.zona);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const yo = estado.yo!;
  const evento = estado.evento;
  const cuenta = restante(evento?.cierraEn ?? null, ahora);
  const repartido = estado.items.length > 0;
  const marcados = estado.orden.filter((p) => p.vino);

  const ruedas = estado.turnos;

  return (
    <div className="panel-jugador">
      <div className="barra-admin">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0 }}>
          <div className="icono-item r-divino" style={{ width: 40, height: 40, borderRadius: 13 }}>
            <Escudo tam={20} />
          </div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {evento ? `Kundun #${evento.numero}` : 'Sin Kundun en curso'}
          </h1>
          {evento && (
            <>
              <span className={`pastilla ${repartido ? 'ok' : 'av'}`}>
                <span className="punto latir" />
                {repartido ? 'Repartido' : 'Kundun en curso'}
              </span>
              <span
                className="num"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--tx2)' }}
              >
                <Reloj tam={15} />
                {cuenta ?? '00:00'}
              </span>
            </>
          )}
          {!evento && (
            <span style={{ fontSize: 13.5, color: 'var(--tx3)' }}>
              Próximo a las {horaEn(estado.agenda.proximo.empieza, zona)}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {seVe(estado, 'boton_zona') && (
            <SelectorZona zona={zona} alCambiar={setZona} offsetServidor={estado.agenda.offsetServidorHoras} />
          )}
          <button type="button" className="btn btn-chico" onClick={() => ir('/')}>
            Ver el tablero
          </button>

        </div>
      </div>

      <div className="aviso" style={{ marginBottom: 18, display: 'block', fontSize: 12.5, lineHeight: 1.5 }}>
        Entraste como <b>{yo.personaje}</b>, jugador del gremio. Acá ves lo mismo que el que reparte:
        quiénes están marcados, qué salió y a quién le toca cada item. <b>No podés cambiar nada</b>, y
        está bien: el reparto lo maneja el Grand Master.
      </div>

      <div className="admin-grid">
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {/* El botín */}
          <section className="panel subir" style={{ padding: '17px 14px 14px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 4px 14px' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Botín del evento</h2>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--tx3)' }}>
                {estado.items.length} {estado.items.length === 1 ? 'drop' : 'drops'}
              </span>
            </div>

            {estado.items.length === 0 ? (
              <div className="vacio">
                {evento ? 'Kundun en curso: todavía no cargaron los drops.' : 'No hay ningún Kundun en curso.'}
              </div>
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
                          {it.cola === 'asedio' ? 'Castle Siege' : it.cola === 'almas' ? 'Almas de guerra' : 'Items del Kundun'}
                        </div>
                      </div>
                    </div>
                    <div className="dueno">
                      <div
                        className="recorte"
                        style={{ fontSize: 14, fontWeight: 700, color: it.dueno ? 'var(--oro)' : 'var(--tx3)' }}
                      >
                        {it.dueno ?? 'Sin repartir'}
                      </div>
                      {it.duenoId === yo.id && (
                        <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ok)', marginTop: 2 }}>
                          es tuyo
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* A quién le toca cada item */}
          <section className="panel subir" style={{ padding: '17px 14px 14px', minWidth: 0 }}>
            <h2 style={{ margin: '0 0 3px 4px', fontSize: 15, fontWeight: 800 }}>A quién le toca</h2>
            <p style={{ margin: '0 0 12px 4px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
              Cada item lleva su propia vuelta y solo avanza cuando ese item sale.
            </p>
            {ruedas.length === 0 ? (
              <div className="vacio">Todavía no hay items en el catálogo.</div>
            ) : (
              <div className="escalonado">
                {ruedas.map((t) => (
                  <div key={`${t.catalogoId}-${t.cola}`} className="fila" style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 8px', flexWrap: 'wrap' }}>
                    <IconoItem icono={t.icono} imagen={t.imagen} rareza={t.rareza} tam={32} />
                    <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                      <div className="recorte" style={{ fontSize: 13.5, fontWeight: 700 }}>
                        {t.nombre}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--tx3)' }}>
                        {t.cola === 'asedio' ? 'Castle Siege' : t.cola === 'almas' ? 'Almas de guerra' : 'Items del Kundun'}
                      </div>
                    </div>
                    <span
                      className="recorte"
                      style={{
                        flex: '0 1 150px',
                        fontSize: 13,
                        fontWeight: 700,
                        color: t.vuelta[0]?.id === yo.id ? 'var(--ok)' : 'var(--oro)',
                      }}
                    >
                      {t.vuelta[0]?.personaje ?? 'nadie en esa lista'}
                      {t.vuelta[0]?.id === yo.id && ' · sos vos'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {/* Quiénes estuvieron */}
          <section className="panel subir" style={{ padding: '17px 12px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 6px' }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Quiénes estuvieron</h2>
              <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--oro)' }}>
                {marcados.length}/{estado.orden.length}
              </span>
            </div>
            <p style={{ margin: '5px 6px 10px', fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.45 }}>
              {evento?.asistenciaLista
                ? 'Ya está confirmada: al que no figura se lo saltea y pierde la vuelta.'
                : 'Todavía sin confirmar. Hasta que el Grand Master no la cierre, no se puede repartir.'}
            </p>
            <div className="lista">
              {estado.orden.map((p) => {
                const vino = evento?.asistenciaLista ? p.vino : null;
                return (
                  <div key={p.id} className="fila-gremio">
                    <span
                      className="num"
                      style={{
                        width: 24,
                        height: 24,
                        flexShrink: 0,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11.5,
                        fontWeight: 800,
                        background: 'var(--panel2)',
                        color: 'var(--tx3)',
                      }}
                    >
                      {p.posicion}
                    </span>
                    <RetratoClase clase={p.clase} tam={26} />
                    <span
                      className="recorte"
                      style={{
                        flex: 1,
                        fontSize: 13.5,
                        fontWeight: 700,
                        color: vino === false ? 'var(--mal)' : 'var(--tx)',
                        textDecoration: vino === false ? 'line-through' : undefined,
                      }}
                    >
                      {p.personaje}
                      {p.id === yo.id && <span style={{ color: 'var(--tx3)', fontWeight: 600 }}> · vos</span>}
                    </span>
                    {vino === true && <Tilde tam={15} />}
                    <span className="num" style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx2)', flexShrink: 0 }}>
                      {formatoPC(p.pc)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* El Kundun anterior */}
          {estado.anterior && (
            <section className="panel subir" style={{ padding: '16px 14px 12px' }}>
              <h2 style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 800, padding: '0 4px' }}>
                Puja anterior · #{estado.anterior.numero}
              </h2>
              <div style={{ fontSize: 12, color: 'var(--tx3)', padding: '0 4px 10px' }}>
                {fechaHoraEn(estado.anterior.fecha, zona)}
              </div>
              <div className="lista">
                {estado.anterior.items.map((it) => (
                  <div key={it.id} className="fila" style={{ display: 'flex', gap: 10, padding: '7px 8px', alignItems: 'center' }}>
                    <span className="recorte" style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>
                      {it.etiqueta}
                    </span>
                    <span
                      className="recorte"
                      style={{ flex: '0 1 120px', fontSize: 12.5, fontWeight: 700, color: 'var(--oro)', textAlign: 'right' }}
                    >
                      {it.dueno ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div style={{ fontSize: 11.5, color: 'var(--tx3)', textAlign: 'center', lineHeight: 1.5 }}>
            Horarios en {nombreCortoZona(zona)}. Los del servidor son{' '}
            {estado.agenda.horasServidor.join(' y ')}.
          </div>
        </div>
      </div>
    </div>
  );
}
