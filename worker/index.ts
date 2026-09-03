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
  leerHorario,
  ordenDePrioridad,
  type Cola,
} from './consultas';
import { empezarLoginGoogle, googleConfigurado, terminarLoginGoogle } from './google';
import { comoHora, leerHoras } from './horarios';
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

  const r = await terminarLoginGoogle(c);
  if (!r.ok) {
    const detalle = r.email ? `&mail=${encodeURIComponent(r.email)}` : '';
    return c.redirect(`/?error=${r.motivo}${detalle}`, 302);
  }

  await crearSesion(c, r.usuario.id);
  return c.redirect('/', 302);
});

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
  const minutos = Math.min(Math.max(entero(cuerpo.minutos) || horario.cierraDespuesMin, 1), 240);
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

  // La prueba viene con la asistencia ya confirmada: marca a todo el gremio.
  await c.env.DB.prepare('UPDATE eventos SET asistencia_lista = 1 WHERE id = ?').bind(evento.id).run();

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

app.post('/api/items/lote', requiereGrandMaster, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const renglones = parsearLote(texto(cuerpo.texto, 4000));
  if (renglones.length === 0) return c.json({ error: 'No encontré ningún item en ese texto.' }, 400);

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

  for (const renglon of renglones) {
    const entrada = await asegurarEnCatalogo(c.env.DB, renglon);
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

/**
 * El servidor del juego cambia los horarios cada tanto. Acá el admin los reacomoda sin
 * tocar código: las horas van en hora del servidor y la app las traduce a la de cada uno.
 */
app.patch('/api/horarios', requiereAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const actual = await leerHorario(c.env.DB);

  const minutos = cuerpo.horas === undefined ? actual.minutos : leerHoras(texto(cuerpo.horas, 200));
  if (minutos === null) {
    return c.json({ error: 'No entendí las horas. Escribilas así: 13:00, 21:00' }, 400);
  }

  const enRango = (valor: unknown, porDefecto: number, min: number, max: number) => {
    if (valor === undefined || valor === null || valor === '') return porDefecto;
    const n = entero(valor);
    return Math.min(Math.max(n, min), max);
  };

  const offsetServidor = enRango(cuerpo.offsetServidor, actual.offsetServidor, -12, 14);
  const abreAntesMin = enRango(cuerpo.abreAntesMin, actual.abreAntesMin, 1, 240);
  // El PIN nunca puede aparecer antes de que abra el registro.
  const pinAntesMin = Math.min(enRango(cuerpo.pinAntesMin, actual.pinAntesMin, 0, 240), abreAntesMin);
  const cierraDespuesMin = enRango(cuerpo.cierraDespuesMin, actual.cierraDespuesMin, 1, 480);
  // Cortar el registro después del cierre no significa nada: como mucho, en el cierre.
  const cierraRegistroAntesMin = Math.min(
    enRango(cuerpo.cierraRegistroAntesMin, actual.cierraRegistroAntesMin, 0, 480),
    cierraDespuesMin,
  );

  await c.env.DB.prepare(
    `INSERT INTO ajustes
       (id, horas, offset_servidor, abre_antes_min, pin_antes_min, cierra_despues_min, cierra_registro_antes_min, actualizado_en)
     VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(id) DO UPDATE SET
       horas = ?1, offset_servidor = ?2, abre_antes_min = ?3, pin_antes_min = ?4,
       cierra_despues_min = ?5, cierra_registro_antes_min = ?6, actualizado_en = ?7`,
  )
    .bind(
      minutos.join(','),
      offsetServidor,
      abreAntesMin,
      pinAntesMin,
      cierraDespuesMin,
      cierraRegistroAntesMin,
      new Date().toISOString(),
    )
    .run();

  const estado = await construirEstado(c.env, c.get('usuario'));
  return c.json({
    ...estado,
    aviso: `Horario guardado: ${enumerar(minutos.map(comoHora))} hora del servidor.`,
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

const ROLES = ['admin', 'grandmaster', 'invitado'];

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
    'INSERT INTO usuarios (usuario, personaje, email, password_hash, rol, pc, orden, clase) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      usuario,
      personaje,
      email,
      password.length >= 6 ? await hashearPassword(password) : '',
      ROLES.includes(cuerpo.rol) ? cuerpo.rol : 'invitado',
      Math.max(0, entero(cuerpo.pc)),
      (ultimo?.n ?? 0) + 1,
      claseDelAlta,
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
    await c.env.DB.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
      .bind(await hashearPassword(cuerpo.password), id)
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
app.post('/api/turnos/:catalogoId', requiereGrandMaster, async (c) => {
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
  console.log('cron:', cerrados, 'cerrados |', evento ? `Kundun #${evento.numero} en curso` : 'sin evento');
};

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
