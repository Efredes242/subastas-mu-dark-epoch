/**
 * El bot que manda los avisos al grupo del gremio.
 *
 * El token vive como secreto del Worker (`wrangler secret put TELEGRAM_TOKEN`), nunca en la base
 * ni en el repo: con el token cualquiera publica en el grupo haciéndose pasar por el bot. Lo que
 * sí se guarda en la base es a qué chat mandar, que no es secreto y el admin elige desde el panel.
 */

const API = 'https://api.telegram.org/bot';

export interface ChatVisto {
  id: string;
  nombre: string;
  tipo: string;
}

const pedir = async (token: string, metodo: string, cuerpo?: unknown) => {
  const r = await fetch(`${API}${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!j.ok) throw new Error(j.description ?? `Telegram devolvió ${r.status}`);
  return j.result;
};

/** Quién es el bot. Sirve para confirmar que el token anda antes de guardar nada. */
export async function quienEs(token: string): Promise<{ nombre: string; usuario: string }> {
  const r = (await pedir(token, 'getMe')) as { first_name?: string; username?: string };
  return { nombre: r.first_name ?? 'bot', usuario: r.username ?? '' };
}

/**
 * Los chats donde al bot le hablaron últimamente.
 *
 * Telegram no tiene forma de listar los grupos de un bot: la única es mirar lo que le llegó.
 * Por eso el panel pide mandar un mensaje cualquiera en el grupo antes de buscar.
 */
export async function chatsVistos(token: string): Promise<ChatVisto[]> {
  const r = (await pedir(token, 'getUpdates', { limit: 100, allowed_updates: [] })) as Array<
    Record<string, { chat?: { id?: number; title?: string; username?: string; first_name?: string; type?: string } }>
  >;

  const vistos = new Map<string, ChatVisto>();
  for (const u of r ?? []) {
    for (const clave of ['message', 'channel_post', 'edited_message', 'my_chat_member']) {
      const chat = u[clave]?.chat;
      if (!chat?.id) continue;
      const id = String(chat.id);
      if (vistos.has(id)) continue;
      vistos.set(id, {
        id,
        nombre: chat.title ?? chat.username ?? chat.first_name ?? id,
        tipo: chat.type ?? '',
      });
    }
  }
  return [...vistos.values()];
}

/**
 * Manda un mensaje.
 *
 * Va con el Markdown viejo de Telegram, que es el que usa el simulador del panel: *negrita*,
 * _cursiva_ y `código`. Si el texto tiene un asterisco suelto Telegram rechaza el mensaje entero,
 * así que en ese caso se reintenta sin formato: mejor que llegue en crudo a que no llegue.
 */
export async function mandar(token: string, chat: string, texto: string): Promise<number> {
  const base = { chat_id: chat, text: texto, disable_web_page_preview: true };
  let r: { message_id?: number };
  try {
    r = (await pedir(token, 'sendMessage', { ...base, parse_mode: 'Markdown' })) as { message_id?: number };
  } catch (e) {
    if (!/pars|entit|markdown/i.test(e instanceof Error ? e.message : '')) throw e;
    r = (await pedir(token, 'sendMessage', base)) as { message_id?: number };
  }
  return r?.message_id ?? 0;
}

/** El epígrafe de una foto no puede pasar de esto. Un mensaje suelto llega a 4096. */
export const EPIGRAFE_MAXIMO = 1024;

/** Cuántas fotos entran en un álbum de Telegram. */
export const FOTOS_MAXIMAS = 10;

/** Una imagen lista para mandar. */
export interface Foto {
  /** La imagen tal como la guardó el panel: `data:image/jpeg;base64,...`. */
  datos: string;
  /** Qué se ve, por ejemplo "Lorencia 132,124". Aparece al abrir la foto. */
  etiqueta: string;
}

/**
 * Pasar una data URL a bytes.
 *
 * Se manda el archivo y no la URL a propósito. Telegram, cuando le pasás una dirección, se la
 * descarga él y es exigente con el formato —el webp de la biblioteca de íconos lo rechaza seguido—;
 * mandando los bytes, lo que ve es exactamente lo que subió el admin.
 */
function comoArchivo(dataUrl: string): { blob: Blob; nombre: string } | null {
  const m = /^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  try {
    const crudo = atob(m[2]);
    const bytes = new Uint8Array(crudo.length);
    for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
    const extension = (m[1].split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    return { blob: new Blob([bytes], { type: m[1] }), nombre: `foto.${extension}` };
  } catch {
    return null;
  }
}

/** Lo mismo que `pedir`, pero subiendo archivos. */
const pedirConArchivos = async (token: string, metodo: string, form: FormData) => {
  const r = await fetch(`${API}${token}/${metodo}`, { method: 'POST', body: form });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string };
  if (!j.ok) throw new Error(j.description ?? `Telegram devolvió ${r.status}`);
  return j.result;
};

const esDeFormato = (e: unknown) => /pars|entit|markdown/i.test(e instanceof Error ? e.message : '');

/**
 * Manda el aviso, con las fotos que tenga.
 *
 * Sin fotos es un mensaje de texto como siempre. Con una, la foto lleva el texto de epígrafe. Con
 * varias va un álbum, que en Telegram se ve como una grilla y cuenta como varios mensajes — por eso
 * devuelve una lista de ids y no uno solo: para borrarlo después hay que borrarlos todos.
 *
 * Si una imagen no se puede leer se saltea en vez de tumbar el aviso entero. Y si Telegram rechaza
 * las fotos por lo que sea, el aviso sale igual como texto: que llegue sin foto es mucho mejor que
 * que no llegue.
 */
export async function mandarConFotos(
  token: string,
  chat: string,
  texto: string,
  fotos: Foto[],
): Promise<number[]> {
  const listas = fotos
    .slice(0, FOTOS_MAXIMAS)
    .map((f) => ({ archivo: comoArchivo(f.datos), etiqueta: f.etiqueta }))
    .filter((f): f is { archivo: { blob: Blob; nombre: string }; etiqueta: string } => !!f.archivo);

  if (listas.length === 0) return [await mandar(token, chat, texto)];

  const epigrafe = texto.slice(0, EPIGRAFE_MAXIMO);

  try {
    if (listas.length === 1) {
      const uno = listas[0];
      const armar = (conFormato: boolean) => {
        const form = new FormData();
        form.append('chat_id', chat);
        form.append('caption', epigrafe);
        if (conFormato) form.append('parse_mode', 'Markdown');
        form.append('photo', uno.archivo.blob, uno.archivo.nombre);
        return form;
      };
      let r: { message_id?: number };
      try {
        r = (await pedirConArchivos(token, 'sendPhoto', armar(true))) as { message_id?: number };
      } catch (e) {
        if (!esDeFormato(e)) throw e;
        r = (await pedirConArchivos(token, 'sendPhoto', armar(false))) as { message_id?: number };
      }
      return r?.message_id ? [r.message_id] : [];
    }

    // El álbum: el texto va en la primera, y la etiqueta de cada una se ve al abrirla.
    const armar = (conFormato: boolean) => {
      const form = new FormData();
      form.append('chat_id', chat);
      const media = listas.map((f, i) => {
        const propio = [i === 0 ? epigrafe : '', f.etiqueta].filter(Boolean).join('\n\n');
        return {
          type: 'photo',
          media: `attach://f${i}`,
          ...(propio ? { caption: propio.slice(0, EPIGRAFE_MAXIMO) } : {}),
          ...(propio && conFormato ? { parse_mode: 'Markdown' } : {}),
        };
      });
      form.append('media', JSON.stringify(media));
      listas.forEach((f, i) => form.append(`f${i}`, f.archivo.blob, f.archivo.nombre));
      return form;
    };

    let r: Array<{ message_id?: number }>;
    try {
      r = (await pedirConArchivos(token, 'sendMediaGroup', armar(true))) as Array<{ message_id?: number }>;
    } catch (e) {
      if (!esDeFormato(e)) throw e;
      r = (await pedirConArchivos(token, 'sendMediaGroup', armar(false))) as Array<{ message_id?: number }>;
    }
    return (r ?? []).map((m) => m?.message_id ?? 0).filter((id) => id > 0);
  } catch (e) {
    console.error('telegram/fotos, va sin ellas:', e instanceof Error ? e.message : e);
    return [await mandar(token, chat, texto)];
  }
}

/**
 * Borrar un mensaje que mandó el bot.
 *
 * Telegram solo deja borrar lo propio y dentro de las 48 horas. Si ya no está —alguien lo borró
 * a mano, o pasó el plazo— devuelve un error que no vale la pena propagar: el mensaje no está,
 * que es lo que se quería.
 */
export async function borrar(token: string, chat: string, mensajeId: number): Promise<void> {
  try {
    await pedir(token, 'deleteMessage', { chat_id: chat, message_id: mensajeId });
  } catch {
    /* ya no está, y está bien */
  }
}
