export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  /** Opcionales: sin ellos el botón de "Entrar con Google" no aparece. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/**
 * admin       — Alckron, y nadie más: gremio, roles, orden de prioridad, abrir y cerrar el Kundun.
 * grandmaster — sube los drops y arranca el reparto. Nada más.
 * invitado    — se anota al Kundun y pide items.
 */
export type Rol = 'admin' | 'grandmaster' | 'invitado';
export type Rareza = 'comun' | 'excelente' | 'ancient' | 'divino';
/** abierto = nadie lo tiene · reclamado = le toca pujarlo · entregado = ya lo ganó */
export type EstadoItem = 'abierto' | 'reclamado' | 'entregado';

/** Quién puede subir drops y repartir. */
export const puedeCargar = (rol: Rol) => rol === 'admin' || rol === 'grandmaster';
/** Los roles que manejan la app entran con contraseña, no tocando su nombre. */
export const manejaLaApp = (rol: Rol) => rol !== 'invitado';

export interface FilaUsuario {
  id: number;
  usuario: string;
  personaje: string;
  password_hash: string;
  rol: Rol;
  pc: number;
  orden: number;
  activo: number;
  creado_en: string;
  email: string | null;
  google_sub: string | null;
  avatar: string | null;
  zona: string | null;
  recibe_items: number;
}

export interface FilaEvento {
  id: number;
  numero: number;
  sala: string;
  pin: string;
  registro_abierto: number;
  cierra_en: string | null;
  pin_desde: string | null;
  cerrado: number;
  creado_en: string;
  clave: string | null;
  empieza_en: string | null;
  abre_en: string | null;
  reparto_en: string | null;
  es_prueba: number;
  intentos: number;
  registro_hasta: string | null;
  puntero_items_previo: number | null;
  puntero_almas_previo: number | null;
  puntero_asedio_previo: number | null;
}

export interface FilaItem {
  id: number;
  evento_id: number;
  nombre: string;
  tipo: string;
  rareza: Rareza;
  icono: string;
  imagen: string | null;
  estado: EstadoItem;
  asignado_a: number | null;
  metodo: string;
  creado_en: string;
  catalogo_id: number | null;
  copia: number;
  copias: number;
  cola: string;
}

export interface FilaCatalogo {
  id: number;
  clave: string;
  nombre: string;
  alias: string;
  rareza: Rareza;
  icono: string;
  imagen: string | null;
  veces: number;
  creado_en: string;
}

export interface ItemPublico {
  id: number;
  nombre: string;
  /** "Condor Flame" cuando salieron 2 se muestra como "Condor Flame (1 de 2)". */
  etiqueta: string;
  tipo: string;
  rareza: Rareza;
  icono: string;
  imagen: string | null;
  estado: EstadoItem;
  metodo: string;
  copia: number;
  copias: number;
  cola: string;
  catalogoId: number | null;
  duenoId: number | null;
  dueno: string | null;
  duenoPosicion: number | null;
  piden: number;
  loPedi: boolean;
}

/** Lo que el front recibe de /api/estado. Una sola llamada trae todo lo que la UI pinta. */
export interface Estado {
  yo: {
    id: number;
    usuario: string;
    personaje: string;
    rol: Rol;
    pc: number;
    email: string | null;
    avatar: string | null;
    zona: string | null;
  } | null;
  /** El botón de Google solo se muestra si el Worker tiene las credenciales cargadas. */
  googleActivo: boolean;
  /** Horarios fijos del Kundun, para que el front los muestre en la hora de cada uno. */
  agenda: {
    horasServidor: string[];
    offsetServidorHoras: number;
    abreAntesMin: number;
    pinAntesMin: number;
    cierraDespuesMin: number;
    cierraRegistroAntesMin: number;
    /** Los domingos se mezclan los drops del Kundun con los del asedio. */
    esDomingo: boolean;
    proximo: { abre: string; pinDesde: string; empieza: string; registroHasta: string; cierra: string };
  };
  evento: {
    id: number;
    numero: number;
    sala: string;
    registroAbierto: boolean;
    cerrado: boolean;
    cierraEn: string | null;
    /** Hasta cuándo se puede uno anotar. Después de esto el botón se apaga. */
    registroHasta: string | null;
    /** Si en este momento se puede uno anotar: el registro está abierto y todavía en hora. */
    registroVigente: boolean;
    empiezaEn: string | null;
    abreEn: string | null;
    /** Cuando aparece el codigo. Antes de esa hora no se puede anotar nadie. */
    pinDesde: string | null;
    pinDisponible: boolean;
    repartoEn: string | null;
    creadoEn: string;
    /** Un Kundun de prueba no cuenta para el historial ni mueve las ruedas de verdad. */
    esPrueba: boolean;
    /** Solo para quien puede cargar: el PIN que hay que cantar por el chat. */
    pin?: string;
  } | null;
  anotado: boolean;
  /** Lo que a mí me toca pujar en este Kundun. Vacío hasta que se haga el reparto. */
  meTocaPujar: ItemPublico[];
  orden: Array<{
    id: number;
    personaje: string;
    pc: number;
    posicion: number;
    vino: boolean;
    /** En qué listas participa: items | almas | asedio. */
    listas: string[];
  }>;
  items: ItemPublico[];
  /**
   * A quién le toca cada item del catálogo. Una fila por item: es lo que el gremio
   * consulta todos los días. La vuelta viene girada desde el que le toca.
   */
  turnos: Array<{
    catalogoId: number;
    nombre: string;
    icono: string;
    imagen: string | null;
    rareza: Rareza;
    /** Quién participa en la lista de este item: items | almas | asedio. */
    cola: string;
    /** Cuántos de este item salieron en el Kundun de ahora. */
    salieron: number;
    vuelta: Array<{ id: number; personaje: string; vino: boolean; seLlevo: number }>;
  }>;
  /** El reparto del Kundun anterior, para que todos vean quién se llevó qué. */
  anterior: {
    id: number;
    numero: number;
    fecha: string;
    participantes: number;
    items: Array<{
      id: number;
      etiqueta: string;
      rareza: Rareza;
      icono: string;
      imagen: string | null;
      dueno: string | null;
      estado: EstadoItem;
    }>;
  } | null;
  historial: Array<{
    id: number;
    numero: number;
    fecha: string;
    participantes: number;
    items: number;
    estuve: boolean;
    miItem: string | null;
    /**
     * Qué salió y quién se lo llevó. Va sin imagen a propósito: el tablero la saca del
     * catálogo por `catalogoId`, así el historial no arrastra un base64 por item.
     */
    drops: Array<{
      id: number;
      etiqueta: string;
      rareza: Rareza;
      icono: string;
      catalogoId: number | null;
      cola: string;
      dueno: string | null;
    }>;
  }>;
}
