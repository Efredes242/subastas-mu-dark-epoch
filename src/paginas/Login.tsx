import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { BotonTema, type Tema } from '../componentes/BotonTema';
import { Alerta, Escudo } from '../iconos';

/** Los motivos con los que vuelve /api/auth/google/callback cuando algo no salió. */
const MOTIVOS: Record<string, string> = {
  'google-apagado': 'El login con Google todavía no está configurado en el servidor.',
  state: 'Se venció el intento de entrar con Google. Probá de nuevo.',
  codigo: 'Google no devolvió el permiso. Probá de nuevo.',
  token: 'No se pudo confirmar la cuenta con Google. Probá de nuevo.',
  'sin-verificar': 'Ese mail de Google no está verificado.',
  'sin-cuenta': 'Ese mail no está en el gremio todavía. Pedile al admin que te dé de alta.',
};

function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export default function Login({
  tema,
  alternarTema,
  alEntrar,
  googleActivo,
}: {
  tema: Tema;
  alternarTema: () => void;
  alEntrar: () => Promise<void>;
  googleActivo: boolean;
}) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Si venimos rebotados de Google, el motivo llega por la URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const motivo = params.get('error');
    if (!motivo) return;

    const mail = params.get('mail');
    setError((MOTIVOS[motivo] ?? 'No se pudo entrar con Google.') + (mail ? ` (${mail})` : ''));
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await api('/auth/login', { cuerpo: { usuario, password } });
      await alEntrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar.');
      setEnviando(false);
    }
  }

  return (
    <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <BotonTema tema={tema} alternar={alternarTema} />
        </div>

        <form className="panel subir" onSubmit={entrar} style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
            <div className="icono-item r-divino" style={{ width: 46, height: 46, borderRadius: 15 }} aria-hidden="true">
              <Escudo tam={23} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div className="marca" style={{ fontSize: 13 }}>
                MU DARK EPOCH
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Panel del gremio</div>
            </div>
          </div>

          {error && (
            <div className="aviso mal aparecer" style={{ marginBottom: 14 }}>
              <Alerta tam={17} />
              <span>{error}</span>
            </div>
          )}

          {googleActivo && (
            <>
              <a
                className="btn"
                href="/api/auth/google"
                style={{ width: '100%', minHeight: 52, fontSize: 15, textDecoration: 'none' }}
              >
                <LogoGoogle />
                Entrar con Google
              </a>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--tx3)' }}>o con usuario</span>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <input
              className="campo"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Usuario o mail"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <input
              className="campo"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              autoComplete="current-password"
              required
            />

            <button type="submit" className="btn btn-oro" disabled={enviando} style={{ minHeight: 54, fontSize: 16 }}>
              {enviando ? <div className="cargando" /> : 'Entrar'}
            </button>
          </div>

          <div style={{ marginTop: 18, fontSize: 12.5, fontWeight: 500, color: 'var(--tx3)', lineHeight: 1.5 }}>
            Esta pantalla es solo para el admin y la Grand Master. El tablero del gremio no necesita
            contraseña: <a href="/">está acá</a>.
          </div>
        </form>
      </div>
    </div>
  );
}
