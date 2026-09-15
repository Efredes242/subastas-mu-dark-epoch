import { useEffect, useState } from 'react';
import { api } from '../api';
// La misma función que arma el título cuando el aviso sale de verdad: si el simulador tuviera su
// propia copia, tarde o temprano muestran cosas distintas.
import { comoTitulo, type HoraAviso, type Titulo } from '../../worker/avisos';
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
  emoji: string;
  titulo: Titulo;
  dias: number[];
  horas: HoraAviso[];
  antes: number[];
  mensaje: string;
  alEmpezar: boolean;
  mensajeInicio: string;
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

/** Cómo se llama cada estilo en la pantalla, y qué hace. */
const ESTILOS: Array<[Titulo, string, string]> = [
  ['simple', 'Simple', 'El nombre en negrita, como estaba'],
  ['ancho', 'Espaciado', 'En mayúsculas y con aire entre las letras'],
  ['grueso', 'Grueso', 'Letras anchas, se ven más pesadas que la negrita'],
  ['bandera', 'Bandera', 'Letras anchas con una regla arriba y abajo'],
];

/** Lo que dura un evento nuevo hasta que le digan otra cosa. */
const DURA_DE_FABRICA = 10;

/** Los de siempre, para no tener que salir a buscar uno. */
const EMOJIS = ['⚔️', '🏰', '👑', '🔥', '💀', '🐉', '⭐', '🗡️', '🛡️', '📣'];

/** Los recordatorios que se ofrecen con un toque. Más de una hora antes no sirve de nada. */
const ANTES_SUGERIDOS = [60, 45, 30, 15, 10, 5];

const MARCAS: Array<[string, string]> = [
  ['{titulo}', 'el nombre en grande'],
  ['{evento}', 'el nombre, tal cual'],
  ['{hora}', 'la hora de arranque'],
  ['{falta}', 'cuánto falta'],
  ['{termina}', 'a qué hora termina'],
  ['{dura}', 'cuánto dura'],
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

const armarMensaje = (plantilla: string, aviso: Aviso, cae: HoraAviso, antes: number, dia: string) =>
  plantilla
    .replace(/\{titulo\}/g, comoTitulo(aviso.nombre, aviso.titulo, aviso.emoji))
    .replace(/\{evento\}/g, aviso.nombre || 'el evento')
    .replace(/\{hora\}/g, comoHora(cae.minutos))
    .replace(/\{termina\}/g, comoHora(cae.minutos + cae.dura))
    .replace(/\{dura\}/g, comoFalta(cae.dura))
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

interface Resumen {
  hora: number;
  activo: boolean;
  texto: string;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const MARCAS_RESUMEN: Array<[string, string]> = [
  ['{dia}', 'domingo'],
  ['{fecha}', '20 de septiembre'],
  ['{lista}', 'los eventos del día'],
  ['{cuantos}', 'cuántos hay'],
];

/** El mismo armado que hace el Worker, para que el simulador muestre lo que va a salir. */
function armarResumen(avisos: Aviso[], plantilla: string, diaSemana: number, fecha: Date): string {
  const delDia = avisos
    .filter((a) => a.activo && a.dias.includes(diaSemana) && a.horas.length > 0)
    .sort((a, b) => Math.min(...a.horas.map((h) => h.minutos)) - Math.min(...b.horas.map((h) => h.minutos)));

  const lista =
    delDia.length === 0
      ? 'Hoy no hay eventos cargados.'
      : delDia
          .map((a) => {
            const horas = a.horas.map((h) => comoHora(h.minutos));
            const cuando = horas.length === 1 ? horas[0] : `${horas.slice(0, -1).join(', ')} y ${horas.at(-1)}`;
            return `${a.emoji || '•'} *${a.nombre}* — ${cuando}`;
          })
          .join('\n');

  return plantilla
    .replace(/\{dia\}/g, DIAS_LARGOS[diaSemana] ?? '')
    .replace(/\{fecha\}/g, `${fecha.getDate()} de ${MESES[fecha.getMonth()]}`)
    .replace(/\{cuantos\}/g, String(delDia.length))
    .replace(/\{lista\}/g, lista);
}

interface EstadoBot {
  conToken: boolean;
  bot: { nombre: string; usuario: string } | null;
  problema?: string;
  chat: string;
  nombre: string;
  activo: boolean;
}

interface ChatVisto {
  id: string;
  nombre: string;
  tipo: string;
}

/**
 * El bot de Telegram.
 *
 * El token no pasa por acá: es un secreto del Worker y el panel solo sabe si está puesto. Lo
 * único que se elige desde la pantalla es a qué chat mandar, que se descubre mirando dónde le
 * hablaron al bot —Telegram no tiene forma de listar los grupos de un bot—.
 */
/** Lo que el resto de la pantalla necesita saber del bot. */
interface ComoEstaElBot {
  /** Si los avisos salen solos. */
  manda: boolean;
  /** Si se puede mandar un ensayo. Alcanza con el token y el chat: probar con los avisos apagados
   *  es justamente para lo que sirve. */
  prueba: boolean;
}

function Bot({ alError, alSaber }: { alError: (m: string) => void; alSaber: (c: ComoEstaElBot) => void }) {
  const [estado, setEstado] = useState<EstadoBot | null>(null);
  const [chats, setChats] = useState<ChatVisto[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  async function traer() {
    try {
      setEstado(await api<EstadoBot>('/telegram'));
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo leer el bot.');
    }
  }

  useEffect(() => {
    void traer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Que los eventos de abajo sepan si lo que configuran sale de verdad o queda guardado nomás.
  useEffect(() => {
    if (!estado) return;
    const listo = estado.conToken && !!estado.chat && !estado.problema;
    alSaber({ manda: listo && estado.activo, prueba: listo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado?.activo, estado?.conToken, estado?.chat, estado?.problema]);

  async function correr(fn: () => Promise<void>) {
    setOcupado(true);
    alError('');
    try {
      await fn();
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo.');
    } finally {
      setOcupado(false);
    }
  }

  const buscarChats = () =>
    correr(async () => {
      const r = await api<{ chats: ChatVisto[] }>('/telegram/chats');
      setChats(r.chats);
      setAviso(
        r.chats.length === 0
          ? 'No vi ningún chat. Agregá el bot al grupo, escribí cualquier cosa ahí y probá de nuevo.'
          : '',
      );
    });

  const elegir = (c: ChatVisto) =>
    correr(async () => {
      setEstado(await api<EstadoBot>('/telegram', { metodo: 'PATCH', cuerpo: { chat: c.id, nombre: c.nombre } }));
      setChats(null);
      setAviso(`Van a salir a "${c.nombre}".`);
    });

  const prender = (activo: boolean) =>
    correr(async () => {
      setEstado(await api<EstadoBot>('/telegram', { metodo: 'PATCH', cuerpo: { activo } }));
      setAviso(activo ? 'Los avisos salen solos de acá en más.' : 'Los avisos quedaron apagados.');
    });

  const probar = () =>
    correr(async () => {
      const r = await api<{ aviso: string }>('/telegram/probar', { cuerpo: {} });
      setAviso(r.aviso);
    });

  if (!estado) {
    return (
      <section className="panel subir" style={{ padding: 18 }}>
        <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="cargando" />
        </div>
      </section>
    );
  }

  return (
    <section className="panel subir" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>El bot de Telegram</h2>
        {estado.conToken && estado.chat && (
          <button
            type="button"
            className={`btn btn-chico ${estado.activo ? 'btn-ok' : 'btn-oro'}`}
            disabled={ocupado}
            onClick={() => void prender(!estado.activo)}
          >
            {estado.activo ? 'Avisos prendidos' : 'Prender los avisos'}
          </button>
        )}
      </div>

      {/* Paso 1: el token, que no pasa por esta pantalla. */}
      {!estado.conToken ? (
        <div style={{ marginTop: 12 }}>
          <div className="aviso" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.6 }}>
            <b>Falta el token del bot.</b> No se carga desde acá a propósito: con el token cualquiera
            publica en el grupo haciéndose pasar por el bot, y lo que se guarda en la base se exporta
            en cada respaldo. Va como secreto del Worker, que no sale nunca de Cloudflare:
            <pre className="comando">npx wrangler secret put TELEGRAM_TOKEN</pre>
            Pega el token cuando lo pida, volvé a desplegar y recargá esta página.
          </div>
        </div>
      ) : estado.problema ? (
        <div className="aviso mal" style={{ marginTop: 12, fontSize: 12.5 }}>
          <Alerta tam={16} />
          <span>
            El token está puesto pero Telegram lo rechaza: <b>{estado.problema}</b>. Si lo revocaste,
            cargá el nuevo con <code>wrangler secret put TELEGRAM_TOKEN</code>.
          </span>
        </div>
      ) : (
        <div className="filas-bot">
          <div className="fila-bot">
            <span className="paso-ok">
              <Tilde tam={13} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {estado.bot?.nombre}
                {estado.bot?.usuario && (
                  <span style={{ color: 'var(--tx3)', fontWeight: 600 }}> · @{estado.bot.usuario}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Token cargado y aceptado por Telegram</div>
            </div>
          </div>

          <div className="fila-bot">
            <span className={estado.chat ? 'paso-ok' : 'paso-falta'}>
              {estado.chat ? <Tilde tam={13} /> : '2'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                {estado.chat ? estado.nombre || estado.chat : 'Falta elegir a qué chat mandar'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.45 }}>
                {estado.chat
                  ? `Los avisos salen acá · id ${estado.chat}`
                  : 'Agregá el bot al grupo del gremio, escribí cualquier cosa ahí y tocá Buscar.'}
              </div>
            </div>
            <button type="button" className="btn btn-chico" disabled={ocupado} onClick={() => void buscarChats()}>
              {estado.chat ? 'Cambiar' : 'Buscar el grupo'}
            </button>
          </div>

          {chats && (
            <div className="chats-vistos">
              {chats.length === 0 ? (
                <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
                  No apareció ninguno. Telegram solo muestra los chats donde al bot le hablaron: mandá
                  un mensaje en el grupo y volvé a buscar.
                </div>
              ) : (
                chats.map((ch) => (
                  <button key={ch.id} type="button" className="chat-visto" disabled={ocupado} onClick={() => void elegir(ch)}>
                    <span className="nombre">{ch.nombre}</span>
                    <span className="tipo">{ch.tipo}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {estado.chat && (
            <div className="fila-bot">
              <span className={estado.activo ? 'paso-ok' : 'paso-falta'}>{estado.activo ? <Tilde tam={13} /> : '3'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                  {estado.activo ? 'Los avisos salen solos' : 'Los avisos están apagados'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                  El Worker mira cada minuto qué aviso toca y lo manda una sola vez.
                </div>
              </div>
              <button type="button" className="btn btn-chico" disabled={ocupado} onClick={() => void probar()}>
                Mandar una prueba
              </button>
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
    </section>
  );
}

export function Avisos({ alError }: { alError: (m: string) => void }) {
  const [lista, setLista] = useState<Aviso[]>([]);
  /** Cada evento tal como está guardado, para saber qué se tocó y todavía no se mandó. */
  const [guardado, setGuardado] = useState<Record<number, Aviso>>({});
  /** Cómo está el bot. null mientras no se sabe. */
  const [bot, setBot] = useState<ComoEstaElBot | null>(null);
  /** Qué evento se está ensayando ahora mismo. */
  const [ensayando, setEnsayando] = useState<number | null>(null);
  /** Lo que contestó el último ensayo, junto al evento que se probó. */
  const [ensayo, setEnsayo] = useState<{ id: number; texto: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');

  const [resumen, setResumen] = useState<Resumen | null>(null);

  /** Qué evento y qué recordatorio está mirando el simulador. null = el resumen del día. */
  const [mirando, setMirando] = useState<number | null>(null);
  const [conAntes, setConAntes] = useState(15);
  const [verResumen, setVerResumen] = useState(false);

  /** El pedido que se le hace a la IA, por si quiere otro tono. */
  const [tono, setTono] = useState('');
  const [redactando, setRedactando] = useState<number | null>(null);

  async function traer() {
    try {
      const r = await api<{ avisos: Aviso[]; resumen: Resumen }>('/avisos');
      asentar(r.avisos);
      setResumen(r.resumen);
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

  /** Agregar un horario escrito a mano. Devuelve si se entendió lo que se escribió. */
  const sumarHora = (a: Aviso, crudo: string): boolean => {
    const m = leerHora(crudo);
    if (m === null || a.horas.some((h) => h.minutos === m)) return false;
    tocar(a.id, {
      horas: [...a.horas, { minutos: m, dura: DURA_DE_FABRICA }].sort((x, y) => x.minutos - y.minutos),
    });
    return true;
  };

  const igual = (a: Aviso, b?: Aviso) =>
    !!b &&
    a.nombre === b.nombre &&
    a.emoji === b.emoji &&
    a.titulo === b.titulo &&
    a.mensaje === b.mensaje &&
    a.activo === b.activo &&
    a.dias.join() === b.dias.join() &&
    a.alEmpezar === b.alEmpezar &&
    a.mensajeInicio === b.mensajeInicio &&
    a.horas.map((h) => `${h.minutos}:${h.dura}`).join() ===
      b.horas.map((h) => `${h.minutos}:${h.dura}`).join() &&
    a.antes.join() === b.antes.join();

  /** Si este evento tiene cambios que todavía no se mandaron. */
  const sucio = (a: Aviso) => !igual(a, guardado[a.id]);

  /**
   * La lista que vuelve del servidor, sin pisar lo que se está editando.
   *
   * Cualquier acción —guardar otro evento, borrar, crear— devuelve los avisos enteros. Volcar eso
   * en pantalla se lleva puestos, sin decir nada, los cambios sin guardar del evento de al lado:
   * se tildan tres recordatorios en uno, se guarda el otro, y los tildes desaparecen como si nunca
   * hubieran estado. Los que tienen cambios a medio hacer se quedan como están; el que se acaba de
   * guardar toma la versión del servidor, que es la que vale.
   */
  const asentar = (avisos: Aviso[], recien?: number) => {
    const aMedias = new Map(lista.filter((a) => a.id !== recien && sucio(a)).map((a) => [a.id, a]));
    setLista(avisos.map((a) => aMedias.get(a.id) ?? a));
    setGuardado(Object.fromEntries(avisos.map((a) => [a.id, a])));
  };

  async function correr(
    fn: () => Promise<{ avisos: Aviso[]; resumen?: Resumen; aviso?: string }>,
    recien?: number,
  ) {
    setOcupado(true);
    alError('');
    try {
      const r = await fn();
      asentar(r.avisos, recien);
      if (r.resumen) setResumen(r.resumen);
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
          emoji: a.emoji,
          titulo: a.titulo,
          dias: a.dias,
          horas: a.horas,
          antes: a.antes,
          mensaje: a.mensaje,
          alEmpezar: a.alEmpezar,
          mensajeInicio: a.mensajeInicio,
          activo: a.activo,
        },
      }),
      a.id,
    );

  /**
   * Mandar este evento al grupo para verlo de verdad.
   *
   * Sale del que está guardado, no del que está en pantalla: lo que se prueba tiene que ser lo
   * mismo que va a salir solo después, si no la prueba no prueba nada. Por eso el botón espera a
   * que no queden cambios sueltos.
   *
   * Se borra solo al minuto. De eso se encarga el cron, no este pedido.
   */
  async function ensayar(a: Aviso) {
    setEnsayando(a.id);
    alError('');
    setEnsayo(null);
    try {
      const r = await api<{ aviso: string }>('/telegram/ensayo', {
        cuerpo: { cual: 'evento', avisoId: a.id, antes: a.antes[0] ?? 15, minutos: 1 },
      });
      setEnsayo({ id: a.id, texto: r.aviso });
    } catch (e) {
      alError(e instanceof Error ? e.message : 'No se pudo mandar el ensayo.');
    } finally {
      setEnsayando(null);
    }
  }

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

  // Los momentos en que este evento avisa: los recordatorios de antes, y el arranque si está puesto.
  const momentos = elSimulado
    ? [...(elSimulado.antes.length > 0 ? elSimulado.antes : [15]), ...(elSimulado.alEmpezar ? [0] : [])]
    : [];
  const elMomento = momentos.includes(conAntes) ? conAntes : (momentos[0] ?? 15);
  const cae = elSimulado?.horas[0] ?? { minutos: 780, dura: 10 };

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 980 }}>
      <Bot alError={alError} alSaber={setBot} />

      {bot?.manda === false && (
        <div className="aviso mal" style={{ fontSize: 13, lineHeight: 1.5 }}>
          <Alerta tam={18} />
          <span>
            <b>Los avisos no están saliendo.</b> Acá abajo se puede configurar todo igual, y se guarda
            igual, pero al grupo no llega nada hasta que el bot esté prendido, ahí arriba.
          </span>
        </div>
      )}

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
          Con el bot prendido, el Worker mira cada minuto qué aviso toca y lo manda una sola vez. El
          simulador de abajo muestra el mensaje tal cual va a llegar.
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
          <section
            key={a.id}
            className={`panel subir aviso-evento${a.activo ? '' : ' apagado'}${sucio(a) ? ' sin-guardar' : ''}`}
          >
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

              <div className="horas-aviso">
                <span className="etiqueta">A qué hora cae y cuánto dura</span>

                {a.horas.map((h) => (
                  <div key={h.minutos} className="hora-dura">
                    <span className="num cuando">{comoHora(h.minutos)}</span>
                    <span className="hasta">a</span>
                    <span className="num cuando termina">{comoHora(h.minutos + h.dura)}</span>
                    <input
                      className="campo campo-chico"
                      style={{ width: 58, textAlign: 'center' }}
                      value={String(h.dura)}
                      disabled={ocupado}
                      inputMode="numeric"
                      title="Cuánto dura, en minutos"
                      onChange={(e) => {
                        const d = Math.min(360, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1));
                        tocar(a.id, {
                          horas: a.horas.map((x) => (x.minutos === h.minutos ? { ...x, dura: d } : x)),
                        });
                      }}
                    />
                    <span className="min">min</span>
                    <button
                      type="button"
                      className="chip-lista sacar"
                      disabled={ocupado}
                      title="Sacar este horario"
                      onClick={() => tocar(a.id, { horas: a.horas.filter((x) => x.minutos !== h.minutos) })}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <div className="chips">
                  <input
                    className="campo campo-chico"
                    style={{ width: 88 }}
                    placeholder="+ 13:00"
                    disabled={ocupado}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      if (sumarHora(a, e.currentTarget.value)) e.currentTarget.value = '';
                    }}
                    onBlur={(e) => {
                      sumarHora(a, e.target.value);
                      e.target.value = '';
                    }}
                  />
                </div>

                <p className="pie">
                  Los avisos de este evento se borran solos del grupo cuando termina.
                </p>
              </div>

              <div className="titulo-aviso">
                <span className="etiqueta">Cómo se ve el nombre en Telegram</span>
                <div className="chips" style={{ marginBottom: 10 }}>
                  {ESTILOS.map(([id, como, que]) => (
                    <button
                      key={id}
                      type="button"
                      className={`chip-lista${a.titulo === id ? ' dentro' : ''}`}
                      disabled={ocupado}
                      title={que}
                      onClick={() => tocar(a.id, { titulo: id })}
                    >
                      {como}
                    </button>
                  ))}
                </div>

                <div className="chips" style={{ marginBottom: 10 }}>
                  <input
                    className="campo campo-chico"
                    style={{ width: 62, textAlign: 'center', fontSize: 16 }}
                    value={a.emoji}
                    disabled={ocupado}
                    maxLength={6}
                    title="El emoji que acompaña al nombre. Vacío, no sale ninguno."
                    onChange={(e) => tocar(a.id, { emoji: e.target.value })}
                  />
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={`chip-lista${a.emoji === e ? ' dentro' : ''}`}
                      disabled={ocupado}
                      onClick={() => tocar(a.id, { emoji: a.emoji === e ? '' : e })}
                    >
                      {e}
                    </button>
                  ))}
                </div>

                <div className="muestra-titulo">{comoTelegram(comoTitulo(a.nombre, a.titulo, a.emoji))}</div>

                {!a.mensaje.includes('{titulo}') && (
                  <div className="aviso" style={{ marginTop: 10, fontSize: 12, display: 'block', lineHeight: 1.5 }}>
                    Este texto no usa <code>{'{titulo}'}</code>, así que el nombre va a salir como esté
                    escrito ahí abajo y esto no cambia nada. Poné la marca donde lo quieras.
                  </div>
                )}
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

            <div className="texto-aviso">
              <div className="arriba">
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

            {/* El aviso del momento en que arranca, que es el único que no habla del futuro. */}
            <div className="texto-aviso">
              <div className="arriba">
                <span className="etiqueta">El texto de cuando arranca</span>
                <button
                  type="button"
                  className={`btn btn-chico${a.alEmpezar ? ' btn-ok' : ''}`}
                  disabled={ocupado}
                  title={
                    a.alEmpezar
                      ? 'Se avisa en el momento en que arranca'
                      : 'No se avisa cuando arranca, solo los recordatorios de antes'
                  }
                  onClick={() => tocar(a.id, { alEmpezar: !a.alEmpezar })}
                >
                  {a.alEmpezar ? 'Se avisa' : 'No se avisa'}
                </button>
              </div>
              {a.alEmpezar && (
                <textarea
                  className="campo"
                  rows={3}
                  value={a.mensajeInicio}
                  disabled={ocupado}
                  onChange={(e) => tocar(a.id, { mensajeInicio: e.target.value })}
                  placeholder="{titulo}&#10;&#10;🟢 *Arrancó.* Hasta las *{termina}*."
                  style={{ padding: 12, minHeight: 78, lineHeight: 1.5, resize: 'vertical', marginTop: 6 }}
                />
              )}
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
              <button
                type="button"
                className="btn btn-chico"
                disabled={ocupado || ensayando !== null || !bot?.prueba || sucio(a)}
                title={
                  !bot?.prueba
                    ? 'Falta el token del bot o el chat a donde mandar'
                    : sucio(a)
                      ? 'Guardá los cambios: el ensayo manda lo que está guardado'
                      : `Manda "${a.nombre}" al grupo como prueba. Se borra solo al minuto.`
                }
                onClick={() => void ensayar(a)}
              >
                {ensayando === a.id ? 'Mandando…' : '🧪 Probar en Telegram'}
              </button>
              {sucio(a) && <span className="pastilla av">sin guardar</span>}
              <button
                type="button"
                className={`btn btn-chico${sucio(a) ? ' btn-oro' : ''}`}
                disabled={ocupado || !sucio(a)}
                title={sucio(a) ? 'Mandar los cambios' : 'No hay nada nuevo para guardar'}
                onClick={() => void guardar(a)}
              >
                {sucio(a) ? 'Guardar cambios' : 'Guardado'}
              </button>
            </div>

            {ensayo?.id === a.id && (
              <div className="aviso aparecer" style={{ marginTop: 10, fontSize: 12.5 }}>
                <Tilde tam={16} />
                <span>{ensayo.texto}</span>
              </div>
            )}

            {a.horas.length === 0 && (
              <div className="aviso mal" style={{ marginTop: 10, fontSize: 12.5 }}>
                <Alerta tam={16} />
                <span>Sin horarios este evento no avisa nunca. Cargale por lo menos uno.</span>
              </div>
            )}
          </section>
        ))
      )}

      {/* El resumen de la mañana: la agenda del día, una vez por día. */}
      {resumen && (
        <section className="panel subir" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>El resumen de la mañana</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-chico"
                disabled={ocupado}
                onClick={() => void correr(() => api('/avisos/resumen/probar', { cuerpo: {} }).then((r) => ({ avisos: lista, ...(r as object) })))}
              >
                Mandarlo ahora
              </button>
              <button
                type="button"
                className={`btn btn-chico ${resumen.activo ? 'btn-ok' : 'btn-oro'}`}
                disabled={ocupado}
                onClick={() =>
                  void correr(() =>
                    api('/avisos/resumen', { metodo: 'PATCH', cuerpo: { activo: !resumen.activo } }),
                  )
                }
              >
                {resumen.activo ? 'Prendido' : 'Prender'}
              </button>
            </div>
          </div>
          <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Una vez por día, la lista de lo que cae ese día. Sirve para que el gremio arranque sabiendo
            qué hay, sobre todo si se agregó algún evento de noche.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="etiqueta">A qué hora (del servidor)</span>
              <input
                className="campo campo-chico"
                style={{ width: 100 }}
                defaultValue={comoHora(resumen.hora)}
                disabled={ocupado}
                onBlur={(e) => {
                  const m = leerHora(e.target.value);
                  if (m === null || m === resumen.hora) {
                    e.target.value = comoHora(resumen.hora);
                    return;
                  }
                  void correr(() => api('/avisos/resumen', { metodo: 'PATCH', cuerpo: { hora: e.target.value } }));
                }}
              />
            </label>
            <div style={{ fontSize: 12, color: 'var(--tx3)', paddingBottom: 9 }}>
              Sale todos los días a esa hora, una sola vez.
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span className="etiqueta">El texto</span>
              <div className="marcas-aviso">
                {MARCAS_RESUMEN.map(([marca, que]) => (
                  <button
                    key={marca}
                    type="button"
                    title={que}
                    disabled={ocupado}
                    onClick={() => setResumen({ ...resumen, texto: `${resumen.texto}${marca}` })}
                  >
                    {marca}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              className="campo"
              rows={4}
              value={resumen.texto}
              disabled={ocupado}
              onChange={(e) => setResumen({ ...resumen, texto: e.target.value })}
              style={{ padding: 12, minHeight: 96, lineHeight: 1.5, resize: 'vertical', marginTop: 6 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-chico${verResumen ? ' btn-suave' : ''}`}
                disabled={ocupado}
                onClick={() => setVerResumen(true)}
              >
                Ver en el simulador
              </button>
              <button
                type="button"
                className="btn btn-oro btn-chico"
                disabled={ocupado}
                onClick={() => void correr(() => api('/avisos/resumen', { metodo: 'PATCH', cuerpo: { texto: resumen.texto } }))}
              >
                Guardar
              </button>
            </div>
          </div>
        </section>
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
                className={`chip-lista${!verResumen && elSimulado.id === a.id ? ' dentro' : ''}`}
                onClick={() => {
                  setMirando(a.id);
                  setVerResumen(false);
                }}
              >
                {a.nombre}
              </button>
            ))}
            {resumen && (
              <button
                type="button"
                className={`chip-lista${verResumen ? ' dentro' : ''}`}
                onClick={() => setVerResumen(true)}
              >
                📅 Resumen del día
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {!verResumen &&
              momentos.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip-lista${elMomento === n ? ' dentro' : ''}`}
                  onClick={() => setConAntes(n)}
                >
                  <Reloj tam={12} />{' '}
                  {n === 0 ? 'cuando arranca' : n === 60 ? '1 hora antes' : `${n} min antes`}
                </button>
              ))}
            {verResumen && resumen && (
              <span className="chip-lista dentro">
                <Reloj tam={12} /> todos los días a las {comoHora(resumen.hora)}
              </span>
            )}
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
                    verResumen && resumen
                      ? armarResumen(lista, resumen.texto, new Date().getDay(), new Date())
                      : armarMensaje(
                          elMomento === 0 ? elSimulado.mensajeInicio : elSimulado.mensaje,
                          elSimulado,
                          cae,
                          elMomento,
                          'hoy',
                        ),
                  )}
                </div>
                <div className="hora">
                  {verResumen && resumen ? comoHora(resumen.hora) : comoHora(Math.max(0, cae.minutos - elMomento))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--tx3)', lineHeight: 1.5 }}>
            {verResumen && resumen ? (
              resumen.activo ? (
                <>
                  Sale <b style={{ color: 'var(--oro)' }}>todos los días a las {comoHora(resumen.hora)}</b> del
                  servidor, con los eventos de ese día.
                </>
              ) : (
                <>El resumen está apagado: se prende arriba.</>
              )
            ) : elSimulado.dias.length === 0 || elSimulado.horas.length === 0 ? (
              <>Sin días o sin horas, este evento no dispara ningún aviso.</>
            ) : (
              <>
                Con lo cargado salen{' '}
                <b style={{ color: 'var(--oro)' }}>
                  {elSimulado.dias.length * elSimulado.horas.length * momentos.length} avisos por semana
                </b>
                : {elSimulado.dias.length === 7 ? 'todos los días' : elSimulado.dias.map((d) => DIAS_LARGOS[d]).join(', ')}
                ,{' '}
                {elSimulado.horas
                  .map((h) => `de ${comoHora(h.minutos)} a ${comoHora(h.minutos + h.dura)}`)
                  .join(' y ')}
                . Cada uno se borra del grupo cuando el evento termina.
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
