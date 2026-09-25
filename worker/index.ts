import { Hono } from 'hono';
import {
  cargarUsuario,
  cerrarSesion,
  crearSesion,
  hashearPassword,
  requiereAdmin,
  requiereGrandMaster,
  requiereSesion,
  verificarPassword,
  type Variables,
} from './auth';
import { asegurarEnCatalogo, comoTitulo, ICONOS, normalizar, parsearLote, RAREZAS } from './catalogo';
import { DE_FABRICA, normalizarCodigo } from './clases';
import {
  asegurarEvento,
  COLAS,
  construirEstado,
  elegirGanador,
  eventoActivo,
  guardarOrden,
  colaPorDefecto,
  colasDeCatalogo,
  cerrarVencidos,
  guardarTurno,
  leerAjustes,
  leerHorario,
  enLaRueda,
  ordenDePrioridad,
  participantesDe,
  type Cola,
} from './consultas';
import { empezarLoginGoogle, googleConfigurado, terminarLoginGoogle, volvioEnVentana } from './google';
import { comoPedido, usuarioLibre, type FilaPedido } from './ingresos';
import { comoGuardadas, comoHora, type Franja, leerHora } from './horarios';
import { comoInterfaz, comoPermisos, puede, type Permiso } from './interfaz';
import { FOTOS_MAXIMAS, borrar, chatsVistos, mandar, mandarConFotos, quienEs, type Foto } from './telegram';
import {
  ANTES_MAXIMO,
  armarMensaje,
  armarResumen,
  comoAviso,
  comoGuardadasHoras,
  laVezQueAnuncia,
  type Aviso,
  type Disparo,
  disparosEntre,
  RESUMEN_POR_DEFECTO,
  comoHora as comoHoraAviso,
  DIAS_LARGOS,
  leerAviso,
  mensajePorDefecto,
  type FilaAviso,
} from './avisos';
import {
  manejaLaApp,
  type Env,
  type FilaCatalogo,
  type FilaEvento,
  type FilaItem,
  type FilaUsuario,
  type Rareza,
} from './types';

/** Las imagenes viajan como data URL dentro de la fila. El front ya las achica a 128px. */
const MAX_IMAGEN = 200_000;

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Si quien está pidiendo puede hacer algo que cambia las reglas del reparto.
 *
 * Esconder el botón en el panel no alcanza: la ruta se puede llamar igual. El admin siempre
 * puede; el Grand Master, solo si el admin se lo dejó prendido en el menú Desarrollador.
 */
async function dejaHacer(c: { env: Env; get: (k: 'usuario') => FilaUsuario | null }, cual: Permiso) {
  const usuario = c.get('usuario');
  if (!usuario) return false;
  const { permisos } = await leerAjustes(c.env.DB);
  return puede(permisos, cual, usuario.rol);
}

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const entero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
/** ["13:00","18:30","21:00"] → "13:00, 18:30 y 21:00". */
const enumerar = (partes: string[]): string =>
  partes.length < 2 ? (partes[0] ?? "") : partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1];

const pinNuevo = () => String(Math.floor(1000 + Math.random() * 9000));

/**
 * La imagen de un item o de una clase puede venir de dos lados: una ruta de la biblioteca
 * (/iconos/algo.webp), que es un archivo que ya está en Cloudflare, o una data URL que el
 * admin subió desde su equipo cuando lo que necesita no está en la biblioteca.
 */
const imagenValida = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  if (/^\/iconos\/[a-z0-9-]{1,80}\.(webp|png)$/.test(v)) return v;
  return v.startsWith('data:image/') && v.length <= MAX_IMAGEN ? v : null;
};

app.use('/api/*', cargarUsuario);

// ── Sesión ────────────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const usuario = texto(cuerpo.usuario, 60).toLowerCase();
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
  if (!usuario || !password) return c.json({ error: 'Faltan el usuario o la contraseña.' }, 400);

  const fila = await c.env.DB.prepare(
    'SELECT * FROM usuarios WHERE (lower(usuario) = ? OR lower(email) = ?) AND activo = 1',
  )
    .bind(usuario, usuario)
    .first<FilaUsuario>();

  // Mismo mensaje en los dos casos: no le decimos a nadie qué usuarios existen.
  if (!fila || !(await verificarPassword(password, fila.password_hash))) {
    return c.json({ error: 'Usuario o contraseña incorrectos.' }, 401);
  }

  await crearSesion(c, fila.id);
  return c.json({ ok: true });
});

/**
 * Elegir la propia contraseña.
 *
 * Si todavía tiene la que le puso el admin no se pide la anterior: la acaba de usar para entrar
 * y pedírsela de nuevo es puro trámite. En cualquier otro caso sí, porque una sesión olvidada
 * abierta en una máquina ajena no debería poder cambiarla.
 */
app.post('/api/auth/clave', requiereSesion, async (c) => {
  const yo = c.get('usuario')!;
  const cuerpo = await c.req.json().catch(() => ({}));
  const nueva = typeof cuerpo.nueva === 'string' ? cuerpo.nueva : '';
  const actual = typeof cuerpo.actual === 'string' ? cuerpo.actual : '';

  if (nueva.length < 6) return c.json({ error: 'La contraseña necesita al menos 6 caracteres.' }, 400);

  const fila = await c.env.DB.prepare('SELECT password_hash, debe_cambiar_clave FROM usuarios WHERE id = ?')
    .bind(yo.id)
    .first<{ password_hash: string; debe_cambiar_clave: number }>();
  if (!fila) return c.json({ error: 'No encontré tu cuenta.' }, 404);

  if (fila.debe_cambiar_clave !== 1 && fila.password_hash.length > 0) {
    if (!(await verificarPassword(actual, fila.password_hash))) {
      return c.json({ error: 'La contraseña actual no es esa.' }, 400);
    }
    if (actual === nueva) return c.json({ error: 'Esa ya es tu contraseña.' }, 400);
  }

  await c.env.DB.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = 0 WHERE id = ?')
    .bind(await hashearPassword(nueva), yo.id)
    .run();

  return c.json({
    ...(await construirEstado(c.env, { ...yo, debe_cambiar_clave: 0 })),
    aviso: 'Listo, esa es tu contraseña.',
  });
});

app.post('/api/auth/logout', (c) => {
  cerrarSesion(c);
  return c.json({ ok: true });
});

app.get('/api/auth/google', (c) => {
  if (!googleConfigurado(c.env)) return c.redirect('/?error=google-apagado', 302);
  return empezarLoginGoogle(c);
});

app.get('/api/auth/google/callback', async (c) => {
  if (!googleConfigurado(c.env)) return c.redirect('/?error=google-apagado', 302);

  const enVentana = volvioEnVentana(c);
  const r = await terminarLoginGoogle(c);

  if (r.ok) await crearSesion(c, r.usuario.id);

  const aDonde = r.ok
    ? '/'
    : `/?error=${r.motivo}${r.email ? `&mail=${encodeURIComponent(r.email)}` : ''}`;

  // Desde una ventana aparte no se puede redirigir: la que tiene que enterarse es la de atrás.
  if (enVentana) return c.html(cierraLaVentana(aDonde, r.ok));

  return c.redirect(aDonde, 302);
});

/**
 * La página que ve la ventana de Google al volver: le avisa a la app y se cierra.
 *
 * Si la app no la escucha —quedó cerrada, o el navegador no deja hablar entre ventanas— queda
 * un enlace a mano para seguir sin quedarse trabado mirando una ventana en blanco.
 */
function cierraLaVentana(aDonde: string, entro: boolean): string {
  const json = JSON.stringify({ tipo: 'login-google', ok: entro, aDonde });
  return `<!doctype html><meta charset="utf-8"><title>${entro ? 'Listo' : 'No se pudo entrar'}</title>
<style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#080a11;color:#e9edf7;
font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#8f90f8}</style>
<p>${entro ? 'Listo, ya entraste. Podés cerrar esta ventana.' : 'No se pudo entrar.'}<br>
<a href="${aDonde}" target="_blank" rel="opener">Volver a la app</a></p>
<script>
  try { window.opener && window.opener.postMessage(${json}, window.location.origin); } catch (e) {}
  setTimeout(function () { window.close(); }, ${entro ? 400 : 2500});
</script>`;
}

app.get('/api/estado', async (c) => c.json(await construirEstado(c.env, c.get('usuario'))));

/** Cada uno puede guardar en qué zona horaria quiere ver los horarios. */
app.patch('/api/perfil', requiereSesion, async (c) => {
  const usuario = c.get('usuario')!;
  const cuerpo = await c.req.json().catch(() => ({}));
  const zona = cuerpo.zona === null ? null : texto(cuerpo.zona, 60) || null;
  await c.env.DB.prepare('UPDATE usuarios SET zona = ? WHERE id = ?').bind(zona, usuario.id).run();
  return c.json(await construirEstado(c.env, { ...usuario, zona }));
});

// ── Evento ────────────────────────────────────────────────────────────────────

/**
 * Los Kundun se crean solos al entrar en su horario (ver consultas.asegurarEvento).
 * Esta ruta es para abrir uno fuera de hora, cuando cae algo salteado.
 */
app.post('/api/eventos', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const horario = await leerHorario(c.env.DB);
  const suelto = horario.franjas[0] ?? { duraMin: 10, premioMin: 30 };
  const minutos = Math.min(
    Math.max(entero(cuerpo.minutos) || suelto.duraMin + suelto.premioMin, 1),
    240,
  );
  const ahora = Date.now();

  const ultimo = await c.env.DB.prepare('SELECT MAX(numero) AS n FROM eventos').first<{ n: number | null }>();

  await c.env.DB.prepare('UPDATE eventos SET cerrado = 1, registro_abierto = 0 WHERE cerrado = 0').run();
  // Un evento fuera de hora arranca con el código ya disponible: no tiene sentido esperar.
  await c.env.DB.prepare(
    `INSERT INTO eventos (numero, sala, pin, registro_abierto, abre_en, pin_desde, empieza_en, registro_hasta, cierra_en)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  )
    .bind(
      (ultimo?.n ?? 0) + 1,
      texto(cuerpo.sala, 40),
      pinNuevo(),
      new Date(ahora - horario.abreAntesMin * 60_000).toISOString(),
      new Date(ahora).toISOString(),
      new Date(ahora).toISOString(),
      new Date(ahora + Math.max(minutos - horario.cierraRegistroAntesMin, 0) * 60_000).toISOString(),
      new Date(ahora + minutos * 60_000).toISOString(),
    )
    .run();

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/**
 * Kundun de prueba: abre un evento marcado como prueba, con todo el gremio presente y
 * unos drops de ejemplo, para poder recorrer el circuito entero cuando uno quiera.
 * Guarda dónde estaban las ruedas para devolverlas al borrarlo.
 */
app.post('/api/eventos/prueba', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  // Una prueba de domingo abre los dos campos de carga: el del Kundun y el del asedio.
  const domingo = cuerpo.domingo === true;
  const horario = await leerHorario(c.env.DB);
  const ahora = Date.now();

  // Copia de todos los turnos: la prueba los va a mover y hay que poder devolverlos.
  await c.env.DB.prepare('DELETE FROM turnos_respaldo').run();
  await c.env.DB.prepare('INSERT INTO turnos_respaldo (catalogo_id, cola, usuario_id) SELECT catalogo_id, cola, usuario_id FROM turnos').run();

  await c.env.DB.prepare('UPDATE eventos SET cerrado = 1, registro_abierto = 0 WHERE cerrado = 0').run();
  await c.env.DB.prepare(
    `INSERT INTO eventos
       (numero, sala, pin, registro_abierto, abre_en, pin_desde, empieza_en, registro_hasta, cierra_en, es_prueba, forzar_domingo)
     VALUES (0, ?, ?, 1, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(
      domingo ? 'Prueba de domingo' : 'Prueba',
      pinNuevo(),
      new Date(ahora - horario.abreAntesMin * 60_000).toISOString(),
      new Date(ahora).toISOString(),
      new Date(ahora).toISOString(),
      new Date(ahora + 120 * 60_000).toISOString(),
      new Date(ahora + 120 * 60_000).toISOString(),
      domingo ? 1 : 0,
    )
    .run();

  const evento = await eventoActivo(c.env.DB);
  if (!evento) return c.json({ error: 'No se pudo abrir la prueba.' }, 500);

  // La asistencia queda SIN confirmar a propósito: la prueba sirve para ensayar el circuito
  // entero, y eso arranca por el cartel que pide marcar quiénes estuvieron.

  // Todo el gremio presente, pero sin un solo drop: la prueba arranca vacía para poder
  // recorrer el circuito entero, incluido cargar.
  const gremio = await c.env.DB.prepare('SELECT id FROM usuarios WHERE activo = 1').all<{ id: number }>();
  if (gremio.results.length > 0) {
    await c.env.DB.batch(
      gremio.results.map((u) =>
        c.env.DB.prepare('INSERT INTO asistencias (evento_id, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(
          evento.id,
          u.id,
        ),
      ),
    );
  }

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({
    ...estado,
    aviso:
      `Kundun de prueba${domingo ? ' de domingo' : ''} abierto, vacío y con todo el gremio presente. ` +
      'Probá lo que quieras: al borrarlo, las ruedas vuelven a donde estaban.',
  });
});

/** Borra las pruebas y devuelve las ruedas a donde estaban antes. */
app.delete('/api/eventos/prueba', requiereAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM eventos WHERE es_prueba = 1 ORDER BY id ASC',
  ).all<FilaEvento>();

  if (results.length === 0) return c.json({ error: 'No hay ninguna prueba abierta.' }, 404);

  // Los turnos vuelven a como estaban antes de la prueba.
  await c.env.DB.prepare('DELETE FROM turnos').run();
  await c.env.DB.prepare('INSERT INTO turnos (catalogo_id, cola, usuario_id) SELECT catalogo_id, cola, usuario_id FROM turnos_respaldo').run();
  await c.env.DB.prepare('DELETE FROM turnos_respaldo').run();

  await c.env.DB.prepare('DELETE FROM eventos WHERE es_prueba = 1').run();
  await c.env.DB.prepare(
    'UPDATE catalogo SET veces = (SELECT COUNT(*) FROM items i WHERE i.catalogo_id = catalogo.id)',
  ).run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({ ...estado, aviso: 'Prueba borrada. Las ruedas volvieron a donde estaban.' });
});

app.patch('/api/eventos/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  if (typeof cuerpo.registroAbierto === 'boolean') {
    await c.env.DB.prepare('UPDATE eventos SET registro_abierto = ? WHERE id = ?')
      .bind(cuerpo.registroAbierto ? 1 : 0, id)
      .run();
  }
  if (cuerpo.cerrado === true) {
    await c.env.DB.prepare('UPDATE eventos SET cerrado = 1, registro_abierto = 0 WHERE id = ?').bind(id).run();
  }
  if (typeof cuerpo.minutos === 'number') {
    const minutos = Math.min(Math.max(entero(cuerpo.minutos), 1), 240);
    await c.env.DB.prepare('UPDATE eventos SET cierra_en = ? WHERE id = ?')
      .bind(new Date(Date.now() + minutos * 60_000).toISOString(), id)
      .run();
  }

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/**
 * Quiénes estuvieron en el Kundun: el primer paso de la subasta. Los marca el admin o la
 * Grand Master, y de ahí sale entre quiénes se reparte.
 *
 * Tocar la lista después de confirmarla la vuelve a dejar sin confirmar, para que no se
 * carguen drops con la asistencia a medio cambiar.
 */
app.post('/api/eventos/:id/presentes', requiereGrandMaster, async (c) => {
  const eventoId = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));
  const usuarioId = entero(cuerpo.usuarioId);
  if (usuarioId <= 0) return c.json({ error: 'Falta el personaje.' }, 400);

  if (cuerpo.presente === false) {
    await c.env.DB.prepare('DELETE FROM asistencias WHERE evento_id = ? AND usuario_id = ?')
      .bind(eventoId, usuarioId)
      .run();
  } else {
    await c.env.DB.prepare('INSERT INTO asistencias (evento_id, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
      .bind(eventoId, usuarioId)
      .run();
  }

  await c.env.DB.prepare('UPDATE eventos SET asistencia_lista = 0 WHERE id = ?').bind(eventoId).run();

  // Devuelve lo mínimo a propósito: la pantalla ya pintó el tilde sola y el refresco de cada
  // ocho segundos reconcilia. Rearmar el estado entero para un checkbox eran quince consultas
  // y casi un segundo de espera por clic.
  return c.json({ ok: true });
});

/** Marca de una a todo el gremio, para cuando fueron todos. */
app.post('/api/eventos/:id/presentes/todos', requiereGrandMaster, async (c) => {
  const eventoId = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  if (cuerpo.presente === false) {
    await c.env.DB.prepare('DELETE FROM asistencias WHERE evento_id = ?').bind(eventoId).run();
  } else {
    const { results } = await c.env.DB.prepare('SELECT id FROM usuarios WHERE activo = 1').all<{ id: number }>();
    if (results.length > 0) {
      await c.env.DB.batch(
        results.map((u) =>
          c.env.DB.prepare(
            'INSERT INTO asistencias (evento_id, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
          ).bind(eventoId, u.id),
        ),
      );
    }
  }

  await c.env.DB.prepare('UPDATE eventos SET asistencia_lista = 0 WHERE id = ?').bind(eventoId).run();

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

// ── Items ─────────────────────────────────────────────────────────────────────

/**
 * Carga en tanda lo que salió subastado, tal como se lee del chat:
 *   "1 cqc, 2 condor flame, 2 almas de guerra"
 * Cada unidad entra como un item aparte, porque cada una la puja una persona distinta.
 */
/**
 * Guardar y confirmar quiénes estuvieron, de una sola vez.
 *
 * La pantalla arma la lista completa mientras se toca, sin pedir nada, y la manda entera al
 * tocar Listo. Antes cada clic era un pedido: el tilde iba y venía hasta que llegaba el
 * refresco, y se veía como un parpadeo.
 *
 * `presentes` es la lista definitiva; lo que no está adentro queda como ausente. Sin
 * `presentes` solo se cambia la confirmación, que es lo que usa "Corregir la asistencia".
 */
app.post('/api/eventos/:id/asistencia', requiereGrandMaster, async (c) => {
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));
  const listo = cuerpo.listo !== false;

  const evento = await eventoActivo(c.env.DB);
  if (!evento || evento.id !== id) return c.json({ error: 'Ese Kundun ya no está abierto.' }, 409);

  const escribe = Array.isArray(cuerpo.presentes);
  const presentes = escribe
    ? [...new Set((cuerpo.presentes as unknown[]).map(entero).filter((n) => n > 0))]
    : [];

  if (listo && escribe && presentes.length === 0) {
    return c.json({ error: 'Marcá al menos a uno antes de seguir.' }, 400);
  }

  if (!escribe && listo) {
    const cuantos = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM asistencias WHERE evento_id = ?')
      .bind(id)
      .first<{ n: number }>();
    if ((cuantos?.n ?? 0) === 0) return c.json({ error: 'Marcá al menos a uno antes de seguir.' }, 400);
  }

  // La lista se reemplaza entera, así no hay que averiguar qué cambió respecto de lo guardado.
  const escrituras = escribe
    ? [
        c.env.DB.prepare('DELETE FROM asistencias WHERE evento_id = ?').bind(id),
        ...presentes.map((u) =>
          c.env.DB.prepare('INSERT INTO asistencias (evento_id, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(
            id,
            u,
          ),
        ),
      ]
    : [];

  await c.env.DB.batch([
    ...escrituras,
    c.env.DB.prepare('UPDATE eventos SET asistencia_lista = ? WHERE id = ?').bind(listo ? 1 : 0, id),
  ]);

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({
    ...estado,
    aviso: listo
      ? `Listo, estuvieron ${escribe ? presentes.length : estado.orden.filter((p) => p.vino).length}. Ya podés cargar los drops.`
      : 'Volvé a marcar quiénes estuvieron.',
  });
});

/**
 * Cargar los drops del Kundun y repartirlos.
 *
 * Entran de dos formas. La normal es `items`: la lista del catálogo con cuánto salió de cada
 * uno, que es lo que manda la pantalla y no se puede escribir mal. La otra es `texto`, para lo
 * que todavía no está en el catálogo: se pega como se lee del chat, se resuelve por palabra
 * clave y se crea la entrada si hace falta.
 */
app.post('/api/items/lote', requiereGrandMaster, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));

  const elegidos: { catalogoId: number; cantidad: number }[] = Array.isArray(cuerpo.items)
    ? (cuerpo.items as { catalogoId?: unknown; cantidad?: unknown }[])
        .map((x) => ({ catalogoId: entero(x?.catalogoId), cantidad: entero(x?.cantidad) }))
        .filter((x) => x.catalogoId > 0 && x.cantidad > 0 && x.cantidad <= 99)
    : [];

  const renglones = parsearLote(texto(cuerpo.texto, 4000));
  if (renglones.length === 0 && elegidos.length === 0) {
    return c.json({ error: 'No elegiste ningún drop.' }, 400);
  }

  // Los domingos el asedio se carga en su propio campo: esos drops van a la lista del asedio
  // aunque el catálogo diga otra cosa.
  const forzada: Cola | null = COLAS.includes(cuerpo.cola) ? cuerpo.cola : null;

  const evento = await asegurarEvento(c.env.DB, new Date(), await leerHorario(c.env.DB));
  if (!evento) return c.json({ error: 'No hay ningún Kundun abierto.' }, 409);
  if (evento.asistencia_lista !== 1) {
    return c.json({ error: 'Primero marcá quiénes estuvieron y confirmá.' }, 409);
  }

  let creados = 0;
  const nuevosEnCatalogo: string[] = [];
  const nuevos: number[] = [];
  const colasDe = await colasDeCatalogo(c.env.DB);

  // Los dos caminos terminan en lo mismo: una entrada del catálogo y cuántas salieron.
  const aCargar: { entrada: FilaCatalogo; cantidad: number }[] = [];

  for (const elegido of elegidos) {
    const entrada = await c.env.DB.prepare('SELECT * FROM catalogo WHERE id = ?')
      .bind(elegido.catalogoId)
      .first<FilaCatalogo>();
    if (entrada) aCargar.push({ entrada, cantidad: elegido.cantidad });
  }

  for (const renglon of renglones) {
    aCargar.push({ entrada: await asegurarEnCatalogo(c.env.DB, renglon), cantidad: renglon.cantidad });
  }

  if (aCargar.length === 0) return c.json({ error: 'No elegiste ningún drop.' }, 400);

  for (const renglon of aCargar) {
    const entrada = renglon.entrada;
    if (!entrada.imagen) nuevosEnCatalogo.push(entrada.nombre);
    const cola = forzada ?? colaPorDefecto(colasDe.get(entrada.id) ?? ['items']);

    const inserts = [];
    for (let i = 1; i <= renglon.cantidad; i++) {
      inserts.push(
        c.env.DB.prepare(
          `INSERT INTO items (evento_id, nombre, tipo, rareza, icono, imagen, catalogo_id, copia, copias, cola)
           VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        ).bind(
          evento.id,
          entrada.nombre,
          entrada.rareza,
          entrada.icono,
          entrada.imagen,
          entrada.id,
          i,
          renglon.cantidad,
          cola,
        ),
      );
    }
    const puestos = await c.env.DB.batch<{ id: number }>(inserts);
    for (const r of puestos) if (r.results?.[0]?.id) nuevos.push(r.results[0].id);

    await c.env.DB.prepare('UPDATE catalogo SET veces = veces + ? WHERE id = ?')
      .bind(renglon.cantidad, entrada.id)
      .run();
    creados += renglon.cantidad;
  }

  // Se reparte acá mismo: cargar un drop y repartirlo son el mismo gesto.
  let repartidos = 0;
  const salteados = new Set<string>();
  const sinRueda = new Set<string>();

  for (const idItem of nuevos) {
    const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(idItem).first<FilaItem>();
    if (!item) continue;

    const r = await asignarConLaRueda(c.env, item);
    if (!r) {
      sinRueda.add(item.cola);
      continue;
    }
    repartidos++;
    for (const nombre of r.salteados) salteados.add(nombre);
  }

  await c.env.DB.prepare('UPDATE eventos SET reparto_en = ? WHERE id = ?')
    .bind(new Date().toISOString(), evento.id)
    .run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  const pendientes = nuevosEnCatalogo.length;

  const partes = [`Cargué ${creados} ${creados === 1 ? 'item' : 'items'} y ${repartidos === creados ? 'los repartí' : `repartí ${repartidos}`} siguiendo la rueda.`];
  if (salteados.size > 0) partes.push(`Perdieron la vuelta: ${[...salteados].join(', ')}.`);
  if (sinRueda.size > 0) {
    partes.push(`Sin repartir los de ${[...sinRueda].join(' y ')}: no hay nadie presente en esa lista.`);
  }
  if (pendientes > 0) partes.push(`${pendientes} sin imagen todavía: ${nuevosEnCatalogo.join(', ')}.`);

  return c.json({ ...estado, aviso: partes.join(' ') });
});

app.post('/api/items', requiereGrandMaster, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const nombre = texto(cuerpo.nombre, 120);
  if (nombre.length < 2) return c.json({ error: 'Poné el nombre del item.' }, 400);

  const evento = await asegurarEvento(c.env.DB, new Date(), await leerHorario(c.env.DB));
  if (!evento) return c.json({ error: 'No hay ningún Kundun abierto.' }, 409);

  const rareza: Rareza = RAREZAS.includes(cuerpo.rareza) ? cuerpo.rareza : 'comun';
  const icono = ICONOS.includes(cuerpo.icono) ? String(cuerpo.icono) : 'caja';
  if (typeof cuerpo.imagen === 'string' && cuerpo.imagen.length > MAX_IMAGEN) {
    return c.json({ error: 'Esa imagen pesa demasiado. Probá con una más chica.' }, 413);
  }

  await c.env.DB.prepare(
    'INSERT INTO items (evento_id, nombre, tipo, rareza, icono, imagen) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(evento.id, nombre, texto(cuerpo.tipo, 60), rareza, icono, imagenValida(cuerpo.imagen))
    .run();

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

app.delete('/api/items/:id', requiereGrandMaster, async (c) => {
  await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(entero(c.req.param('id'))).run();
  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/**
 * Le da el item al que sigue en la rueda y deja el puntero ahí, para que el próximo drop
 * arranque del siguiente. Devuelve el personaje, o null si nadie de esa rueda estuvo.
 */
async function asignarConLaRueda(env: Env, item: FilaItem): Promise<{ quien: string; salteados: string[] } | null> {
  const ganador = await elegirGanador(env.DB, item);
  if (!ganador) return null;

  const metodo =
    `Le tocaba a ${ganador.personaje} en la lista de ${item.nombre}` +
    (ganador.salteados.length > 0 ? ` — se saltearon ${ganador.salteados.join(', ')} por no estar` : '');

  await env.DB.prepare("UPDATE items SET asignado_a = ?, estado = 'reclamado', metodo = ? WHERE id = ?")
    .bind(ganador.id, metodo, item.id)
    .run();
  // Solo avanza la lista de ESTE item: las de los demás quedan donde estaban.
  if (ganador.catalogoId !== null) await guardarTurno(env.DB, ganador.catalogoId, ganador.cola, ganador.id);

  return { quien: ganador.personaje, salteados: ganador.salteados };
}

app.post('/api/items/:id/asignar', requiereGrandMaster, async (c) => {
  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?')
    .bind(entero(c.req.param('id')))
    .first<FilaItem>();
  if (!item) return c.json({ error: 'Ese item ya no está.' }, 404);

  const r = await asignarConLaRueda(c.env, item);
  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({
    ...estado,
    aviso: r
      ? `${item.nombre} va para ${r.quien}.` +
        (r.salteados.length > 0 ? ` Se saltearon ${r.salteados.join(', ')} por no estar.` : '')
      : 'Marcá primero quiénes estuvieron en el Kundun.',
  });
});

/** El admin puede saltarse el orden y asignar a dedo. Queda escrito en "cómo se decidió". */
app.post('/api/items/:id/asignar-a', requiereGrandMaster, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const usuarioId = entero(cuerpo.usuarioId);
  const itemId = entero(c.req.param('id'));

  const destino = await c.env.DB.prepare('SELECT personaje FROM usuarios WHERE id = ? AND activo = 1')
    .bind(usuarioId)
    .first<{ personaje: string }>();
  if (!destino) return c.json({ error: 'Ese miembro no existe.' }, 404);

  await c.env.DB.prepare("UPDATE items SET asignado_a = ?, estado = 'reclamado', metodo = ? WHERE id = ?")
    .bind(usuarioId, 'Asignado a dedo por el admin', itemId)
    .run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({ ...estado, aviso: `Se lo asignaste a ${destino.personaje} a dedo.` });
});

app.post('/api/items/:id/entregar', requiereGrandMaster, async (c) => {
  await c.env.DB.prepare("UPDATE items SET estado = 'entregado' WHERE id = ?")
    .bind(entero(c.req.param('id')))
    .run();
  return c.json(await construirEstado(c.env, c.get('usuario')));
});

app.post('/api/items/:id/reabrir', requiereGrandMaster, async (c) => {
  await c.env.DB.prepare("UPDATE items SET estado = 'abierto', asignado_a = NULL, metodo = '' WHERE id = ?")
    .bind(entero(c.req.param('id')))
    .run();
  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/** Cierra la subasta: reparte todo lo que quedó abierto y le avisa a cada uno qué le toca pujar. */
app.post('/api/eventos/:id/repartir', requiereGrandMaster, async (c) => {
  const eventoId = entero(c.req.param('id'));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM items WHERE evento_id = ? AND estado = 'abierto' ORDER BY id ASC",
  )
    .bind(eventoId)
    .all<FilaItem>();

  // De a uno y en orden: cada asignación mueve el puntero de su rueda, así el siguiente
  // drop de esa misma rueda le toca al que sigue.
  let repartidos = 0;
  const salteados = new Set<string>();
  // Si una lista quedó sin nadie, sus drops no se pueden repartir: hay que avisarlo.
  const sinRueda = new Set<string>();

  for (const item of results) {
    const r = await asignarConLaRueda(c.env, item);
    if (!r) {
      sinRueda.add(item.cola);
      continue;
    }
    repartidos++;
    for (const nombre of r.salteados) salteados.add(nombre);
  }

  await c.env.DB.prepare('UPDATE eventos SET reparto_en = ? WHERE id = ?')
    .bind(new Date().toISOString(), eventoId)
    .run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  const aviso =
    repartidos === 0
      ? 'No hay a quién repartirle: marcá quiénes estuvieron en el Kundun.'
      : `${repartidos} ${repartidos === 1 ? 'drop repartido' : 'drops repartidos'} siguiendo la rueda.` +
        (salteados.size > 0 ? ` Perdieron la vuelta: ${[...salteados].join(', ')}.` : '') +
        (sinRueda.size > 0
          ? ` Quedaron sin repartir los drops de ${[...sinRueda].join(' y ')}: no hay nadie presente en esa lista.`
          : '');
  return c.json({ ...estado, aviso });
});

// ── Horario del Kundun ────────────────────────────────────────────────────────

// ── Avisos del gremio ────────────────────────────────────────────────────────
//
// Un evento con sus días, sus horas, cuánto antes recordarlo y el texto que se manda. Por ahora
// no sale a ningún lado: se configura y se mira en el simulador del panel.

/**
 * Los avisos con la lista de sus imágenes —sin los bytes, que pesan— para que el panel las muestre.
 *
 * Una sola consulta para todos: con un SELECT por aviso, abrir el panel con cinco eventos serían
 * cinco viajes más a la base para traer, casi siempre, nada.
 */
async function conImagenes(db: D1Database, filas: FilaAviso[]) {
  const { results } = await db
    .prepare('SELECT id, aviso_id, etiqueta FROM imagenes_aviso ORDER BY orden, id')
    .all<{ id: number; aviso_id: number; etiqueta: string }>();

  const porAviso = new Map<number, Array<{ id: number; etiqueta: string }>>();
  for (const r of results) {
    const suyas = porAviso.get(r.aviso_id) ?? [];
    suyas.push({ id: r.id, etiqueta: r.etiqueta });
    porAviso.set(r.aviso_id, suyas);
  }

  return filas.map((f) => ({ ...comoAviso(f), imagenes: porAviso.get(f.id) ?? [] }));
}

app.get('/api/avisos', requiereAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM avisos ORDER BY orden ASC, id ASC').all<FilaAviso>();
  const { resumen } = await leerAjustes(c.env.DB);
  return c.json({ avisos: await conImagenes(c.env.DB, results), antesMaximo: ANTES_MAXIMO, resumen });
});

/** El resumen de la mañana: a qué hora sale, si sale, y con qué texto. */
app.patch('/api/avisos/resumen', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const actual = (await leerAjustes(c.env.DB)).resumen;

  const hora = cuerpo.hora === undefined ? actual.hora : leerHora(texto(cuerpo.hora, 20));
  if (hora === null) return c.json({ error: 'No entendí la hora. Escribila así: 10:00' }, 400);

  const activo = typeof cuerpo.activo === 'boolean' ? cuerpo.activo : actual.activo;
  const plantilla = cuerpo.texto === undefined ? actual.texto : texto(cuerpo.texto, 1000) || RESUMEN_POR_DEFECTO;

  await c.env.DB.prepare(
    'UPDATE ajustes SET resumen_hora = ?, resumen_activo = ?, resumen_texto = ?, actualizado_en = ? WHERE id = 1',
  )
    .bind(hora, activo ? 1 : 0, plantilla, new Date().toISOString())
    .run();

  const { results } = await c.env.DB.prepare('SELECT * FROM avisos ORDER BY orden ASC, id ASC').all<FilaAviso>();
  return c.json({
    avisos: await conImagenes(c.env.DB, results),
    resumen: { hora, activo, texto: plantilla },
    aviso: activo ? `El resumen sale todos los días a las ${comoHoraAviso(hora)}.` : 'El resumen quedó apagado.',
  });
});

/** Mandar el resumen de hoy ahora mismo, para verlo en el grupo. */
app.post('/api/avisos/resumen/probar', requiereAdmin, async (c) => {
  const token = c.env.TELEGRAM_TOKEN;
  if (!token) return c.json({ error: 'Falta el token del bot.' }, 400);

  const ajustes = await leerAjustes(c.env.DB);
  if (!ajustes.telegram.chat) return c.json({ error: 'Elegí primero a qué chat mandar.' }, 400);

  const { results } = await c.env.DB.prepare('SELECT * FROM avisos').all<FilaAviso>();
  const texto2 = armarResumen(
    results.map(comoAviso),
    new Date(),
    ajustes.horario.offsetServidor,
    ajustes.resumen.texto,
  );

  try {
    await mandar(token, ajustes.telegram.chat, texto2);
    return c.json({ aviso: `Mandado a ${ajustes.telegram.nombre || ajustes.telegram.chat}.` });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'No se pudo mandar.' }, 502);
  }
});

app.post('/api/avisos', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const nombre = texto(cuerpo.nombre, 60) || 'Evento nuevo';

  const ultimo = await c.env.DB.prepare('SELECT MAX(orden) AS n FROM avisos').first<{ n: number | null }>();
  await c.env.DB.prepare(
    `INSERT INTO avisos (nombre, dias, horas, antes, mensaje, activo, orden)
     VALUES (?, '0,1,2,3,4,5,6', '', '15', ?, 1, ?)`,
  )
    .bind(nombre, mensajePorDefecto(nombre), (ultimo?.n ?? 0) + 1)
    .run();

  const { results } = await c.env.DB.prepare('SELECT * FROM avisos ORDER BY orden ASC, id ASC').all<FilaAviso>();
  return c.json({ avisos: await conImagenes(c.env.DB, results), aviso: `Agregué "${nombre}". Cargale los horarios.` });
});

app.patch('/api/avisos/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const limpio = leerAviso(await c.req.json().catch(() => ({})));
  if (!limpio) return c.json({ error: 'Al evento le falta el nombre.' }, 400);

  const r = await c.env.DB.prepare(
    'UPDATE avisos SET nombre = ?, emoji = ?, titulo = ?, dias = ?, horas = ?, antes = ?, mensaje = ?, al_empezar = ?, mensaje_inicio = ?, activo = ? WHERE id = ?',
  )
    .bind(
      limpio.nombre,
      limpio.emoji,
      limpio.titulo,
      limpio.dias.join(','),
      comoGuardadasHoras(limpio.horas),
      limpio.antes.join(','),
      limpio.mensaje,
      limpio.alEmpezar ? 1 : 0,
      limpio.mensajeInicio,
      limpio.activo ? 1 : 0,
      id,
    )
    .run();
  if ((r.meta.changes ?? 0) === 0) return c.json({ error: 'Ese evento ya no está.' }, 404);

  const { results } = await c.env.DB.prepare('SELECT * FROM avisos ORDER BY orden ASC, id ASC').all<FilaAviso>();
  return c.json({ avisos: await conImagenes(c.env.DB, results) });
});

app.delete('/api/avisos/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  // Primero las imágenes: si se va el aviso y ellas quedan, nadie las vuelve a encontrar.
  await c.env.DB.prepare('DELETE FROM imagenes_aviso WHERE aviso_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM avisos WHERE id = ?').bind(id).run();
  const { results } = await c.env.DB.prepare('SELECT * FROM avisos ORDER BY orden ASC, id ASC').all<FilaAviso>();
  return c.json({ avisos: await conImagenes(c.env.DB, results), aviso: 'Borrado.' });
});

/**
 * Que la IA escriba el aviso.
 *
 * Corre en Workers AI, que va con el mismo Worker. Si el binding no está —la cuenta no lo tiene
 * habilitado, o se corre local sin él— se devuelve un texto armado con plantilla en vez de un
 * error: el panel tiene que servir igual.
 */
app.post('/api/avisos/:id/redactar', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const nombre = texto(cuerpo.nombre, 60) || 'el evento';
  const tono = texto(cuerpo.tono, 200);
  const dias: number[] = Array.isArray(cuerpo.dias) ? cuerpo.dias.map(entero) : [];
  const horas: number[] = Array.isArray(cuerpo.horas) ? cuerpo.horas.map(entero) : [];

  const cuando = [
    dias.length === 7 ? 'todos los días' : dias.length > 0 ? `los ${dias.map((d) => DIAS_LARGOS[d] ?? '').join(', ')}` : '',
    horas.length > 0 ? `a las ${horas.map(comoHoraAviso).join(' y ')}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!c.env.AI) {
    return c.json({
      mensaje: mensajePorDefecto(nombre),
      aviso: 'Workers AI no está habilitado acá: te dejo el texto de plantilla para editar.',
    });
  }

  const instruccion = [
    'Escribí un recordatorio corto para el chat de un gremio del juego Mu Dark Epoch.',
    `El evento se llama "${nombre}"${cuando ? ` y cae ${cuando} (hora del servidor)` : ''}.`,
    'Reglas:',
    '- Español rioplatense, voseo, tono de gremio, nada solemne.',
    '- Dos o tres renglones como mucho. Sin listas ni títulos.',
    '- Arrancá el mensaje con la marca {titulo} sola en el primer renglón: es el nombre del evento en grande.',
    '- Usá exactamente estas marcas donde corresponda, sin inventar otras: {titulo}, {hora}, {falta}, {dia}, {termina}, {dura}.',
    '- {falta} es cuánto falta ("30 minutos"), {hora} la hora de arranque, {dia} el día ("hoy", "mañana").',
    '- Nunca pongas el valor literal al lado de la marca: va "{hora}", no "{hora} 13:00".',
    '- No escribas el nombre del evento en el cuerpo: {titulo} ya lo puso arriba.',
    '- Podés usar un emoji al principio y *negrita de Telegram* con asteriscos simples.',
    '- Devolvé SOLO el texto del mensaje, sin comillas ni explicaciones.',
    tono ? `- Tené en cuenta esto que pidió el admin: ${tono}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const r = (await c.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'Sos el community manager de un gremio. Escribís corto y al grano.' },
        { role: 'user', content: instruccion },
      ],
      max_tokens: 300,
    })) as { response?: string };

    const salida = (r?.response ?? '').trim().replace(/^["'`]+|["'`]+$/g, '');
    if (salida.length < 10) throw new Error('respuesta vacía');
    return c.json({ mensaje: salida.slice(0, 1000) });
  } catch (e) {
    return c.json({
      mensaje: mensajePorDefecto(nombre),
      aviso: `No pude redactarlo con IA (${e instanceof Error ? e.message : 'error'}). Te dejo la plantilla.`,
    });
  }
});

// ── El bot de Telegram ───────────────────────────────────────────────────────
//
// El token es un secreto del Worker y no sale nunca de acá: el panel solo ve si está puesto,
// a qué chat se manda y si está prendido.

app.get('/api/telegram', requiereAdmin, async (c) => {
  const { telegram } = await leerAjustes(c.env.DB);
  const token = c.env.TELEGRAM_TOKEN ?? '';

  let bot: { nombre: string; usuario: string } | null = null;
  let problema = '';
  if (token) {
    try {
      bot = await quienEs(token);
    } catch (e) {
      problema = e instanceof Error ? e.message : 'no pude hablar con Telegram';
    }
  }

  return c.json({ conToken: token.length > 0, bot, problema, ...telegram });
});

/** Los chats donde al bot le hablaron. Es la única forma de saber a dónde puede escribir. */
app.get('/api/telegram/chats', requiereAdmin, async (c) => {
  const token = c.env.TELEGRAM_TOKEN;
  if (!token) return c.json({ error: 'Falta el token del bot.' }, 400);
  try {
    return c.json({ chats: await chatsVistos(token) });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'No pude hablar con Telegram.' }, 502);
  }
});

app.patch('/api/telegram', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const actual = (await leerAjustes(c.env.DB)).telegram;

  const chat = cuerpo.chat === undefined ? actual.chat : texto(cuerpo.chat, 40);
  const nombre = cuerpo.nombre === undefined ? actual.nombre : texto(cuerpo.nombre, 80);
  const activo = typeof cuerpo.activo === 'boolean' ? cuerpo.activo : actual.activo;

  // Prender los avisos sin chat elegido no manda nada y hace creer que sí.
  if (activo && !chat) return c.json({ error: 'Elegí primero a qué chat mandar.' }, 400);

  await c.env.DB.prepare(
    'UPDATE ajustes SET telegram_chat = ?, telegram_nombre = ?, telegram_activo = ?, actualizado_en = ? WHERE id = 1',
  )
    .bind(chat, nombre, activo ? 1 : 0, new Date().toISOString())
    .run();

  return c.json({ chat, nombre, activo, conToken: !!c.env.TELEGRAM_TOKEN });
});

/**
 * Mandar un aviso de ensayo al grupo.
 *
 * Va marcado como prueba y con fecha de vencimiento: se anota para que el cron lo borre solo,
 * porque un ensayo no tiene por qué quedar en el chat del gremio. La espera vive en la base y no
 * en este pedido: un Worker no dura ni un minuto esperando.
 *
 * Anda aunque los avisos estén apagados, que es justamente cuando uno quiere probar.
 */
app.post('/api/telegram/ensayo', requiereAdmin, async (c) => {
  const token = c.env.TELEGRAM_TOKEN;
  if (!token) return c.json({ error: 'Falta el token del bot.' }, 400);

  const ajustes = await leerAjustes(c.env.DB);
  if (!ajustes.telegram.chat) return c.json({ error: 'Elegí primero a qué chat mandar.' }, 400);

  const cuerpo = await c.req.json().catch(() => ({}));
  const cual = texto(cuerpo.cual, 20);
  // 0 vale: es el aviso de cuando arranca.
  const pedido = entero(cuerpo.antes);
  const antes = pedido === 0 ? 0 : Math.min(Math.max(pedido || 15, 1), ANTES_MAXIMO);

  let cuerpoTexto = '';
  let queEs = '';
  // Las fotos del evento que se está ensayando. El resumen no lleva.
  let fotosDelEnsayo: Foto[] = [];

  if (cual === 'resumen') {
    const { results } = await c.env.DB.prepare('SELECT * FROM avisos').all<FilaAviso>();
    cuerpoTexto = armarResumen(results.map(comoAviso), new Date(), ajustes.horario.offsetServidor, ajustes.resumen.texto);
    queEs = 'el resumen de la mañana';
  } else {
    const fila = await c.env.DB.prepare('SELECT * FROM avisos WHERE id = ?')
      .bind(entero(cuerpo.avisoId))
      .first<FilaAviso>();
    if (!fila) return c.json({ error: 'Ese evento ya no está.' }, 404);
    const aviso = comoAviso(fila);
    const cuandoCae = aviso.horas[0] ?? { minutos: 780, dura: 10 };
    // antes = 0 es el aviso de "arrancó", que tiene su propio texto.
    const conAntes = antes === 0 ? 0 : aviso.antes.includes(antes) ? antes : (aviso.antes[0] ?? 15);
    cuerpoTexto = armarMensaje(conAntes === 0 ? aviso.mensajeInicio : aviso.mensaje, {
      evento: aviso.nombre,
      hora: cuandoCae.minutos,
      antes: conAntes,
      emoji: aviso.emoji,
      estilo: aviso.titulo,
      dura: cuandoCae.dura,
    });
    fotosDelEnsayo = await fotosDe(c.env.DB, aviso.id);
    queEs = aviso.nombre;
  }

  // Cuánto se queda en el grupo. Lo elige quien lo manda; si no dice nada, dos minutos.
  const MINUTOS = Math.min(Math.max(entero(cuerpo.minutos) || 2, 1), 10);
  const cuanto = MINUTOS === 1 ? 'un minuto' : `${MINUTOS} minutos`;
  const conAviso = [
    '🧪 *ENSAYO* — no es un aviso de verdad.',
    `_Este mensaje se borra solo en ${cuanto}._`,
    '',
    cuerpoTexto,
  ].join('\n');

  try {
    // Con las mismas fotos que llevaría de verdad: un ensayo que no muestra lo mismo no sirve.
    const ids = await mandarConFotos(token, ajustes.telegram.chat, conAviso, fotosDelEnsayo);
    for (const id of ids) {
      await c.env.DB.prepare('INSERT INTO mensajes_temporales (chat, mensaje_id, borrar_en) VALUES (?, ?, ?)')
        .bind(ajustes.telegram.chat, id, cuandoSeBorra(new Date(Date.now() + MINUTOS * 60_000)).toISOString())
        .run();
    }
    return c.json({
      aviso: `Mandé ${queEs} a ${ajustes.telegram.nombre || ajustes.telegram.chat}. Se borra en ${cuanto}.`,
    });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'No se pudo mandar.' }, 502);
  }
});

/** Mandar un mensaje de prueba, para ver que llega antes de dejarlo solo. */
app.post('/api/telegram/probar', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const token = c.env.TELEGRAM_TOKEN;
  if (!token) return c.json({ error: 'Falta el token del bot.' }, 400);

  const { telegram } = await leerAjustes(c.env.DB);
  if (!telegram.chat) return c.json({ error: 'Elegí primero a qué chat mandar.' }, 400);

  const cuerpoTexto =
    texto(cuerpo.texto, 1000) ||
    '🔔 Prueba desde el panel. Si leés esto, el bot quedó conectado.\n\n_Este mensaje se borra solo en un minuto._';
  try {
    // Una prueba no tiene por qué quedar en el chat del gremio, igual que los ensayos.
    const mensajeId = await mandar(token, telegram.chat, cuerpoTexto);
    if (mensajeId > 0) {
      await c.env.DB.prepare('INSERT INTO mensajes_temporales (chat, mensaje_id, borrar_en) VALUES (?, ?, ?)')
        .bind(telegram.chat, mensajeId, cuandoSeBorra(new Date(Date.now() + 60_000)).toISOString())
        .run();
    }
    return c.json({ aviso: `Mandado a ${telegram.nombre || telegram.chat}. Se borra en un minuto.` });
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : 'No se pudo mandar.' }, 502);
  }
});

/**
 * Qué se ve y quién puede tocar qué. Solo el admin.
 *
 * `interfaz` esconde pedazos de la app; `permisos` decide si el Grand Master puede tocar lo
 * que cambia las reglas del reparto. Lo primero es cosmético, lo segundo se controla también
 * en el servidor: esconder un botón no es un permiso.
 */
app.patch('/api/interfaz', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const actual = await leerAjustes(c.env.DB);

  const interfaz = cuerpo.interfaz === undefined ? actual.interfaz : comoInterfaz(cuerpo.interfaz);
  const permisos = cuerpo.permisos === undefined ? actual.permisos : comoPermisos(cuerpo.permisos);

  // La fila de ajustes ya existe salvo la primera vez, así que se actualiza; el INSERT no
  // sirve acá porque el resto de las columnas son NOT NULL y no las estamos tocando.
  const ahoraIso = new Date().toISOString();
  const guardados = JSON.stringify(interfaz);
  const permitidos = JSON.stringify(permisos);

  const r = await c.env.DB.prepare(
    'UPDATE ajustes SET interfaz = ?, permisos = ?, actualizado_en = ? WHERE id = 1',
  )
    .bind(guardados, permitidos, ahoraIso)
    .run();

  if ((r.meta.changes ?? 0) === 0) {
    const h = actual.horario;
    await c.env.DB.prepare(
      `INSERT INTO ajustes
         (id, horas, offset_servidor, abre_antes_min, pin_antes_min, cierra_despues_min,
          cierra_registro_antes_min, interfaz, permisos, actualizado_en)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        comoGuardadas(h.franjas),
        h.offsetServidor,
        h.abreAntesMin,
        h.pinAntesMin,
        h.franjas[0].duraMin + h.franjas[0].premioMin,
        h.cierraRegistroAntesMin,
        guardados,
        permitidos,
        ahoraIso,
      )
      .run();
  }

  const escondidas = Object.keys(interfaz).length;
  return c.json({
    ...(await construirEstado(c.env, c.get('usuario'))),
    aviso: escondidas === 0 ? 'Se ve todo de nuevo.' : `Guardado: ${escondidas} escondidas.`,
  });
});

/**
 * El servidor del juego cambia los horarios cada tanto. Acá el admin los reacomoda sin
 * tocar código: las horas van en hora del servidor y la app las traduce a la de cada uno.
 */
app.patch('/api/horarios', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const actual = await leerHorario(c.env.DB);

  const enRango = (valor: unknown, porDefecto: number, min: number, max: number) => {
    if (valor === undefined || valor === null || valor === '') return porDefecto;
    const n = entero(valor);
    return Math.min(Math.max(n, min), max);
  };

  /**
   * Una franja: la hora del Kundun, cuánto dura el evento y cuánto quedan sus recompensas.
   * Son dos tramos distintos y el evento de la app tiene que cubrir los dos.
   */
  const comoFranja = (crudo: unknown, deFabrica: Franja): Franja | null => {
    const x = (crudo ?? {}) as { hora?: unknown; duraMin?: unknown; premioMin?: unknown };
    const minutos = x.hora === undefined ? deFabrica.minutos : leerHora(texto(x.hora, 20));
    if (minutos === null) return null;
    return {
      minutos,
      duraMin: enRango(x.duraMin, deFabrica.duraMin, 1, 480),
      premioMin: enRango(x.premioMin, deFabrica.premioMin, 1, 480),
    };
  };

  let franjas = actual.franjas;
  if (Array.isArray(cuerpo.franjas)) {
    if (cuerpo.franjas.length === 0 || cuerpo.franjas.length > 12) {
      return c.json({ error: 'Tiene que haber entre 1 y 12 horarios.' }, 400);
    }
    const leidas: Franja[] = [];
    for (const cruda of cuerpo.franjas) {
      const f = comoFranja(cruda, actual.franjas[0] ?? { minutos: 780, duraMin: 10, premioMin: 30 });
      if (!f) return c.json({ error: 'No entendí una de las horas. Escribilas así: 13:00' }, 400);
      leidas.push(f);
    }
    // Dos Kundun a la misma hora no significan nada.
    const vistas = new Set<number>();
    franjas = leidas.filter((f) => !vistas.has(f.minutos) && vistas.add(f.minutos) !== undefined);
    franjas.sort((a, b) => a.minutos - b.minutos);
  }

  const offsetServidor = enRango(cuerpo.offsetServidor, actual.offsetServidor, -12, 14);
  const abreAntesMin = enRango(cuerpo.abreAntesMin, actual.abreAntesMin, 1, 240);
  // El PIN nunca puede aparecer antes de que abra el registro.
  const pinAntesMin = Math.min(enRango(cuerpo.pinAntesMin, actual.pinAntesMin, 0, 240), abreAntesMin);
  // El asedio de los domingos: sale más tarde que el Kundun y tiene sus propios dos tramos.
  const asedio = comoFranja(cuerpo.asedio, actual.asedio);
  if (!asedio) return c.json({ error: 'No entendí la hora del asedio. Escribila así: 21:30' }, 400);

  const cierraRegistroAntesMin = enRango(cuerpo.cierraRegistroAntesMin, actual.cierraRegistroAntesMin, 0, 480);
  const mostrarCartel =
    typeof cuerpo.mostrarCartel === 'boolean' ? cuerpo.mostrarCartel : actual.mostrarCartel;

  await c.env.DB.prepare(
    `INSERT INTO ajustes
       (id, horas, offset_servidor, abre_antes_min, pin_antes_min, cierra_despues_min,
        cierra_registro_antes_min, asedio_minutos, asedio_dura_min, asedio_premio_min,
        cartel_sin_kundun, actualizado_en)
     VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?8, ?9, ?10, ?11, ?7)
     ON CONFLICT(id) DO UPDATE SET
       horas = ?1, offset_servidor = ?2, abre_antes_min = ?3, pin_antes_min = ?4,
       cierra_despues_min = ?5, cierra_registro_antes_min = ?6,
       asedio_minutos = ?8, asedio_dura_min = ?9, asedio_premio_min = ?10,
       cartel_sin_kundun = ?11, actualizado_en = ?7`,
  )
    .bind(
      comoGuardadas(franjas),
      offsetServidor,
      abreAntesMin,
      pinAntesMin,
      // La columna vieja: la app ya no la lee, pero la fila la sigue teniendo.
      franjas[0].duraMin + franjas[0].premioMin,
      cierraRegistroAntesMin,
      new Date().toISOString(),
      asedio.minutos,
      asedio.duraMin,
      asedio.premioMin,
      mostrarCartel ? 1 : 0,
    )
    .run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({
    ...estado,
    aviso: `Horario guardado: ${enumerar(franjas.map((f) => comoHora(f.minutos)))} hora del servidor.`,
  });
});

// ── Catálogo ──────────────────────────────────────────────────────────────────

app.get('/api/catalogo', requiereGrandMaster, async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM catalogo ORDER BY imagen IS NOT NULL, veces DESC, nombre ASC',
  ).all<FilaCatalogo>();

  // Cada item viene con las listas en las que sale y con a quién le toca en cada una.
  const colasDe = await colasDeCatalogo(c.env.DB);

  // Una clave que además es alias de otro item resuelve siempre al dueño de la clave, y el
  // alias queda muerto. Fue lo que pasó con "plumas": era clave del Cofre y alias de la Pluma.
  const choca = (e: FilaCatalogo) =>
    results.find((otro) => otro.id !== e.id && otro.alias.includes(`|${e.clave}|`))?.nombre ?? null;
  const { results: turnos } = await c.env.DB.prepare('SELECT catalogo_id, cola, usuario_id FROM turnos').all<{
    catalogo_id: number;
    cola: string;
    usuario_id: number | null;
  }>();

  return c.json({
    catalogo: results.map((e) => ({
      ...e,
      choque: choca(e),
      colas: colasDe.get(e.id) ?? [],
      turnos: Object.fromEntries(
        turnos.filter((t) => t.catalogo_id === e.id).map((t) => [t.cola, t.usuario_id]),
      ),
    })),
  });
});

app.patch('/api/catalogo/:id', requiereGrandMaster, async (c) => {
  if (!(await dejaHacer(c, 'catalogo'))) return c.json({ error: 'El catálogo lo edita solo el admin.' }, 403);
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  if (typeof cuerpo.imagen === 'string' && cuerpo.imagen.length > MAX_IMAGEN) {
    return c.json({ error: 'Esa imagen pesa demasiado. Probá con una más chica.' }, 413);
  }

  const entrada = await c.env.DB.prepare('SELECT * FROM catalogo WHERE id = ?').bind(id).first<FilaCatalogo>();
  if (!entrada) return c.json({ error: 'Ese item no está en el catálogo.' }, 404);

  const nombre = typeof cuerpo.nombre === 'string' ? comoTitulo(texto(cuerpo.nombre, 120)) : entrada.nombre;

  /**
   * La clave es lo que se escribe al cargar el drop. Se puede corregir porque un item
   * renombrado se queda con la clave vieja, y ahí empieza a resolver cualquier cosa.
   */
  let clave = entrada.clave;
  if (typeof cuerpo.clave === 'string') {
    const pedida = normalizar(texto(cuerpo.clave, 120));
    if (!pedida) return c.json({ error: 'La clave no puede quedar vacía.' }, 400);

    if (pedida !== entrada.clave) {
      const duena = await c.env.DB.prepare(
        'SELECT nombre FROM catalogo WHERE id <> ?1 AND (clave = ?2 OR instr(alias, ?3) > 0) LIMIT 1',
      )
        .bind(id, pedida, `|${pedida}|`)
        .first<{ nombre: string }>();

      if (duena) {
        return c.json({ error: `"${pedida}" ya lo usa ${duena.nombre}. Poné otra.` }, 409);
      }
      clave = pedida;
    }
  }
  const rareza: Rareza = RAREZAS.includes(cuerpo.rareza) ? cuerpo.rareza : entrada.rareza;
  const icono = ICONOS.includes(cuerpo.icono) ? String(cuerpo.icono) : entrada.icono;
  const imagen = cuerpo.imagen === null ? null : (imagenValida(cuerpo.imagen) ?? entrada.imagen);

  // Los alias van entre barras ("|kanturu|kt|") para poder buscarlos con instr().
  let alias = entrada.alias;
  let choques: string[] = [];

  if (typeof cuerpo.alias === 'string') {
    const pedidos = texto(cuerpo.alias, 300)
      .split(',')
      .map((a) => normalizar(a))
      .filter(Boolean);

    // Una palabra pertenece a un solo item: ni la clave ni un alias de otro. Si no, dos
    // palabras distintas terminan cargando el mismo item sin que nada avise.
    const { results: ajenas } = await c.env.DB.prepare('SELECT clave, alias FROM catalogo WHERE id <> ?')
      .bind(id)
      .all<{ clave: string; alias: string }>();

    const tomadas = new Set<string>();
    for (const otra of ajenas) {
      tomadas.add(otra.clave);
      for (const a of otra.alias.split('|').filter(Boolean)) tomadas.add(a);
    }

    choques = pedidos.filter((a) => tomadas.has(a));
    alias = pedidos
      .filter((a) => !tomadas.has(a) && a !== clave)
      .map((a) => `|${a}|`)
      .join('');
  }

  await c.env.DB.prepare(
    'UPDATE catalogo SET clave = ?, nombre = ?, rareza = ?, icono = ?, imagen = ?, alias = ? WHERE id = ?',
  )
    .bind(clave, nombre, rareza, icono, imagen, alias, id)
    .run();

  // En qué listas sale este item. La CQC cae en el Kundun y en el asedio; el Cofre, solo
  // en el asedio. Cada lista lleva su propia rueda, así que sacar una borra su turno.
  let sinListas = false;
  if (Array.isArray(cuerpo.colas)) {
    const pedidas = COLAS.filter((k) => cuerpo.colas.includes(k));
    if (pedidas.length === 0) {
      sinListas = true;
    } else {
      await c.env.DB.batch([
        c.env.DB.prepare(`DELETE FROM catalogo_colas WHERE catalogo_id = ?1 AND cola NOT IN (${pedidas.map((_, n) => '?' + (n + 2)).join(', ')})`).bind(id, ...pedidas),
        c.env.DB.prepare(`DELETE FROM turnos WHERE catalogo_id = ?1 AND cola NOT IN (${pedidas.map((_, n) => '?' + (n + 2)).join(', ')})`).bind(id, ...pedidas),
        ...pedidas.map((k) =>
          c.env.DB.prepare('INSERT INTO catalogo_colas (catalogo_id, cola) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(id, k),
        ),
      ]);
    }
  }

  // Los items de este Kundun que salieron de esta entrada se actualizan también,
  // así la imagen aparece al toque sin tener que recargarlos.
  const evento = await eventoActivo(c.env.DB);
  if (evento) {
    await c.env.DB.prepare('UPDATE items SET nombre = ?, rareza = ?, icono = ?, imagen = ? WHERE catalogo_id = ? AND evento_id = ?')
      .bind(nombre, rareza, icono, imagen, id, evento.id)
      .run();
  }

  const avisos: string[] = [];
  if (choques.length > 0) {
    avisos.push(
      `No guardé ${choques.join(', ')}: ` +
        (choques.length === 1 ? 'ya es la forma de escribir otro item.' : 'ya son la forma de escribir otros items.'),
    );
  }
  if (sinListas) avisos.push('Dejé las listas como estaban: un item tiene que salir en alguna.');

  return c.json({ ok: true, ...(avisos.length > 0 ? { aviso: avisos.join(' ') } : {}) });
});

app.delete('/api/catalogo/:id', requiereAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM catalogo WHERE id = ?').bind(entero(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ── Clases de personaje ───────────────────────────────────────────────────────

/**
 * Crear una clase. El código es lo que queda guardado en cada personaje ("BK"); el nombre es
 * lo que se lee ("Royal Knight"). La imagen es obligatoria salvo que el código sea uno de los
 * que ya traen su archivo en public/clases/.
 */
app.post('/api/clases', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));

  const codigo = normalizarCodigo(texto(cuerpo.codigo, 8));
  if (!codigo) return c.json({ error: 'El código va en letras y números, hasta 8 caracteres.' }, 400);

  const nombre = texto(cuerpo.nombre, 60);
  if (nombre.length < 2) return c.json({ error: 'Poné el nombre de la clase.' }, 400);

  const ya = await c.env.DB.prepare('SELECT 1 FROM clases WHERE codigo = ?').bind(codigo).first();
  if (ya) return c.json({ error: `Ya existe una clase con el código ${codigo}.` }, 409);

  if (typeof cuerpo.imagen === 'string' && cuerpo.imagen.length > MAX_IMAGEN) {
    return c.json({ error: 'Esa imagen pesa demasiado. Probá con una más chica.' }, 413);
  }
  const imagen = imagenValida(cuerpo.imagen);
  if (!imagen && !DE_FABRICA.includes(codigo)) {
    return c.json({ error: 'Subí el retrato de la clase.' }, 400);
  }

  const ultimo = await c.env.DB.prepare('SELECT MAX(orden) AS n FROM clases').first<{ n: number | null }>();
  await c.env.DB.prepare('INSERT INTO clases (codigo, nombre, imagen, orden) VALUES (?, ?, ?, ?)')
    .bind(codigo, nombre, imagen, (ultimo?.n ?? 0) + 1)
    .run();

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/** Cambiarle el nombre o el retrato. `imagen: null` la devuelve a su archivo estático. */
app.patch('/api/clases/:codigo', requiereAdmin, async (c) => {
  const codigo = normalizarCodigo(c.req.param('codigo'));
  const cuerpo = await c.req.json().catch(() => ({}));

  const clase = codigo
    ? await c.env.DB.prepare('SELECT * FROM clases WHERE codigo = ?').bind(codigo).first<{
        codigo: string;
        nombre: string;
        imagen: string | null;
      }>()
    : null;
  if (!clase) return c.json({ error: 'Esa clase no existe.' }, 404);

  if (typeof cuerpo.imagen === 'string' && cuerpo.imagen.length > MAX_IMAGEN) {
    return c.json({ error: 'Esa imagen pesa demasiado. Probá con una más chica.' }, 413);
  }

  const nombre = typeof cuerpo.nombre === 'string' ? texto(cuerpo.nombre, 60) || clase.nombre : clase.nombre;
  // Quitarle la imagen a una clase de fábrica la devuelve a su PNG; a una propia la deja sin nada.
  const imagen = cuerpo.imagen === null ? null : (imagenValida(cuerpo.imagen) ?? clase.imagen);

  if (imagen === null && !DE_FABRICA.includes(clase.codigo)) {
    return c.json({ error: 'Esta clase necesita un retrato: no trae uno de fábrica.' }, 400);
  }

  await c.env.DB.prepare('UPDATE clases SET nombre = ?, imagen = ? WHERE codigo = ?')
    .bind(nombre, imagen, clase.codigo)
    .run();

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/** Borrarla. Los personajes que la tenían quedan sin clase, no se rompe nada. */
app.delete('/api/clases/:codigo', requiereAdmin, async (c) => {
  const codigo = normalizarCodigo(c.req.param('codigo'));
  if (!codigo) return c.json({ error: 'Esa clase no existe.' }, 404);

  const usando = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE clase = ?')
    .bind(codigo)
    .first<{ n: number }>();

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE usuarios SET clase = '' WHERE clase = ?").bind(codigo),
    c.env.DB.prepare('DELETE FROM clases WHERE codigo = ?').bind(codigo),
  ]);

  const estado = await construirEstado(c.env, c.get('usuario'));
  const cuantos = usando?.n ?? 0;
  return c.json({
    ...estado,
    ...(cuantos > 0
      ? { aviso: `${cuantos} ${cuantos === 1 ? 'personaje quedó' : 'personajes quedaron'} sin clase.` }
      : {}),
  });
});

// ── Miembros y orden de prioridad ─────────────────────────────────────────────

const ROLES = ['admin', 'grandmaster', 'jugador'];

app.get('/api/miembros', requiereAdmin, async (c) => {
  const orden = await ordenDePrioridad(c.env.DB);
  const inactivos = await c.env.DB.prepare('SELECT * FROM usuarios WHERE activo = 0 ORDER BY personaje').all<FilaUsuario>();

  const limpiar = (u: FilaUsuario) => ({
    id: u.id,
    usuario: u.usuario,
    personaje: u.personaje,
    email: u.email,
    rol: u.rol,
    pc: u.pc,
    activo: u.activo === 1,
    clase: u.clase,
    tieneGoogle: !!u.google_sub,
    tienePassword: u.password_hash.length > 0,
  });
  return c.json({ miembros: orden.map(limpiar), inactivos: inactivos.results.map(limpiar) });
});

app.post('/api/miembros', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const email = texto(cuerpo.email, 120).toLowerCase() || null;
  const personaje = texto(cuerpo.personaje, 60);
  // El usuario para entrar sale del nombre del personaje: "El Brujo" → "elbrujo".
  const usuario = (texto(cuerpo.usuario, 60) || normalizar(personaje).replace(/ /g, '')).toLowerCase();
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';

  if (personaje.length < 2) return c.json({ error: 'Poné el nombre del personaje.' }, 400);
  if (usuario.length < 3) return c.json({ error: 'Ese nombre de personaje es muy corto para armar un usuario.' }, 400);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Ese mail no parece válido.' }, 400);
  // La contraseña es opcional: los jugadores entran tocando su Main. Solo hace falta
  // para las cuentas que manejan la app.
  if (password.length > 0 && password.length < 6) {
    return c.json({ error: 'La contraseña necesita al menos 6 caracteres.' }, 400);
  }

  const chocado = await c.env.DB.prepare('SELECT 1 FROM usuarios WHERE lower(usuario) = ? OR lower(email) = ?')
    .bind(usuario, email ?? '')
    .first();
  if (chocado) return c.json({ error: 'Ya hay alguien con ese usuario o ese mail.' }, 409);

  const ultimo = await c.env.DB.prepare('SELECT MAX(orden) AS n FROM usuarios').first<{ n: number | null }>();

  const pedida = typeof cuerpo.clase === 'string' ? normalizarCodigo(cuerpo.clase) : null;
  const claseDelAlta =
    pedida && (await c.env.DB.prepare('SELECT 1 FROM clases WHERE codigo = ?').bind(pedida).first()) ? pedida : '';

  await c.env.DB.prepare(
    `INSERT INTO usuarios (usuario, personaje, email, password_hash, rol, pc, orden, clase, debe_cambiar_clave)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      usuario,
      personaje,
      email,
      password.length >= 6 ? await hashearPassword(password) : '',
      ROLES.includes(cuerpo.rol) ? cuerpo.rol : 'jugador',
      Math.max(0, entero(cuerpo.pc)),
      (ultimo?.n ?? 0) + 1,
      claseDelAlta,
      // Con contraseña puesta por el admin, la va a tener que cambiar la primera vez que entre.
      password.length >= 6 ? 1 : 0,
    )
    .run();

  return c.json({ ok: true });
});

app.patch('/api/miembros/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  if (typeof cuerpo.pc === 'number') {
    await c.env.DB.prepare('UPDATE usuarios SET pc = ? WHERE id = ?').bind(Math.max(0, entero(cuerpo.pc)), id).run();
  }
  if (typeof cuerpo.personaje === 'string') {
    await c.env.DB.prepare('UPDATE usuarios SET personaje = ? WHERE id = ?').bind(texto(cuerpo.personaje, 60), id).run();
  }
  if (typeof cuerpo.clase === 'string') {
    // Un código que no está en la tabla deja al personaje sin clase, no rompe nada.
    const pedida = normalizarCodigo(cuerpo.clase);
    const existe = pedida && (await c.env.DB.prepare('SELECT 1 FROM clases WHERE codigo = ?').bind(pedida).first());
    await c.env.DB.prepare('UPDATE usuarios SET clase = ? WHERE id = ?').bind(existe ? pedida : '', id).run();
  }
  if (typeof cuerpo.email === 'string' || cuerpo.email === null) {
    const email = cuerpo.email === null ? null : texto(cuerpo.email, 120).toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ error: 'Ese mail no parece válido.' }, 400);
    // Si le cambian el mail, se desvincula la cuenta de Google anterior.
    await c.env.DB.prepare('UPDATE usuarios SET email = ?, google_sub = NULL WHERE id = ?').bind(email, id).run();
  }
  if (ROLES.includes(cuerpo.rol)) {
    if (id === c.get('usuario')!.id && cuerpo.rol !== 'admin') {
      return c.json({ error: 'No te podés sacar el rol de admin a vos mismo.' }, 400);
    }
    // Quien maneja la app entra con contraseña, no tocando su nombre. Sin credenciales
    // el ascenso la dejaría afuera de las dos puertas.
    if (manejaLaApp(cuerpo.rol)) {
      const quien = await c.env.DB.prepare('SELECT password_hash, google_sub, personaje FROM usuarios WHERE id = ?')
        .bind(id)
        .first<{ password_hash: string; google_sub: string | null; personaje: string }>();
      if (quien && quien.password_hash.length === 0 && !quien.google_sub) {
        return c.json(
          { error: `Ponele una contraseña a ${quien.personaje} antes de darle ese rol, si no no puede entrar.` },
          400,
        );
      }
    }
    await c.env.DB.prepare('UPDATE usuarios SET rol = ? WHERE id = ?').bind(cuerpo.rol, id).run();
  }
  if (typeof cuerpo.activo === 'boolean') {
    await c.env.DB.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').bind(cuerpo.activo ? 1 : 0, id).run();
  }
  // Los top daño cobran en el Castle Siege: quedan fuera de la rueda de items.
  if (typeof cuerpo.recibeItems === 'boolean') {
    await c.env.DB.prepare('UPDATE usuarios SET recibe_items = ? WHERE id = ?')
      .bind(cuerpo.recibeItems ? 1 : 0, id)
      .run();
  }
  if (typeof cuerpo.password === 'string' && cuerpo.password.length >= 6) {
    // Una clave que el admin le pone a otro es prestada: la tiene que cambiar al entrar. Si se
    // la cambia a sí mismo no hace falta, porque la eligió él.
    await c.env.DB.prepare('UPDATE usuarios SET password_hash = ?, debe_cambiar_clave = ? WHERE id = ?')
      .bind(await hashearPassword(cuerpo.password), id === c.get('usuario')!.id ? 0 : 1, id)
      .run();
  }

  return c.json({ ok: true });
});

/**
 * Por defecto es baja lógica, para no perder el historial de items asignados.
 * Con ?definitivo=1 se borra la fila: los items que tenía quedan sin dueño.
 */
app.delete('/api/miembros/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  if (id === c.get('usuario')!.id) return c.json({ error: 'No te podés borrar a vos mismo.' }, 400);

  if (c.req.query('definitivo') === '1') {
    await c.env.DB.prepare('DELETE FROM usuarios WHERE id = ?').bind(id).run();
  } else {
    await c.env.DB.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').bind(id).run();
  }
  return c.json({ ok: true });
});

app.post('/api/orden', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const ids = Array.isArray(cuerpo.ids) ? cuerpo.ids.map(entero).filter((n: number) => n > 0) : [];
  if (ids.length === 0) return c.json({ error: 'Falta el orden.' }, 400);
  await guardarOrden(c.env.DB, ids);
  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/** Poner o sacar a alguien de una lista. Las tres se arman por separado. */
app.post('/api/participantes/:cola', requiereAdmin, async (c) => {
  const cola = c.req.param('cola');
  if (!COLAS.includes(cola as Cola)) return c.json({ error: 'Esa lista no existe.' }, 400);

  const cuerpo = await c.req.json().catch(() => ({}));
  const usuarioId = entero(cuerpo.usuarioId);
  if (usuarioId <= 0) return c.json({ error: 'Falta el personaje.' }, 400);

  if (cuerpo.participa === false) {
    await c.env.DB.prepare('DELETE FROM participantes WHERE cola = ? AND usuario_id = ?')
      .bind(cola, usuarioId)
      .run();
  } else {
    await c.env.DB.prepare('INSERT INTO participantes (cola, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING')
      .bind(cola, usuarioId)
      .run();
  }

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/** Poner o sacar a todo el gremio de una lista de una sola vez. */
app.post('/api/participantes/:cola/todos', requiereAdmin, async (c) => {
  const cola = c.req.param('cola');
  if (!COLAS.includes(cola as Cola)) return c.json({ error: 'Esa lista no existe.' }, 400);

  const cuerpo = await c.req.json().catch(() => ({}));
  if (cuerpo.participa === false) {
    await c.env.DB.prepare('DELETE FROM participantes WHERE cola = ?').bind(cola).run();
  } else {
    const { results } = await c.env.DB.prepare('SELECT id FROM usuarios WHERE activo = 1').all<{ id: number }>();
    if (results.length > 0) {
      await c.env.DB.batch(
        results.map((u) =>
          c.env.DB.prepare('INSERT INTO participantes (cola, usuario_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(
            cola,
            u.id,
          ),
        ),
      );
    }
  }

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

/**
 * Mover a mano el turno de un item: deja como "último que cobró" al que se le pase,
 * así el próximo le toca al que sigue. Sirve para corregir un reparto.
 */
// ── Empezar de cero ──────────────────────────────────────────────────────────
//
// Borra los Kundun y todo lo que cuelga de ellos. No se puede deshacer, así que hay que pedirlo
// dos veces: primero se mira cuánto hay y después se manda la palabra exacta.

/** Cuánto hay para borrar, para que el panel lo diga antes de preguntar. */
app.get('/api/historial/resumen', requiereAdmin, async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM eventos)     AS eventos,
            (SELECT COUNT(*) FROM items)       AS items,
            (SELECT COUNT(*) FROM asistencias) AS asistencias,
            (SELECT COUNT(*) FROM turnos)      AS turnos`,
  ).first<{ eventos: number; items: number; asistencias: number; turnos: number }>();
  return c.json(r ?? { eventos: 0, items: 0, asistencias: 0, turnos: 0 });
});

/**
 * Borrar el historial y volver a empezar.
 *
 * Se van los Kundun, sus drops y sus asistencias. NO se tocan los personajes, el catálogo, las
 * listas de participantes, las clases ni los horarios: eso es la configuración del gremio, no
 * el historial. Las ruedas se reinician solo si se pide, porque reflejan lo que ya se repartió
 * de verdad en el juego y no siempre uno quiere perder esa cuenta.
 */
app.post('/api/historial/borrar', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  if (texto(cuerpo.confirmar, 20) !== 'BORRAR') {
    return c.json({ error: 'Para borrar el historial hay que escribir BORRAR.' }, 400);
  }
  const conRuedas = cuerpo.ruedas === true;

  const antes = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM eventos').first<{ n: number }>();

  const escrituras = [
    c.env.DB.prepare('DELETE FROM pedidos'),
    c.env.DB.prepare('DELETE FROM items'),
    c.env.DB.prepare('DELETE FROM asistencias'),
    c.env.DB.prepare('DELETE FROM eventos'),
  ];
  if (conRuedas) {
    escrituras.push(c.env.DB.prepare('DELETE FROM turnos'), c.env.DB.prepare('DELETE FROM turnos_respaldo'));
  }
  // Para que el próximo Kundun sea el #1 y no siga la numeración de los borrados.
  escrituras.push(
    c.env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('eventos','items','asistencias','pedidos')"),
  );

  await c.env.DB.batch(escrituras);

  const cuantos = antes?.n ?? 0;
  return c.json({
    ...(await construirEstado(c.env, c.get('usuario'))),
    aviso:
      `Borré ${cuantos} ${cuantos === 1 ? 'Kundun' : 'Kundun'} del historial. El próximo va a ser el #1.` +
      (conRuedas ? ' Las ruedas volvieron al principio.' : ' Las ruedas quedaron donde estaban.'),
  });
});

/**
 * Repartir los turnos de arranque entre todos.
 *
 * Sin nada guardado, todas las ruedas arrancan por el primero del orden de prioridad: el primer
 * Kundun con varios drops se lo lleva entero una sola persona. Esto agarra las ruedas, las
 * mezcla y las va dejando paradas en gente distinta, dando toda la vuelta antes de repetir.
 *
 * No cambia el orden de prioridad ni quién participa en qué lista: solo dónde está parada cada
 * rueda ahora mismo. De ahí en más siguen girando como siempre.
 */
app.post('/api/turnos/sortear', requiereAdmin, async (c) => {
  const orden = await ordenDePrioridad(c.env.DB);
  const quienes = await participantesDe(c.env.DB);
  const colasDe = await colasDeCatalogo(c.env.DB);

  const { results: catalogo } = await c.env.DB.prepare('SELECT id, nombre FROM catalogo ORDER BY id').all<{
    id: number;
    nombre: string;
  }>();

  const escrituras: D1PreparedStatement[] = [];
  const reparto: Array<{ item: string; cola: string; leToca: string }> = [];

  for (const cola of COLAS) {
    const enRueda = enLaRueda(orden, cola, quienes);
    if (enRueda.length === 0) continue;

    // Las ruedas de esta lista, mezcladas: si no, el primer item del catálogo siempre le
    // tocaría a la misma persona y el sorteo sería sorteo solo de nombre.
    const ruedas = catalogo.filter((e) => (colasDe.get(e.id) ?? []).includes(cola));
    for (let i = ruedas.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ruedas[i], ruedas[j]] = [ruedas[j], ruedas[i]];
    }

    // Se arranca en un punto al azar de la vuelta y se va corriendo de a uno: así cada persona
    // recibe la misma cantidad de ruedas, sin que el azar amontone tres en la misma.
    const salto = Math.floor(Math.random() * enRueda.length);

    ruedas.forEach((entrada, i) => {
      const leToca = enRueda[(salto + i) % enRueda.length];
      // El turno guarda al ÚLTIMO que cobró, así que para que le toque a alguien hay que dejar
      // el puntero en el que va justo antes.
      const anterior = enRueda[(enRueda.indexOf(leToca) - 1 + enRueda.length) % enRueda.length];
      escrituras.push(
        c.env.DB.prepare(
          `INSERT INTO turnos (catalogo_id, cola, usuario_id, actualizado_en)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(catalogo_id, cola) DO UPDATE SET usuario_id = excluded.usuario_id, actualizado_en = excluded.actualizado_en`,
        ).bind(entrada.id, cola, anterior.id, new Date().toISOString()),
      );
      reparto.push({ item: entrada.nombre, cola, leToca: leToca.personaje });
    });
  }

  if (escrituras.length === 0) {
    return c.json({ error: 'No hay ninguna rueda con gente adentro para sortear.' }, 400);
  }
  await c.env.DB.batch(escrituras);

  // Cuántas ruedas le quedaron a cada uno, que es lo que interesa mirar después del sorteo.
  const cuenta = new Map<string, number>();
  for (const r of reparto) cuenta.set(r.leToca, (cuenta.get(r.leToca) ?? 0) + 1);
  const resumen = [...cuenta.entries()].map(([quien, n]) => `${quien}: ${n}`).join(' · ');

  return c.json({
    ...(await construirEstado(c.env, c.get('usuario'))),
    aviso: `Sorteé ${escrituras.length} ruedas. Le toca a — ${resumen}.`,
  });
});

app.post('/api/turnos/:catalogoId', requiereGrandMaster, async (c) => {
  if (!(await dejaHacer(c, 'turnos'))) return c.json({ error: 'El turno de las ruedas lo mueve solo el admin.' }, 403);
  const catalogoId = entero(c.req.param('catalogoId'));
  const cuerpo = await c.req.json().catch(() => ({}));
  const usuarioId = entero(cuerpo.usuarioId);
  if (!COLAS.includes(cuerpo.cola)) return c.json({ error: 'Falta decir de qué lista es el turno.' }, 400);
  const cola: Cola = cuerpo.cola;

  const entrada = await c.env.DB.prepare('SELECT id FROM catalogo WHERE id = ?').bind(catalogoId).first();
  if (!entrada) return c.json({ error: 'Ese item no está en el catálogo.' }, 404);

  if (usuarioId <= 0) {
    // Sin nadie: la vuelta de ese item vuelve a arrancar desde el primero de la lista.
    await c.env.DB.prepare('DELETE FROM turnos WHERE catalogo_id = ? AND cola = ?').bind(catalogoId, cola).run();
  } else {
    await guardarTurno(c.env.DB, catalogoId, cola, usuarioId);
  }

  return c.json(await construirEstado(c.env, c.get('usuario')));
});

app.post('/api/orden/por-pc', requiereAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id FROM usuarios WHERE activo = 1 ORDER BY pc DESC, id ASC').all<{
    id: number;
  }>();
  await guardarOrden(
    c.env.DB,
    results.map((u) => u.id),
  );
  return c.json(await construirEstado(c.env, c.get('usuario')));
});

// ── Los pedidos de ingreso ───────────────────────────────────────────────────
//
// Quien entra con Google y no está cargado en el gremio deja un pedido. Acá el admin lo resuelve.
// Solo el admin: quién entra a la app no es una decisión que se delegue, ni al Grand Master.

app.get('/api/ingresos', requiereAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM pedidos_ingreso ORDER BY estado = 'rechazado', pedido_en DESC",
  ).all<FilaPedido>();
  return c.json({ pedidos: results.map(comoPedido) });
});

/**
 * Aceptar a alguien: se convierte en miembro y el pedido desaparece.
 *
 * El alta queda con el personaje y el rol que eligió el admin, y con el mail y el google_sub ya
 * pegados, así la próxima vez que toque "Entrar con Google" pasa derecho. No lleva contraseña ni
 * la marca de cambiarla: entra por Google, y una contraseña que nadie va a usar es solo una cosa
 * más que se puede filtrar. Si después quiere una, el admin se la pone desde Miembros.
 *
 * Lo que no se pide acá es la clase, el PC ni las listas de drops: eso se edita en Miembros como
 * con cualquier otro, y hacer que el admin lo complete de apuro en este momento solo consigue que
 * lo complete mal.
 */
app.post('/api/ingresos/:id/aprobar', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  const pedido = await c.env.DB.prepare('SELECT * FROM pedidos_ingreso WHERE id = ?')
    .bind(id)
    .first<FilaPedido>();
  if (!pedido) return c.json({ error: 'Ese pedido ya no está.' }, 404);

  const personaje = texto(cuerpo.personaje, 40) || pedido.nombre.trim() || pedido.email.split('@')[0];
  if (personaje.length < 2) return c.json({ error: 'Ponele un nombre de personaje.' }, 400);

  const yaEsta = await c.env.DB.prepare('SELECT 1 FROM usuarios WHERE lower(email) = ?')
    .bind(pedido.email)
    .first();
  if (yaEsta) {
    await c.env.DB.prepare('DELETE FROM pedidos_ingreso WHERE id = ?').bind(id).run();
    return c.json({ error: 'Ese mail ya está cargado en un miembro. Borré el pedido.' }, 409);
  }

  const rol = ROLES.includes(cuerpo.rol) ? (cuerpo.rol as string) : 'jugador';
  if (rol === 'admin') return c.json({ error: 'El rol de admin se da desde Miembros, no acá.' }, 400);

  const usuario = await usuarioLibre(c.env.DB, texto(cuerpo.usuario, 40) || pedido.email);
  const ultimo = await c.env.DB.prepare('SELECT max(orden) AS n FROM usuarios').first<{ n: number | null }>();

  await c.env.DB.prepare(
    `INSERT INTO usuarios (usuario, personaje, email, google_sub, avatar, password_hash, rol, orden)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
  )
    .bind(usuario, personaje, pedido.email, pedido.google_sub, pedido.avatar, rol, (ultimo?.n ?? 0) + 1)
    .run();

  await c.env.DB.prepare('DELETE FROM pedidos_ingreso WHERE id = ?').bind(id).run();

  const { results } = await c.env.DB.prepare(
    "SELECT * FROM pedidos_ingreso ORDER BY estado = 'rechazado', pedido_en DESC",
  ).all<FilaPedido>();
  return c.json({
    pedidos: results.map(comoPedido),
    aviso: `${personaje} ya puede entrar. Cargale la clase y el PC en Miembros.`,
  });
});

/** Decir que no. Queda anotado para que el próximo intento no vuelva a avisar. */
app.post('/api/ingresos/:id/rechazar', requiereAdmin, async (c) => {
  await c.env.DB.prepare("UPDATE pedidos_ingreso SET estado = 'rechazado' WHERE id = ?")
    .bind(entero(c.req.param('id')))
    .run();
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM pedidos_ingreso ORDER BY estado = 'rechazado', pedido_en DESC",
  ).all<FilaPedido>();
  return c.json({ pedidos: results.map(comoPedido), aviso: 'Rechazado.' });
});

/**
 * Borrar el pedido del todo.
 *
 * Es la forma de darle otra oportunidad a alguien rechazado: sin la fila, el próximo intento vuelve
 * a pedir de cero.
 */
app.delete('/api/ingresos/:id', requiereAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM pedidos_ingreso WHERE id = ?').bind(entero(c.req.param('id'))).run();
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM pedidos_ingreso ORDER BY estado = 'rechazado', pedido_en DESC",
  ).all<FilaPedido>();
  return c.json({ pedidos: results.map(comoPedido), aviso: 'Borrado. Si vuelve a intentar, pide de nuevo.' });
});

// ── Las imágenes de un aviso ─────────────────────────────────────────────────
//
// Van aparte de la configuración del aviso porque pesan: se leen cuando hay que mostrarlas o
// mandarlas, y nunca en el camino del cron.

/** Lo máximo que puede pesar una imagen ya en base64. El panel la achica antes de subirla. */
const IMAGEN_AVISO_MAXIMA = 900_000;

/** Las imágenes de un aviso, sin los bytes: lo que el panel necesita para listarlas. */
async function imagenesDe(db: D1Database, avisoId: number) {
  const { results } = await db
    .prepare('SELECT id, etiqueta, length(datos) AS peso FROM imagenes_aviso WHERE aviso_id = ? ORDER BY orden, id')
    .bind(avisoId)
    .all<{ id: number; etiqueta: string; peso: number }>();
  return results;
}

/**
 * Los bytes de una imagen, para que el panel la muestre con un <img>.
 *
 * Pide sesión de admin como todo lo demás. El navegador manda la cookie solo con que la etiqueta
 * apunte acá, así que no hace falta nada raro del lado del cliente.
 */
app.get('/api/avisos/imagen/:id', requiereAdmin, async (c) => {
  const fila = await c.env.DB.prepare('SELECT datos FROM imagenes_aviso WHERE id = ?')
    .bind(entero(c.req.param('id')))
    .first<{ datos: string }>();
  if (!fila) return c.json({ error: 'Esa imagen ya no está.' }, 404);

  const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(fila.datos);
  if (!m) return c.json({ error: 'Esa imagen quedó ilegible.' }, 500);

  const crudo = atob(m[2]);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);

  return new Response(bytes, {
    headers: { 'content-type': m[1], 'cache-control': 'private, max-age=300' },
  });
});

app.post('/api/avisos/:id/imagenes', requiereAdmin, async (c) => {
  const avisoId = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));

  const datos = typeof cuerpo.datos === 'string' ? cuerpo.datos.trim() : '';
  if (!/^data:image\/[a-z0-9+.-]+;base64,/i.test(datos)) {
    return c.json({ error: 'Eso no es una imagen.' }, 400);
  }
  if (datos.length > IMAGEN_AVISO_MAXIMA) {
    return c.json({ error: 'La imagen pesa demasiado, incluso después de achicarla.' }, 413);
  }

  const cuantas = await c.env.DB.prepare('SELECT count(*) AS n FROM imagenes_aviso WHERE aviso_id = ?')
    .bind(avisoId)
    .first<{ n: number }>();
  if ((cuantas?.n ?? 0) >= FOTOS_MAXIMAS) {
    return c.json({ error: `Telegram no manda más de ${FOTOS_MAXIMAS} fotos juntas.` }, 409);
  }

  const ultimo = await c.env.DB.prepare('SELECT max(orden) AS n FROM imagenes_aviso WHERE aviso_id = ?')
    .bind(avisoId)
    .first<{ n: number | null }>();

  await c.env.DB.prepare('INSERT INTO imagenes_aviso (aviso_id, orden, etiqueta, datos) VALUES (?, ?, ?, ?)')
    .bind(avisoId, (ultimo?.n ?? 0) + 1, texto(cuerpo.etiqueta, 80), datos)
    .run();

  return c.json({ imagenes: await imagenesDe(c.env.DB, avisoId) });
});

app.patch('/api/avisos/imagenes/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const cuerpo = await c.req.json().catch(() => ({}));
  const fila = await c.env.DB.prepare('SELECT aviso_id FROM imagenes_aviso WHERE id = ?')
    .bind(id)
    .first<{ aviso_id: number }>();
  if (!fila) return c.json({ error: 'Esa imagen ya no está.' }, 404);

  await c.env.DB.prepare('UPDATE imagenes_aviso SET etiqueta = ? WHERE id = ?')
    .bind(texto(cuerpo.etiqueta, 80), id)
    .run();
  return c.json({ imagenes: await imagenesDe(c.env.DB, fila.aviso_id) });
});

app.delete('/api/avisos/imagenes/:id', requiereAdmin, async (c) => {
  const id = entero(c.req.param('id'));
  const fila = await c.env.DB.prepare('SELECT aviso_id FROM imagenes_aviso WHERE id = ?')
    .bind(id)
    .first<{ aviso_id: number }>();
  if (!fila) return c.json({ imagenes: [] });

  await c.env.DB.prepare('DELETE FROM imagenes_aviso WHERE id = ?').bind(id).run();
  return c.json({ imagenes: await imagenesDe(c.env.DB, fila.aviso_id) });
});

app.all('/api/*', (c) => c.json({ error: 'No existe esa ruta.' }, 404));

/**
 * Cada minuto, Cloudflare despierta al Worker.
 *
 * Sirve para dos cosas que si no dependerían de que alguien tenga la página abierta: cerrar
 * el Kundun cuando le llega la hora y abrir el siguiente cuando entra en su ventana.
 */
const programado = async (env: Env) => {
  const ahora = new Date();
  const cerrados = await cerrarVencidos(env.DB, ahora);
  const evento = await asegurarEvento(env.DB, ahora, await leerHorario(env.DB));
  const mandados = await mandarAvisos(env, ahora);
  const conResumen = await mandarResumen(env, ahora);
  const borrados = await borrarVencidos(env, ahora);
  console.log(
    'cron:',
    cerrados,
    'cerrados |',
    evento ? `Kundun #${evento.numero} en curso` : 'sin evento',
    '|',
    mandados,
    'avisos',
    conResumen ? '| resumen' : '',
    borrados > 0 ? `| ${borrados} borrados` : '',
  );
};

/**
 * Cuánto se mira hacia adelante, y cuánto se puede esperar despierto.
 *
 * Cloudflare no despierta al Worker en el segundo cero: medido sobre los avisos que ya salieron,
 * llega entre 48 y 89 segundos tarde. Los de menos de un minuto caían en la hora justa de casualidad
 * y los de más se publicaban un minuto después — un "arrancó" a las 13:01 de algo que empezó a las
 * 13:00.
 *
 * Así que en vez de mandar lo que ya venció, se mira un minuto y medio hacia adelante y se espera
 * despierto hasta el momento exacto. Esperar sale gratis: el límite de un cron es de CPU, y dormir
 * no gasta CPU.
 */
const ESPERA_MAXIMA = 90_000;

/**
 * Lo más que un mensaje del bot se queda en el grupo.
 *
 * Una hora, sin excepciones. El chat del gremio es para hablar, no un tablón de anuncios: un
 * recordatorio de algo que ya pasó, o la agenda de un día que ya terminó, es ruido que hay que
 * saltear para leer lo que importa.
 *
 * Lo que tenga un plazo más corto conserva el suyo —un ensayo se va al minuto, un aviso de evento
 * cuando el evento termina— y esto solo recorta lo que se pasaría de largo.
 */
const VIDA_MAXIMA = 60 * 60_000;

/**
 * Cuándo se borra un mensaje: lo que pidió quien lo manda, recortado a la vida máxima.
 *
 * Todos los mensajes que el bot manda pasan por acá. Es a propósito: con cada lugar calculando su
 * propia fecha, tarde o temprano uno queda sin plazo y se instala en el grupo para siempre, que es
 * justo lo que pasó con el resumen de la mañana.
 */
const cuandoSeBorra = (pedido: Date): Date =>
  new Date(Math.min(pedido.getTime(), Date.now() + VIDA_MAXIMA));

/**
 * Con qué nombre se agrupan los resúmenes de la mañana.
 *
 * Es uno solo para todos los días, a propósito: así el de hoy reemplaza al de ayer y en el grupo
 * queda siempre el que sirve, en vez de una lista de agendas viejas.
 */
const OCURRENCIA_RESUMEN = 'resumen';

const esperarHasta = async (cuando: Date): Promise<void> => {
  const faltan = cuando.getTime() - Date.now();
  if (faltan <= 0) return;
  await new Promise((listo) => setTimeout(listo, Math.min(faltan, ESPERA_MAXIMA)));
};

/**
 * Sacar del grupo los avisos anteriores de este mismo evento.
 *
 * Se llama después de mandar el nuevo, así que lo único que queda es el último. Si Telegram no
 * deja borrar alguno —lo borraron a mano, o pasaron las 48 horas que da la API— la fila se saca
 * igual: dejarla sería reintentar para siempre algo que ya no está.
 */
async function borrarLosAnteriores(
  env: Env,
  token: string,
  ocurrencia: string,
  losNuevos: number[],
): Promise<void> {
  // Un aviso con varias fotos es un álbum, y un álbum son varios mensajes. Por eso lo que se
  // preserva es una lista y no un id: si se excluyera solo el primero, el mismo álbum que se
  // acaba de mandar se borraría a sí mismo salvo por esa foto.
  const { results } = await env.DB.prepare(
    'SELECT chat, mensaje_id FROM mensajes_temporales WHERE ocurrencia = ?',
  )
    .bind(ocurrencia)
    .all<{ chat: string; mensaje_id: number }>();

  for (const m of results) {
    if (losNuevos.includes(m.mensaje_id)) continue;
    await borrar(token, m.chat, m.mensaje_id);
    await env.DB.prepare('DELETE FROM mensajes_temporales WHERE chat = ? AND mensaje_id = ?')
      .bind(m.chat, m.mensaje_id)
      .run();
  }
}

/** Las imágenes de un aviso, listas para mandar. */
async function fotosDe(db: D1Database, avisoId: number): Promise<Foto[]> {
  const { results } = await db
    .prepare('SELECT datos, etiqueta FROM imagenes_aviso WHERE aviso_id = ? ORDER BY orden, id')
    .bind(avisoId)
    .all<{ datos: string; etiqueta: string }>();
  return results.map((r) => ({ datos: r.datos, etiqueta: r.etiqueta }));
}

/**
 * Anotar los mensajes que acaba de mandar un aviso, para que se borren a su hora.
 *
 * Son varios cuando el aviso lleva álbum. Todos comparten la misma ocurrencia, así que el próximo
 * aviso del mismo evento se los lleva puestos juntos.
 */
async function anotarParaBorrar(
  env: Env,
  chat: string,
  ids: number[],
  borrarEn: Date,
  ocurrencia: string,
): Promise<void> {
  for (const id of ids) {
    await env.DB.prepare(
      'INSERT INTO mensajes_temporales (chat, mensaje_id, borrar_en, ocurrencia) VALUES (?, ?, ?, ?)',
    )
      .bind(chat, id, borrarEn.toISOString(), ocurrencia)
      .run();
  }
}

/** Los ensayos que ya cumplieron su tiempo en el grupo. */
async function borrarVencidos(env: Env, ahora: Date): Promise<number> {
  const token = env.TELEGRAM_TOKEN;
  if (!token) return 0;

  const { results } = await env.DB.prepare(
    'SELECT chat, mensaje_id FROM mensajes_temporales WHERE borrar_en <= ? LIMIT 20',
  )
    .bind(ahora.toISOString())
    .all<{ chat: string; mensaje_id: number }>();

  for (const m of results) {
    await borrar(token, m.chat, m.mensaje_id);
    await env.DB.prepare('DELETE FROM mensajes_temporales WHERE chat = ? AND mensaje_id = ?')
      .bind(m.chat, m.mensaje_id)
      .run();
  }
  return results.length;
}

/**
 * El resumen de la mañana, una vez por día.
 *
 * La marca en `avisos_enviados` va con el id 0, que no es de ningún evento, y el día como clave:
 * así sale una sola vez aunque el cron pase mil veces por esa hora.
 */
async function mandarResumen(env: Env, ahora: Date): Promise<boolean> {
  const token = env.TELEGRAM_TOKEN;
  if (!token) return false;

  const ajustes = await leerAjustes(env.DB);
  if (!ajustes.resumen.activo || !ajustes.telegram.activo || !ajustes.telegram.chat) return false;

  // En qué minuto del día del servidor estamos.
  const local = new Date(ahora.getTime() + ajustes.horario.offsetServidor * 3_600_000);
  const minutoDelDia = local.getUTCHours() * 60 + local.getUTCMinutes();

  // La ventana arranca un poco antes de la hora para poder esperar hasta el minuto exacto, y se
  // estira un par de minutos para atrás por si el cron llegó tarde de verdad.
  const faltanMin = ajustes.resumen.hora - minutoDelDia;
  if (faltanMin > ESPERA_MAXIMA / 60_000 || faltanMin < -2) return false;

  if (faltanMin > 0) {
    const aLaHora = new Date(ahora.getTime() + faltanMin * 60_000);
    aLaHora.setUTCSeconds(0, 0);
    await esperarHasta(aLaHora);
  }

  const clave = `resumen-${local.toISOString().slice(0, 10)}`;
  const puesto = await env.DB.prepare(
    'INSERT INTO avisos_enviados (aviso_id, clave) VALUES (0, ?) ON CONFLICT DO NOTHING',
  )
    .bind(clave)
    .run();
  if ((puesto.meta.changes ?? 0) === 0) return false;

  const { results } = await env.DB.prepare('SELECT * FROM avisos').all<FilaAviso>();
  try {
    const mensajeId = await mandar(
      token,
      ajustes.telegram.chat,
      armarResumen(results.map(comoAviso), ahora, ajustes.horario.offsetServidor, ajustes.resumen.texto),
    );

    // El de hoy reemplaza al de ayer, pero sin esperar a mañana: como todo lo demás, se va a la
    // hora. Para eso está — se lee a la mañana y después estorba.
    if (mensajeId > 0) {
      await anotarParaBorrar(
        env,
        ajustes.telegram.chat,
        [mensajeId],
        cuandoSeBorra(new Date(Date.now() + 25 * 3_600_000)),
        OCURRENCIA_RESUMEN,
      );
      await borrarLosAnteriores(env, token, OCURRENCIA_RESUMEN, [mensajeId]);
    }
    return true;
  } catch (e) {
    await env.DB.prepare('DELETE FROM avisos_enviados WHERE aviso_id = 0 AND clave = ?').bind(clave).run();
    console.error('resumen sin mandar:', e);
    return false;
  }
}

/**
 * Los avisos que les toca salir en este minuto.
 *
 * Se mira una ventana de dos minutos hacia atrás y no el minuto exacto, porque el cron puede
 * llegar unos segundos tarde y perderse el disparo. Lo que evita que el grupo reciba el mismo
 * aviso dos veces no es la ventana sino `avisos_enviados`: la clave es (aviso, momento exacto),
 * y si el INSERT no escribió nada es porque ya había salido.
 */
async function mandarAvisos(env: Env, ahora: Date): Promise<number> {
  const token = env.TELEGRAM_TOKEN;
  if (!token) return 0;

  const ajustes = await leerAjustes(env.DB);
  if (!ajustes.telegram.activo || !ajustes.telegram.chat) return 0;

  const { results } = await env.DB.prepare('SELECT * FROM avisos WHERE activo = 1').all<FilaAviso>();
  if (results.length === 0) return 0;

  const desde = new Date(ahora.getTime() - 2 * 60_000);
  const hasta = new Date(ahora.getTime() + ESPERA_MAXIMA);

  // Todos juntos y en orden de salida: si dos caen casi a la vez, esperar por el primero no
  // tiene que retrasar al segundo más de lo que ya se retrasó solo.
  const salidas: Array<{ aviso: Aviso; d: Disparo }> = [];
  for (const fila of results) {
    const aviso = comoAviso(fila);
    for (const d of disparosEntre(aviso, desde, hasta, ajustes.horario.offsetServidor)) {
      salidas.push({ aviso, d });
    }
  }
  salidas.sort((a, b) => a.d.cuando.getTime() - b.d.cuando.getTime());

  let mandados = 0;

  for (const { aviso, d } of salidas) {
    // La parte fina: esperar hasta el segundo exacto antes de mandar.
    await esperarHasta(d.cuando);

    // Recién ahora se marca. Antes sería peor: si el Worker se muere durante la espera,
    // quedaría marcado un aviso que nunca salió. Y como el INSERT es atómico, si dos
    // despertadas se solapan esperando lo mismo, manda una sola.
    const clave = d.cuando.toISOString().slice(0, 16);
    const puesto = await env.DB.prepare(
      'INSERT INTO avisos_enviados (aviso_id, clave) VALUES (?, ?) ON CONFLICT DO NOTHING',
    )
      .bind(aviso.id, clave)
      .run();
    if ((puesto.meta.changes ?? 0) === 0) continue;

    try {
      const ids = await mandarConFotos(
        token,
        ajustes.telegram.chat,
        d.texto,
        await fotosDe(env.DB, aviso.id),
      );
      mandados++;

      // El aviso vive lo que vive el evento: después es basura en el chat, así que se anota
      // para que el mismo cron que borra los ensayos lo levante cuando termine. Y mientras
      // tanto reemplaza al anterior del mismo evento, así en el grupo hay uno solo y no una
      // pila de recordatorios diciendo lo mismo con distinto número.
      //
      // El orden importa: primero sale el nuevo —que suena, para eso está— y recién después se
      // borra el viejo. Al revés quedaría un hueco sin ningún aviso a la vista.
      if (ids.length > 0) {
        const laVez = laVezQueAnuncia(aviso.id, d.empieza);
        await anotarParaBorrar(env, ajustes.telegram.chat, ids, cuandoSeBorra(d.termina), laVez);
        await borrarLosAnteriores(env, token, laVez, ids);
      }
    } catch (e) {
      // Si no salió, se borra la marca para que el próximo minuto lo reintente.
      await env.DB.prepare('DELETE FROM avisos_enviados WHERE aviso_id = ? AND clave = ?')
        .bind(aviso.id, clave)
        .run();
      console.error('aviso sin mandar:', aviso.nombre, e);
    }
  }

  // La tabla de enviados no tiene por qué crecer para siempre: con una semana alcanza.
  await env.DB.prepare("DELETE FROM avisos_enviados WHERE enviado_en < datetime('now', '-7 days')").run();

  return mandados;
}

app.onError((err, c) => {
  console.error('Error del worker:', err);
  return c.json({ error: 'Algo se rompió del lado del servidor.' }, 500);
});

// Todo lo que no es /api lo sirve el bundle del front (index.html para las rutas de la SPA).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  scheduled: (_corrida: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(programado(env));
  },
} satisfies ExportedHandler<Env>;
