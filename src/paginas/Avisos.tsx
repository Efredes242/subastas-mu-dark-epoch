import { useEffect, useState } from 'react';
import { api } from '../api';
import { Alerta, Mas, Reloj, Tacho, Tilde } from '../iconos';

/**
 * Los avisos del gremio: qué se anuncia, cuándo y con qué texto.
 *
 * Un aviso es un evento con nombre propio, los días y las horas en que cae, cuánto antes hay que
 * recordarlo y el texto que se manda. El texto lleva marcas entre llaves que se reemplazan al
 * armarlo, así el mismo sirve para el recordatorio de una hora antes y el de cinco minutos.
 *
 * Todavía no sale a ningún lado. El simulador de abajo muestra el mensaje exactamente como va a
 * quedar en Telegram, para poder corregirlo antes de colgarlo de un bot.
 */

interface Aviso {
  id: number;
  nombre: string;
  dias: number[];
  horas: number[];
  antes: number[];
  mensaje: string;
  activo: boolean;
}

const DIAS = [
  [1, 'Lun'],
  [2, 'Mar'],
  [3, 'Mié'],
  [4, 'Jue'],
  [5, 'Vie'],
  [6, 'Sáb'],
  [0, 'Dom'],
] as const;

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Los recordatorios que se ofrecen con un toque. Más de una hora antes no sirve de nada. */
const ANTES_SUGERIDOS = [60, 45, 30, 15, 10, 5];

const MARCAS: Array<[string, string]> = [
  ['{evento}', 'el nombre del evento'],
  ['{hora}', 'la hora de arranque'],
  ['{falta}', 'cuánto falta'],
  ['{dia}', 'hoy, mañana, el domingo'],
];

const comoHora = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

const leerHora = (crudo: string): number | null => {
  const t = crudo.trim();
  const m = t.match(/^(\d{1,2})\s*(?:[:.hH]\s*(\d{1,2}))?$/) ?? t.match(/^(\d{1,2})(\d{2})$/);
  if (!m) return null;
  const horas = Number(m[1]);
  const mins = m[2] === undefined ? 0 : Number(m[2]);
  if (horas > 23 || mins > 59) return null;
  return horas * 60 + mins;
};

const comoFalta = (minutos: number) => {
  if (minutos >= 60) {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    const enHoras = `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    return resto === 0 ? enHoras : `${enHoras} y ${resto} min`;
  }
  return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
};

const armarMensaje = (plantilla: string, evento: string, hora: number, antes: number, dia: string) =>
  plantilla
    .replace(/\{evento\}/g, evento || 'el evento')
    .replace(/\{hora\}/g, comoHora(hora))
    .replace(/\{falta\}/g, comoFalta(antes))
    .replace(/\{dia\}/g, dia);

/**
 * Telegram entiende *negrita*, _cursiva_ y `código`. Acá se pinta lo mismo para que el simulador
 * muestre lo que el gremio va a ver de verdad, no el texto con los asteriscos a la vista.
 */
function comoTelegram(texto: string) {
  const trozos: Array<{ t: string; como: 'n' | 'b' | 'i' | 'c' }> = [];
  const patron = /(\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;
  let ultimo = 0;
  for (const m of texto.matchAll(patron)) {
    const i = m.index ?? 0;
    if (i > ultimo) trozos.push({ t: texto.slice(ultimo, i), como: 'n' });
    const marca = m[0];
    trozos.push({
      t: marca.slice(1, -1),
      como: marca[0] === '*' ? 'b' : marca[0] === '_' ? 'i' : 'c',
    });
    ultimo = i + marca.length;
  }
  if (ultimo < texto.length) trozos.push({ t: texto.slice(ultimo), como: 'n' });

  return trozos.map((p, i) =>
    p.como === 'b' ? (
      <b key={i}>{p.t}</b>
    ) : p.como === 'i' ? (
      <i key={i}>{p.t}</i>
    ) : p.como === 'c' ? (
      <code key={i}>{p.t}</code>
    ) : (
      <span key={i}>{p.t}</span>
    ),
  );
}

export function Avisos({ alError }: { alError: (m: string) => void }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  /** Qué evento y qué recordatorio está mirando el simulador. */
  const [mirando, setMirando] = useState<number | null>(null);
  const [conAntes, setConAntes] = useState(15);

  /** El pedido que se le hace a la IA, por si quiere otro tono. */
  const [tono, setTono] = useState('');
  const [redactando, setRedactando] = useState<number | null>(null);

  async function traer() {
    try {
      const r = await api<{ avisos: Aviso[] }>('/avisos');
      setLista(r.avisos);
      setMirando((previo) => previo ?? r.avisos[0]?.id ?? null);
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudieron traer los avisos.');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Lo que se está editando vive acá hasta que se guarda: así escribir no dispara un pedido. */
  const tocar = (id: number, cambios: Partial<Aviso>) =>
    setLista((previos) => previos.map((a) => (a.id === id ? { ...a, ...cambios } : a)));

  async function correr(fn: () => Promise<{ avisos: Aviso[]; aviso?: string }>) {
    setOcupado(true);
    alError('');
    try {
      const r = await fn();
      setLista(r.avisos);
      setAviso(r.aviso ?? '');
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setOcupado(false);
    }
  }

  const guardar = (a: Aviso) =>
    correr(() =>
      api(`/avisos/${a.id}`, {
        metodo: 'PATCH',
        cuerpo: {
          nombre: a.nombre,
          dias: a.dias,
          horas: a.horas,
          antes: a.antes,
          mensaje: a.mensaje,
          activo: a.activo,
        },
      }),
    );

  async function redactar(a: Aviso) {
    setRedactando(a.id);
    alError('');
    try {
      const r = await api<{ mensaje: string; aviso?: string }>(`/avisos/${a.id}/redactar`, {
        cuerpo: { nombre: a.nombre, dias: a.dias, horas: a.horas, tono },
      });
      tocar(a.id, { mensaje: r.mensaje });
      setAviso(r.aviso ?? 'Listo. Revisalo y guardalo si te gusta.');
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo redactar.');
    } finally {
      setRedactando(null);
    }
  }

  const elSimulado = lista.find((a) => a.id === mirando) ?? lista[0] ?? null;

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 980 }}>
      <section className="panel subir" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Avisos del gremio</h2>
          <button
            type="button"
            className="btn btn-oro btn-chico"
            disabled={ocupado}
            onClick={() => void correr(() => api('/avisos', { cuerpo: { nombre: 'Evento nuevo' } }))}
          >
            <Mas tam={15} /> Agregar un evento
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
          Cada evento tiene sus días, sus horas y cuánto antes se recuerda. El texto lleva marcas
          entre llaves que se reemplazan al mandarlo, así el mismo sirve para el aviso de una hora
          antes y el de cinco minutos.
        </p>
        <div className="aviso" style={{ marginTop: 12, fontSize: 12.5, lineHeight: 1.5, display: 'block' }}>
          <b>Todavía no sale a ningún lado.</b> Acá se configura y se mira cómo va a quedar; conectarlo
          al bot de Telegram es el paso siguiente.
        </div>
        {aviso && (
          <div className="aviso aparecer" style={{ marginTop: 10 }}>
            <Tilde tam={16} />
            <span>{aviso}</span>
          </div>
        )}
      </section>

      {cargando ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}>
          <div className="cargando" />
        </div>
      ) : lista.length === 0 ? (
        <div className="vacio">Todavía no hay ningún evento. Agregá el primero.</div>
      ) : (
        lista.map((a) => (
          <section key={a.id} className={`panel subir aviso-evento${a.activo ? '' : ' apagado'}`}>
            <div className="encabezado">
              <input
                className="campo"
                style={{ fontWeight: 800, fontSize: 15, flex: '1 1 200px', minWidth: 0 }}
                value={a.nombre}
                disabled={ocupado}
                onChange={(e) => tocar(a.id, { nombre: e.target.value })}
                placeholder="Cómo se llama el evento"
              />
              <button
                type="button"
                className={`btn btn-chico ${a.activo ? 'btn-ok' : ''}`}
                disabled={ocupado}
                title={a.activo ? 'Está prendido: se va a avisar' : 'Está apagado: no se avisa'}
                onClick={() => tocar(a.id, { activo: !a.activo })}
              >
                {a.activo ? 'Prendido' : 'Apagado'}
              </button>
              <button
                type="button"
                className="btn btn-chico"
                style={{ width: 36, padding: 0 }}
                title="Borrar este evento"
                disabled={ocupado}
                onClick={() => void correr(() => api(`/avisos/${a.id}`, { metodo: 'DELETE' }))}
              >
                <Tacho tam={15} />
              </button>
            </div>

            <div className="campos-aviso">
              <div>
                <span className="etiqueta">Qué días cae</span>
                <div className="chips">
                  {DIAS.map(([n, corto]) => {
                    const dentro = a.dias.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`chip-lista${dentro ? ' dentro' : ''}`}
                        disabled={ocupado}
                        onClick={() =>
                          tocar(a.id, {
                            dias: dentro ? a.dias.filter((d) => d !== n) : [...a.dias, n].sort((x, y) => x - y),
                          })
                        }
                      >
                        {corto}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className="chip-lista"
                    disabled={ocupado}
                    onClick={() => tocar(a.id, { dias: a.dias.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6] })}
                  >
                    {a.dias.length === 7 ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
              </div>

              <div>
                <span className="etiqueta">A qué hora (del servidor)</span>
                <div className="chips">
                  {a.horas.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="chip-lista dentro"
                      disabled={ocupado}
                      title="Sacar este horario"
                      onClick={() => tocar(a.id, { horas: a.horas.filter((x) => x !== h) })}
                    >
                      {comoHora(h)} ✕
                    </button>
                  ))}
                  <input
                    className="campo campo-chico"
                    style={{ width: 88 }}
                    placeholder="+ 13:00"
                    disabled={ocupado}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      const m = leerHora(e.currentTarget.value);
                      if (m === null) return;
                      tocar(a.id, { horas: [...new Set([...a.horas, m])].sort((x, y) => x - y) });
                      e.currentTarget.value = '';
                    }}
                    onBlur={(e) => {
                      const m = leerHora(e.target.value);
                      if (m === null) {
                        e.target.value = '';
                        return;
                      }
                      tocar(a.id, { horas: [...new Set([...a.horas, m])].sort((x, y) => x - y) });
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div>
                <span className="etiqueta">Cuánto antes recordarlo</span>
                <div className="chips">
                  {ANTES_SUGERIDOS.map((n) => {
                    const dentro = a.antes.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`chip-lista${dentro ? ' dentro' : ''}`}
                        disabled={ocupado}
                        onClick={() =>
                          tocar(a.id, {
                            antes: dentro
                              ? a.antes.filter((x) => x !== n)
                              : [...a.antes, n].sort((x, y) => y - x),
                          })
                        }
                      >
                        {n === 60 ? '1 hora' : `${n} min`}
                      </button>
                    );
                  })}
                  {a.antes
                    .filter((n) => !ANTES_SUGERIDOS.includes(n))
                    .map((n) => (
                      <button
                        key={n}
                        type="button"
                        className="chip-lista dentro"
                        disabled={ocupado}
                        onClick={() => tocar(a.id, { antes: a.antes.filter((x) => x !== n) })}
                      >
                        {n} min ✕
                      </button>
                    ))}
                  <input
                    className="campo campo-chico"
                    type="number"
                    min={1}
                    max={60}
                    style={{ width: 76 }}
                    placeholder="+ min"
                    disabled={ocupado}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      e.target.value = '';
                      if (!Number.isInteger(n) || n < 1 || n > 60) return;
                      tocar(a.id, { antes: [...new Set([...a.antes, n])].sort((x, y) => y - x) });
                    }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 5 }}>
                  Hasta una hora antes: más temprano nadie lo registra.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="etiqueta">El texto del aviso</span>
                <div className="marcas-aviso">
                  {MARCAS.map(([marca, que]) => (
                    <button
                      key={marca}
                      type="button"
                      title={`Insertar: ${que}`}
                      disabled={ocupado}
                      onClick={() => tocar(a.id, { mensaje: `${a.mensaje}${marca}` })}
                    >
                      {marca}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                className="campo"
                rows={4}
                value={a.mensaje}
                disabled={ocupado}
                onChange={(e) => tocar(a.id, { mensaje: e.target.value })}
                placeholder="⚔️ *{evento}* en {falta}…"
                style={{ padding: 12, minHeight: 96, lineHeight: 1.5, resize: 'vertical', marginTop: 6 }}
              />
            </div>

            <div className="pie-aviso">
              <button
                type="button"
                className="btn btn-chico"
                disabled={ocupado || redactando === a.id}
                title="Que la IA escriba el aviso. Después lo corregís a gusto."
                onClick={() => void redactar(a)}
              >
                {redactando === a.id ? 'Escribiendo…' : '✨ Que lo escriba la IA'}
              </button>
              <input
                className="campo campo-chico"
                style={{ flex: '1 1 200px', minWidth: 0 }}
                value={tono}
                disabled={ocupado}
                onChange={(e) => setTono(e.target.value)}
                placeholder="opcional: más corto, más gracioso, que nombre al gremio…"
              />
              <button
                type="button"
                className={`btn btn-chico${mirando === a.id ? ' btn-suave' : ''}`}
                disabled={ocupado}
                onClick={() => setMirando(a.id)}
              >
                Ver en el simulador
              </button>
              <button type="button" className="btn btn-oro btn-chico" disabled={ocupado} onClick={() => void guardar(a)}>
                Guardar
              </button>
            </div>

            {a.horas.length === 0 && (
              <div className="aviso mal" style={{ marginTop: 10, fontSize: 12.5 }}>
                <Alerta tam={16} />
                <span>Sin horarios este evento no avisa nunca. Cargale por lo menos uno.</span>
              </div>
            )}
          </section>
        ))
      )}

      {/* El simulador: cómo se va a ver el mensaje en Telegram. */}
      {elSimulado && (
        <section className="panel subir" style={{ padding: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800 }}>Simulador</h2>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Así se va a ver en Telegram, con las marcas ya reemplazadas. Elegí qué recordatorio mirar.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {lista.map((a) => (
              <button
                key={a.id}
                type="button"
                className={`chip-lista${elSimulado.id === a.id ? ' dentro' : ''}`}
                onClick={() => setMirando(a.id)}
              >
                {a.nombre}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {(elSimulado.antes.length > 0 ? elSimulado.antes : [15]).map((n) => (
              <button
                key={n}
                type="button"
                className={`chip-lista${conAntes === n ? ' dentro' : ''}`}
                onClick={() => setConAntes(n)}
              >
                <Reloj tam={12} /> {n === 60 ? '1 hora antes' : `${n} min antes`}
              </button>
            ))}
          </div>

          <div className="telegram">
            <div className="tapa">
              <span className="foto">MU</span>
              <div style={{ minWidth: 0 }}>
                <div className="nombre">Gremio Nocturnos</div>
                <div className="estado">bot · avisos del gremio</div>
              </div>
            </div>
            <div className="burbujas">
              <div className="burbuja">
                <div className="texto">
                  {comoTelegram(
                    armarMensaje(
                      elSimulado.mensaje,
                      elSimulado.nombre,
                      elSimulado.horas[0] ?? 780,
                      (elSimulado.antes.includes(conAntes) ? conAntes : elSimulado.antes[0]) ?? 15,
                      'hoy',
                    ),
                  )}
                </div>
                <div className="hora">
                  {comoHora(
                    Math.max(
                      0,
                      (elSimulado.horas[0] ?? 780) -
                        ((elSimulado.antes.includes(conAntes) ? conAntes : elSimulado.antes[0]) ?? 15),
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5 }}>
            {elSimulado.dias.length === 0 || elSimulado.horas.length === 0 ? (
              <>Sin días o sin horas, este evento no dispara ningún aviso.</>
            ) : (
              <>
                Con lo cargado salen{' '}
                <b style={{ color: 'var(--oro)' }}>
                  {elSimulado.dias.length * elSimulado.horas.length * elSimulado.antes.length} avisos por semana
                </b>
                : {elSimulado.dias.length === 7 ? 'todos los días' : elSimulado.dias.map((d) => DIAS_LARGOS[d]).join(', ')}
                , a las {elSimulado.horas.map(comoHora).join(' y ')}, con{' '}
                {elSimulado.antes.map((n) => (n === 60 ? '1 hora' : `${n} min`)).join(' y ')} de anticipación.
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
