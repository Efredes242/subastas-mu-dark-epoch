import { useEffect, useState, type ReactNode } from 'react';
import { comoGmt, faltan, fechaHoraEn, formatoPC, marcaDeListas, horaEn, horariosEnZona, nombreCortoZona, restante } from '../api';
import { BotonTema } from '../componentes/BotonTema';
import { RetratoClase } from '../componentes/Clase';
import { PujaAnterior } from '../componentes/PujaAnterior';
import { SelectorZona, useZona } from '../componentes/Zona';
import { ir, type PropsPagina } from '../App';
import { IconoItem, Lineas, Orden, Reloj } from '../iconos';

type Hoja = null | 'anterior' | 'historial' | 'horarios' | 'listas';
type Turno = PropsPagina['estado']['turnos'][number];

const NOMBRE_COLA: Record<string, string> = {
  items: 'Drops del Kundun',
  almas: 'Almas de guerra',
  asedio: 'Castle Siege',
};

/**
 * Quién cobra este item y quién viene después.
 *
 * La vuelta llega girada del servidor. Acá solo se saltea a los que no estuvieron:
 * el primero que estuvo es el que "le toca", el segundo es el "próximo".
 */
function turnoActual(t: Turno, hayEvento: boolean) {
  const hayAusentes = hayEvento && t.vuelta.some((p) => !p.vino);
  const elegibles = t.vuelta.filter((p) => !hayAusentes || p.vino);
  return { hayAusentes, leToca: elegibles[0], proximo: elegibles[1] };
}

type Drop = PropsPagina['estado']['items'][number];

/** Los drops de una rueda, con quién se los lleva. */
function CajaRueda({
  titulo,
  nota,
  clase,
  drops,
  vacio,
}: {
  titulo: string;
  nota?: string;
  clase: string;
  drops: Drop[];
  vacio: string;
}) {
  return (
    <section className={`caja ${clase}`}>
      <header>
        <h2 className="titulo-caja">
          {titulo}
          {nota && <span style={{ fontWeight: 600, color: 'var(--tx3)', marginLeft: 6, fontSize: 10.5 }}>{nota}</span>}
        </h2>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}>
          {drops.length > 0 ? drops.length : ''}
        </span>
      </header>

      {drops.length === 0 ? (
        <div className="lista">
          <div className="vacio" style={{ padding: '22px 12px', border: 'none', fontSize: 12 }}>
            {vacio}
          </div>
        </div>
      ) : (
        <div className="lista lista-drops escalonado">
          {drops.map((it) => (
            <div key={it.id} className={`fila-drop r-${it.rareza}`} style={{ padding: '8px 7px', gap: 10 }}>
              <IconoItem icono={it.icono} imagen={it.imagen} rareza={it.rareza} tam={34} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="recorte" style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>
                  {it.etiqueta}
                </span>
                {it.dueno ? (
                  <span
                    className="recorte"
                    style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--oro)', marginTop: 2 }}
                  >
                    {it.dueno}
                  </span>
                ) : (
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--tx3)', marginTop: 2 }}>
                    sin repartir
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Un item en la ventana "Lista Drops": arriba a quién le tocó hoy y quién sigue,
 * abajo la lista entera de ese item.
 */
function ItemDeLaLista({ turno, drops, hayEvento }: { turno: Turno; drops: Drop[]; hayEvento: boolean }) {
  const { hayAusentes, leToca, proximo } = turnoActual(turno, hayEvento);
  const hoy = drops.filter((d) => d.dueno).map((d) => d.dueno!);

  return (
    <div className={`lista-item r-${turno.rareza}`}>
      <div className="encabezado">
        <IconoItem icono={turno.icono} imagen={turno.imagen} rareza={turno.rareza} tam={34} />

        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="recorte" style={{ display: 'block', fontSize: 14, fontWeight: 700 }}>
            {turno.nombre}
          </span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--tx3)', marginTop: 2 }}>
            {NOMBRE_COLA[turno.cola] ?? turno.cola}
          </span>
        </span>

        <span className="hoy-sigue">
          {hoy.length > 0 && (
            <span>
              <span className="rotulo-mini">hoy </span>
              <span className="recorte" style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--oro)' }}>
                {hoy.join(' · ')}
              </span>
            </span>
          )}
          <span>
            <span className="rotulo-mini">sigue </span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ok)' }}>{leToca?.personaje ?? '—'}</span>
          </span>
          {proximo && (
            <span>
              <span className="rotulo-mini">después </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--av)' }}>{proximo.personaje}</span>
            </span>
          )}
        </span>
      </div>

      {turno.vuelta.map((p, i) => {
        const clase =
          p.seLlevo > 0
            ? 'cobro'
            : hayAusentes && !p.vino
              ? 'fuera'
              : p.id === leToca?.id
                ? 'toca'
                : p.id === proximo?.id
                  ? 'proximo'
                  : '';
        const marca =
          p.seLlevo > 0
            ? p.seLlevo === 1
              ? 'se lo llevó'
              : `se llevó ${p.seLlevo}`
            : hayAusentes && !p.vino
              ? 'no vino'
              : p.id === leToca?.id
                ? 'le toca'
                : p.id === proximo?.id
                  ? 'próximo'
                  : '';

        return (
          <div key={p.id} className={`turno ${clase}`}>
            <span className="n">{i + 1}</span>
            <RetratoClase clase={p.clase} tam={22} />
            <span className="quien">{p.personaje}</span>
            <span className="marca">{marca}</span>
          </div>
        );
      })}
    </div>
  );
}

type Kundun = PropsPagina['estado']['historial'][number];

/**
 * Un Kundun del historial. Cerrado muestra el resumen; abierto, qué salió y quién se lo llevó.
 *
 * La imagen no viaja con el historial: se busca en el catálogo por `catalogoId`, así el
 * estado no arrastra un base64 por cada item de cada Kundun.
 */
function KundunViejo({
  kundun,
  zona,
  imagenDe,
  abierto,
  alTocar,
}: {
  kundun: Kundun;
  zona: string;
  imagenDe: (catalogoId: number | null) => string | null;
  abierto: boolean;
  alTocar: () => void;
}) {
  return (
    <div className={`kundun-viejo${abierto ? ' abierto' : ''}`}>
      <button type="button" className="cabecera" onClick={alTocar} aria-expanded={abierto}>
        <div className="sello">
          <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--tx3)' }}>KDN</span>
          <span className="num" style={{ fontSize: 14, fontWeight: 800, color: 'var(--tx2)' }}>
            {kundun.numero}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{fechaHoraEn(kundun.fecha, zona)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--tx3)', marginTop: 2 }}>
            {kundun.participantes} {kundun.participantes === 1 ? 'estuvo' : 'estuvieron'} ·{' '}
            {kundun.items} {kundun.items === 1 ? 'item' : 'items'}
          </div>
        </div>

        {kundun.drops.length > 0 && <span className="flecha">{abierto ? '▲' : '▼'}</span>}
      </button>

      {abierto && (
        <div className="drops-viejos">
          {kundun.drops.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '4px 8px 8px' }}>
              En este Kundun no se cargó ningún item.
            </div>
          ) : (
            kundun.drops.map((d) => (
              <div key={d.id} className={`fila-drop r-${d.rareza}`} style={{ padding: '7px', gap: 10 }}>
                <IconoItem icono={d.icono} imagen={imagenDe(d.catalogoId)} rareza={d.rareza} tam={30} />
                <span className="recorte" style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600 }}>
                  {d.etiqueta}
                </span>
                <span
                  className="recorte"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 800,
                    color: d.dueno ? 'var(--oro)' : 'var(--tx3)',
                    maxWidth: 130,
                  }}
                >
                  {d.dueno ?? 'sin repartir'}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El tablero del gremio. Sin login y en una sola vista: entra todo en la pantalla
 * y lo único que scrollea son las listas, por dentro.
 */
export default function Tablero({ estado, tema, alternarTema }: PropsPagina) {
  const [hoja, setHoja] = useState<Hoja>(null);
  const [kundunAbierto, setKundunAbierto] = useState<number | null>(null);
  const [solapaDrops, setSolapaDrops] = useState<'kundun' | 'asedio'>('kundun');
  const [ahora, setAhora] = useState(() => Date.now());
  const [zona, setZona] = useZona(estado.yo?.zona);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const evento = estado.evento;
  const cuenta = restante(evento?.cierraEn ?? null, ahora);
  const presentes = estado.orden.filter((p) => p.vino).length;

  /**
   * En qué momento está el Kundun, que es lo que el gremio mira de un vistazo.
   *
   * Mientras corre no hay nada resuelto: nadie está de más ni de menos, y el tablero no tiene
   * por qué tachar a nadie. Recién cuando el que reparte confirma la asistencia y carga los
   * drops se sabe quién estuvo y quién se llevó qué.
   */
  const repartido = estado.items.length > 0;
  const asistenciaLista = evento?.asistenciaLista ?? false;
  const enCurso = !!evento && !repartido;

  // Por defecto se abre el Kundun más nuevo, que es el que se mira siempre; -1 = ninguno.
  const abiertoId = kundunAbierto ?? estado.historial[0]?.id ?? -1;

  // Lo del asedio va aparte: solo sale los domingos y mezclarlo con el Kundun de todos
  // los días llenaba la lista de ruedas que no aplican.
  const ruedasKundun = estado.turnos.filter((t) => t.cola !== 'asedio');
  const ruedasAsedio = estado.turnos.filter((t) => t.cola === 'asedio');

  // Las ruedas ya traen la imagen de cada item del catálogo; el historial la reusa.
  const imagenDe = (catalogoId: number | null) =>
    catalogoId === null ? null : (estado.turnos.find((t) => t.catalogoId === catalogoId)?.imagen ?? null);

  // Los drops del día, separados por rueda.
  const porRueda = {
    items: estado.items.filter((i) => i.cola === 'items'),
    almas: estado.items.filter((i) => i.cola === 'almas'),
    asedio: estado.items.filter((i) => i.cola === 'asedio'),
  };

  return (
    <>
      <div className="tablero">
        {/* Arriba: horarios · qué Kundun es · tema */}
        <div className="barra-tablero arriba">
          <button
            type="button"
            className="btn-esquina"
            onClick={() => setHoja('horarios')}
            title="Los horarios se muestran en la hora de este equipo"
          >
            <Reloj tam={18} />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
              <span>{horariosEnZona(estado.agenda, zona).join(' · ')}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--tx3)' }}>tu hora · {nombreCortoZona(zona)}</span>
            </span>
          </button>

          <div style={{ minWidth: 0, textAlign: 'center' }}>
            {evento ? (
              <>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  {evento.esPrueba ? <span style={{ color: 'var(--av)' }}>Kundun de prueba</span> : `Kundun #${evento.numero}`}
                </div>
                <div className="recorte estado-kundun">
                  <span className={enCurso ? 'ahora' : 'listo'}>
                    {enCurso ? 'en curso' : 'repartido'}
                  </span>
                  <span>
                    {cuenta ? `cierra en ${cuenta}` : fechaHoraEn(evento.empiezaEn ?? evento.creadoEn, zona)}
                    {presentes > 0 ? ` · ${presentes} ${enCurso ? 'marcados' : 'estuvieron'}` : ''}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                  Próximo {horaEn(estado.agenda.proximo.empieza, zona)}
                </div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--oro)', marginTop: 2 }}>
                  {faltan(estado.agenda.proximo.empieza, ahora)}
                </div>
              </>
            )}
          </div>

          <BotonTema tema={tema} alternar={alternarTema} />
        </div>

        <div className="cuerpo-tablero">
          <CajaRueda
            titulo="Items del Kundun"
            clase="items"
            drops={porRueda.items}
            vacio={evento ? 'Kundun en curso: todavía no cargaron los items.' : 'Sin Kundun en curso.'}
          />
          <CajaRueda
            titulo="Almas de guerra"
            clase="almas"
            drops={porRueda.almas}
            vacio={evento ? 'Kundun en curso: todavía no cargaron las almas.' : 'Sin Kundun en curso.'}
          />
          <CajaRueda
            titulo="Castle Siege"
            nota="domingos"
            clase="asedio"
            drops={porRueda.asedio}
            vacio={
              !estado.agenda.esDomingo
                ? `El asedio es los domingos, a las ${estado.agenda.asedio.hora} del servidor.`
                : estado.agenda.asedio.desde
                  ? `El drop del asedio sale ${horaEn(estado.agenda.asedio.desde, zona)}.`
                  : 'Todavía no cargaron los drops del asedio.'
            }
          />
          {/* El gremio y sus PC */}
          <section className="caja gremio">
            <header style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <h2 className="titulo-caja">Orden del gremio</h2>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--tx3)' }}>por PC</span>
              </div>
            </header>

            <div className="lista">
              {estado.orden.map((p) => {
                const seLlevo = estado.items.filter((i) => i.duenoId === p.id);
                // Nadie queda tachado hasta que el que reparte confirma quién estuvo: antes de
                // eso el Kundun recién arranca y no hay ausentes, hay gente jugando.
                const inactivo = asistenciaLista && !p.vino;

                return (
                  <div key={p.id} className={`fila-gremio ${seLlevo.length > 0 ? 'cobro' : inactivo ? 'inactivo' : ''}`}>
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
                        color: inactivo ? 'var(--mal)' : 'var(--tx)',
                        textDecoration: inactivo ? 'line-through' : undefined,
                      }}
                    >
                      {p.personaje}
                    </span>

                    {seLlevo.length > 0 ? (
                      <span className="marca-fila" style={{ color: 'var(--oro)' }} title={seLlevo.map((i) => i.etiqueta).join(' · ')}>
                        {seLlevo.length === 1 ? 'se llevó 1' : `se llevó ${seLlevo.length}`}
                      </span>
                    ) : inactivo ? (
                      <span className="marca-fila" style={{ color: 'var(--mal)' }}>
                        no estuvo
                      </span>
                    ) : enCurso ? (
                      <span className="marca-fila en-juego" title="El Kundun está en curso: todavía no se repartió nada">
                        en juego
                      </span>
                    ) : marcaDeListas(p.listas) ? (
                      <span
                        className="marca-fila"
                        style={{ color: 'var(--tx3)' }}
                        title={`Participa en: ${p.listas.join(', ') || 'ninguna lista'}`}
                      >
                        {marcaDeListas(p.listas)}
                      </span>
                    ) : null}

                    <span
                      className="num"
                      style={{ fontSize: 13, fontWeight: 800, color: 'var(--tx2)', flexShrink: 0 }}
                      title={`${p.pc.toLocaleString('es-AR')} de PC de equipo`}
                    >
                      {formatoPC(p.pc)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Abajo: las ventanas de consulta */}
        <div className="barra-tablero abajo">
          <button type="button" className="btn-esquina acento" onClick={() => setHoja('anterior')}>
            <Orden tam={18} />
            <span>Puja anterior</span>
          </button>

          <button type="button" className="btn-esquina" onClick={() => setHoja('listas')}>
            <Lineas tam={18} />
            <span>Lista Drops</span>
          </button>

          <button type="button" className="btn-esquina" onClick={() => setHoja('historial')}>
            <Lineas tam={18} />
            <span>Historial</span>
          </button>
        </div>
      </div>

      {hoja === 'anterior' && (
        <HojaPanel titulo="La puja anterior" alCerrar={() => setHoja(null)}>
          {estado.anterior ? (
            <PujaAnterior anterior={estado.anterior} zona={zona} />
          ) : (
            <div className="vacio">Todavía no hay ningún Kundun anterior.</div>
          )}
        </HojaPanel>
      )}

      {hoja === 'listas' && (
        <HojaPanel titulo="Lista de cada drop" alCerrar={() => setHoja(null)}>
          {estado.turnos.length === 0 ? (
            <div className="vacio">Todavía no hay items en el catálogo.</div>
          ) : (
            <>
              <div className="solapas-drops">
                <button
                  type="button"
                  className={solapaDrops === 'kundun' ? 'activa' : ''}
                  onClick={() => setSolapaDrops('kundun')}
                >
                  Kundun <span className="cuenta">{ruedasKundun.length}</span>
                </button>
                <button
                  type="button"
                  className={solapaDrops === 'asedio' ? 'activa' : ''}
                  onClick={() => setSolapaDrops('asedio')}
                >
                  Castle Siege <span className="cuenta">{ruedasAsedio.length}</span>
                  {estado.agenda.esDomingo && <span className="hoy">hoy</span>}
                </button>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                {solapaDrops === 'kundun'
                  ? 'Cada item lleva su propia lista y solo avanza cuando ese item sale. Verde el que sigue, amarillo el próximo, dorado el que ya cobró hoy.'
                  : estado.agenda.esDomingo
                    ? 'Hoy es domingo: estas listas son las que se reparten con los drops del asedio.'
                    : 'Las recompensas del asedio se reparten los domingos. Estas listas son aparte de las del Kundun y no se mueven durante la semana.'}
              </p>

              {(solapaDrops === 'kundun' ? ruedasKundun : ruedasAsedio).length === 0 ? (
                <div className="vacio">
                  {solapaDrops === 'kundun'
                    ? 'Ningún item sale en el Kundun todavía.'
                    : 'Ningún item está marcado para el Castle Siege. Se elige en el panel, en el catálogo.'}
                </div>
              ) : (
                (solapaDrops === 'kundun' ? ruedasKundun : ruedasAsedio).map((t) => (
                  <ItemDeLaLista
                    key={`${t.catalogoId}-${t.cola}`}
                    turno={t}
                    drops={estado.items.filter((i) => i.catalogoId === t.catalogoId && i.cola === t.cola)}
                    hayEvento={!!evento}
                  />
                ))
              )}
            </>
          )}
        </HojaPanel>
      )}

      {hoja === 'historial' && (
        <HojaPanel titulo="Todos los Kundun" alCerrar={() => setHoja(null)}>
          {estado.historial.length === 0 ? (
            <div className="vacio">Todavía no se cerró ningún Kundun.</div>
          ) : (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5 }}>
                Tocá un Kundun para ver qué salió y quién se lo llevó.
              </p>
              {estado.historial.map((h) => (
                <KundunViejo
                  key={h.id}
                  kundun={h}
                  zona={zona}
                  imagenDe={imagenDe}
                  abierto={abiertoId === h.id}
                  alTocar={() => setKundunAbierto(abiertoId === h.id ? -1 : h.id)}
                />
              ))}
            </div>
          )}
        </HojaPanel>
      )}

      {hoja === 'horarios' && (
        <HojaPanel titulo="Horarios del Kundun" alCerrar={() => setHoja(null)}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {horariosEnZona(estado.agenda, zona).map((h, i) => (
                <span key={h} className="pastilla" style={{ fontSize: 16, padding: '11px 16px' }}>
                  {h}
                  <span style={{ fontWeight: 600, color: 'var(--tx3)', fontSize: 11.5 }}>
                    ({estado.agenda.horasServidor[i]} {comoGmt(estado.agenda.offsetServidorHoras)})
                  </span>
                </span>
              ))}
            </div>

            <div style={{ fontSize: 13, color: 'var(--tx3)', lineHeight: 1.55 }}>
              Todos los días a la misma hora del servidor. La app los convierte sola a la hora del equipo
              desde el que se abre, así cada uno los ve en su horario sin configurar nada.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="etiqueta">Mostrar en</span>
              <SelectorZona zona={zona} alCambiar={setZona} offsetServidor={estado.agenda.offsetServidorHoras} />
            </div>

            <button type="button" className="btn btn-chico" style={{ justifySelf: 'start' }} onClick={() => ir('/admin')}>
              Panel del gremio
            </button>
          </div>
        </HojaPanel>
      )}
    </>
  );
}

function HojaPanel({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    window.addEventListener('keydown', alTeclado);
    return () => window.removeEventListener('keydown', alTeclado);
  }, [alCerrar]);

  return (
    <div className="hoja" onClick={alCerrar} role="presentation">
      <div className="hoja-cuerpo" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="hoja-titulo">
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{titulo}</h2>
          <button type="button" className="btn btn-chico" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
