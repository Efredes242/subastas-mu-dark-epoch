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
export async function mandar(token: string, chat: string, texto: string): Promise<void> {
  const base = { chat_id: chat, text: texto, disable_web_page_preview: true };
  try {
    await pedir(token, 'sendMessage', { ...base, parse_mode: 'Markdown' });
  } catch (e) {
    if (!/pars|entit|markdown/i.test(e instanceof Error ? e.message : '')) throw e;
    await pedir(token, 'sendMessage', base);
  }
}
