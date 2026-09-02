# Subastas del Kundun

App para repartir el botín del Kundun en Mu Dark Epoch. El evento se abre solo a su horario, los del
gremio se anotan con un PIN, el admin carga lo que salió subastado y la app reparte **quién puja por
qué**, siguiendo el orden de prioridad armado según el PC de cada personaje.

- **React + Vite** para la interfaz
- **Hono** sobre un **Cloudflare Worker** para la API
- **D1** (SQLite de Cloudflare) para los datos
- Login con Google o con usuario y contraseña
- Modo oscuro por defecto, claro con el botón de arriba a la derecha

---

## Arrancar en local

```bash
npm install
npm run db:migrate     # crea las tablas en la base local
npm run db:seed        # crea el admin que está en .env.seed
npm run dev            # http://localhost:5173
```

Entrá con el usuario y la contraseña de `.env.seed`. Desde **Admin → Miembros** cargás
las cuentas del resto del gremio.

### Los archivos de configuración

| Archivo | Para qué | ¿Se sube? |
|---|---|---|
| `.dev.vars` | `SESSION_SECRET` y las credenciales de Google | No (está en `.gitignore`) |
| `.env.seed` | Usuario y contraseña del admin, solo para el script de seed | No (está en `.gitignore`) |
| `wrangler.jsonc` | Nombre del Worker, binding de D1 | Sí |

La contraseña del admin **nunca se guarda en texto plano**: el script la convierte a un hash
PBKDF2 y solo eso llega a la base.

### Rutas

Hay **dos pantallas y nada más**:

| Ruta | Quién entra | Qué es |
|---|---|---|
| `/` | **cualquiera, sin login** | El tablero del gremio |
| `/admin` | admin y Grand Master, **con contraseña** | Cargar drops, repartir, catálogo, orden, miembros |

### El tablero

**No tiene login y entra en una sola vista**: la página nunca scrollea. Ocupa exactamente el alto de
la ventana y se reparte así:

```
┌──────────────────────────────────────────┐
│ [Horarios]      Kundun #12       [tema]  │
├───────────────────────────┬──────────────┤
│  Quién se lleva qué       │  Orden del   │
│  (scrollea por dentro)    │  gremio      │
│                           │  por PC      │
├───────────────────────────┴──────────────┤
│ [Puja anterior]    ⛨    [Historial]      │
└──────────────────────────────────────────┘
```

En celular las dos cajas se apilan; en pantalla ancha van lado a lado. Si la lista de drops no
entra, scrollea **dentro de su caja**, no la página. **Recargando aparece lo nuevo** — no hay nada
que tocar ni nada que aprender.

Los dos botones de abajo son la historia: **Puja anterior** (quién se llevó qué la vez pasada) e
**Historial** (todos los Kundun cerrados). El acceso al panel está dentro de **Horarios**, para que
no moleste a nadie.

### Comandos

```bash
npm run dev              # servidor de desarrollo con la API y la base local
npm run build            # compila el front y el worker a dist/
npm run db:migrate       # aplica las migraciones en local
npm run db:seed          # crea o actualiza el admin en local
npm run db:reset         # borra la base local, migra y vuelve a sembrar
npm run deploy           # compila y publica en Cloudflare
```

---

## Horarios

El Kundun cae **todos los días a las 13:00 y a las 21:00 hora del servidor (GMT-3)**. El evento se
abre y se cierra solo, sin que nadie apriete nada:

| Momento | Qué pasa |
|---|---|
| **15 min antes** | Se abre el evento y **sale el código**. El admin lo canta y la gente se anota. |
| **la hora** | Arranca el Kundun. |
| **5 min antes del cierre** | Se corta el registro: el botón de anotarse se apaga. |
| **20 min después** | El evento **se cierra solo** y queda esperando el siguiente. |

Antes de que el código salga **no existe para nadie**, ni para el admin, y el servidor rechaza
cualquier intento de anotarse aunque alguien adivine el número.

Que el evento se cierre solo no depende de que alguien tenga la página abierta: un **cron de
Cloudflare despierta al Worker cada minuto** (`triggers.crons` en `wrangler.jsonc`) y ahí se
cierra el que venció y se abre el que entra en ventana. La misma comprobación corre en cada visita,
así que si el cron fallara el resultado sería el mismo apenas alguien abra la página.

Los Kundun de prueba quedan afuera del cierre automático: los termina el admin a mano. Si se
cerraran solos desaparecería el botón para borrarlos y el respaldo de las ruedas quedaría colgado.

### Anotarse

Mientras el registro está abierto, el tablero muestra **Estoy en el Kundun**. Se elige el personaje
de la lista, se escribe el código de 4 dígitos y listo: no hay cuenta, contraseña ni mail. El equipo
recuerda quién sos, así la próxima vez es un toque y el código.

La identificación es el código: sale 15 minutos antes y se canta por voz o por el chat del juego,
así que tenerlo ya dice que estabas. Es la **única ruta pública que escribe**; todo lo demás del
tablero es de solo lectura.

**Un personaje se anota una sola vez.** Apenas alguien entra, su nombre queda apagado y no se puede
volver a tocar; el servidor también lo rechaza, no es solo la pantalla. Es lo que evita que alguien
con el código en la mano anote a un ausente. Si se tocó el nombre equivocado, lo corrige el admin
desde el panel.

Otras guardas: el registro tiene que estar abierto y en hora, el código ya tiene que haber salido,
el personaje tiene que estar activo y pasado `registro_hasta` no entra nadie más. A los **25
códigos errados** el registro de ese Kundun se cierra solo y hay que generar un PIN nuevo desde el
panel, lo que vuelve el contador a cero.

Los horarios se guardan siempre en UTC y se muestran en la zona de cada uno. Un mail no dice dónde
está la persona, así que la zona sale del navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`),
con un selector para ver la hora del servidor si hace falta. Nadie configura nada: el que abre la
página desde México ve las 10:00 y el que la abre desde Madrid ve las 18:00, para el mismo Kundun.

### Cambiar el horario

El servidor del juego los mueve cada tanto, así que **se cambian desde el panel**, no desde el
código: solapa *Evento*, cuadro **Horario del Kundun** (solo el admin).

| Campo | Qué es |
| --- | --- |
| **Horas del servidor** | Separadas por coma: `13:00, 21:00`. Acepta `13`, `21.30` y `0800`. Hasta 12 por día. |
| **Zona del servidor** | En qué GMT están esas horas. Es lo único que traduce a UTC. |
| **Abre antes** | Minutos antes en que se abre el registro. |
| **PIN antes** | Minutos antes en que aparece el código. Nunca puede ser antes de que abra. |
| **Cierra después** | Minutos después del Kundun en que el evento se cierra solo. |
| **Corta registro** | Minutos antes de ese cierre en que se apaga el botón de anotarse. |

Debajo del formulario está lo que quedó guardado y **cómo se ve en tu hora**, para chequear el
cambio de un vistazo. Los Kundun ya creados no se mueven: cada evento guarda sus propios horarios.

El horario vive en la tabla `ajustes` (una sola fila). `HORARIO_POR_DEFECTO` en
`worker/horarios.ts` es solo la red por si esa fila no existe.

---

## La biblioteca de íconos

Todas las imágenes de la app —los retratos de clase, los íconos de los items y el ícono de la
app— son **archivos que sirve Cloudflare**, no imágenes guardadas en la base.

Salen de la carpeta `imagenes/`. En cada `npm run build`, `scripts/iconos.mjs` las pasa a
webp de 128 px en `public/iconos/` y escribe el índice en `src/biblioteca.ts`. Para sumar un
ícono alcanza con **dejar el PNG en `imagenes/` y volver a desplegar**: aparece solo en el panel.

En el panel, tocar la imagen de un item o de una clase abre la biblioteca y se elige de ahí, sin
subir nada. Queda además un *"¿No está en la lista? Subir una imagen"* para cuando entra algo que
todavía no tiene ícono guardado; eso sí se guarda en la base, como data URL.

Por qué importa: las cinco imágenes de los items vivían adentro de la base y viajaban en cada
`/api/estado`, duplicadas por cada rueda. **El estado pasó de 76 KB a 6,5 KB**, y los íconos
ahora los cachea el navegador en vez de volver a bajarlos cada ocho segundos.

El ícono de la app sale del mismo script, recortado al busto del Kundun: a 32 píxeles la figura
entera queda en una mancha, y así se distinguen la corona, la gema del pecho y el báculo.

---

## Clases

Cada personaje tiene su clase y su retrato al lado del nombre, en el tablero, en las ruedas y en
el panel. Se manejan desde **Miembros → Clases de personaje**: se crea una con su código, su
nombre y su ícono elegido de la biblioteca, y de ahí en adelante aparece en el desplegable de
cada personaje.

| Código | Clase |
| --- | --- |
| `BK` | Royal Knight |
| `ELF` | High Elf |
| `SM` | Warrior Mage |
| `DL` | Dark Lord |

El **código** es lo que queda guardado en cada personaje (`BK`), corto y en mayúsculas; el
**nombre** es lo que se lee (`Royal Knight`).

Esas cuatro no guardan imagen: usan `/iconos/<codigo>.webp` de la biblioteca. Si se les elige
otra, un botón las devuelve a la original.

Borrar una clase no rompe nada: los personajes que la tenían quedan sin clase y el aviso dice
cuántos fueron. Un personaje sin clase no muestra retrato, el nombre queda solo.

---

## Roles

| Rol | Qué puede hacer | Cómo entra |
|---|---|---|
| `admin` | Todo: gremio, roles, orden de prioridad, abrir y cerrar el Kundun, PIN | contraseña |
| `grandmaster` | Sube los drops, arranca el reparto y edita el catálogo | contraseña |
| `invitado` | Se anota al Kundun y pide items | toca su Main |

El rol se cambia desde **Admin → Miembros**. Nadie se puede sacar el rol a sí mismo ni darse de baja
solo, para no quedar sin ningún admin.

Como el admin y la Grand Master entran con contraseña y no tocando su nombre, **no se puede ascender
a alguien que no tenga clave**: la app lo rechaza con un aviso, para que no quede afuera de las dos
puertas. La clave se pone en la misma fila de la lista de miembros.

---

## Login con Google

Los jugadores **no usan Google ni contraseña**: entran tocando su Main. Google sirve para las cuentas
que manejan la app (admin y cargador), que sí entran con credenciales por `/admin`.

El alta de un miembro pide **personaje, PC y contraseña** — el usuario sale del nombre del personaje
(*El Brujo* → `elbrujo`). El Gmail es opcional y se vincula después, desde la columna *Gmail* de la
lista de miembros. **No hay alta automática**: si el mail no está cargado por el admin, rebota con
"pedile al admin que te dé de alta".

1. Google Cloud Console → *APIs y servicios* → *Credenciales* → **ID de cliente de OAuth**
   (tipo: aplicación web).
2. En *URI de redireccionamiento autorizados* poner las dos:
   - `http://localhost:5173/api/auth/google/callback` (local)
   - `https://TU-DOMINIO/api/auth/google/callback` (producción)
3. Local: pegar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.dev.vars`.
4. Producción: cargarlos como secrets (ver abajo).

Mientras esas dos variables estén vacías, el botón de Google no aparece y se entra con usuario y
contraseña.

---

## Cargar los items después de la subasta

1. El Kundun se abre solo a su horario; el tablero lo muestra sin que nadie haga nada.
2. Cada uno se anota desde el tablero con **Estoy en el Kundun** y el código. El admin o la Grand
   Master pueden marcar y corregir igual desde el panel, con un botón *Fueron todos* para el caso
   normal. Si no se marca a nadie, el reparto toma a todo el gremio.
3. Pegan lo que salió, tal cual se lee del chat:

   ```
   1 cqc, 2 condor flame, 2 almas de guerra
   ```

   Cada unidad entra como un item aparte (*Pluma de Condor (1 de 2)*, *(2 de 2)*), porque cada una
   la puja una persona distinta.

   Los nombres se resuelven contra el **catálogo**: `cqc` sale como *Cristal del Caos* con su imagen,
   porque eso se configuró una vez. La imagen se lee del catálogo cada vez que se muestra el item,
   así que subirla después también arregla los Kundun viejos del historial. Si el nombre es nuevo, se agrega solo al catálogo
   esperando su imagen. En el catálogo también se cargan **otras formas de escribirlo** (`pluma`,
   `plumas condor`), así no importa cómo lo tipeen.

   **Los domingos** aparecen dos campos en vez de uno: *Drops del Kundun* y *Drops del Castle Siege*.
   Ese día se mezclan los dos repartos, así que lo que se pegue en el segundo campo entra a la lista
   del asedio, aunque ese item también salga en el Kundun. El domingo lo decide el evento en curso,
   no el reloj: el Kundun de las 21 se termina de cargar ya entrado el lunes y sigue contando como
   domingo.
4. Con **Cerrar subasta y repartir**, cada item va al que esté más arriba en el orden de PC entre
   los que estuvieron. El reparto **rota**: el que ya se llevó algo pasa al final de la fila, así
   nadie acapara. Cada asignación queda con su motivo escrito (*Por orden de PC · #3 del gremio*).
5. En el tablero, todos ven al toque a quién le toca pujar cada cosa, así nadie del gremio compite
   contra otro y se infla el precio.
6. Cuando alguien gana la puja, se marca **Ya lo ganó**.
7. El reparto del Kundun anterior queda a un botón de distancia, sin preguntarlo por el chat. En
   **Historial** se abre cualquier Kundun viejo y se ve qué salió y quién se lo llevó; las imágenes
   se sacan del catálogo en el momento, así que el historial no arrastra un base64 por item.

Cualquier item se puede corregir a dedo desde el panel. El orden de PC se recalcula con un botón y
también se acomoda a mano con las flechitas.

---

## Quién participa en cada lista

Son **tres listas independientes**, y cada una tiene su propia gente. En el panel, la solapa
**Listas** (solo el admin) muestra un cuadro por lista con todo el gremio y una tilde por persona:

| Lista | Qué reparte |
| --- | --- |
| **Drops del Kundun** | Los items que salen sorteados todos los días. |
| **Almas de guerra** | Salen en todos los Kundun, una o dos por vez. |
| **Castle Siege** | Las recompensas del asedio, los domingos. |

Estar en una lista no obliga a estar en las otras: alguien puede cobrar solo en el asedio, o solo
las almas. Cada cuadro tiene además *Poner a todo el gremio* / *Sacar a todos*.

Ojo con dejar una lista **vacía**: sus drops se cargan igual pero no se pueden repartir, y el aviso
del reparto lo dice ("quedaron sin repartir los drops de asedio").

El orden de PC es uno solo y vale para las tres; la lista solo decide **quién da la vuelta**. En el
tablero y en el orden del gremio se marca al costado a quien se sale de lo normal (items + almas).

---

## Un item en varias listas

La CQC, la Pluma, el Condor y las Almas caen **tanto en el Kundun de todos los días como en el
asedio del domingo**. El Cofre de Asedio es el único que sale nada más que en el asedio.

En la solapa **Catálogo**, cada item tiene los chips *Kundun · Almas · Asedio*: se prenden y se
apagan de a uno. Un item no puede quedarse sin ninguna lista; el último chip encendido no se apaga.

Lo importante: como cada lista tiene su propia gente, **un item que sale en dos listas lleva dos
ruedas separadas**. La CQC del Kundun le toca a uno y la CQC del asedio a otro, y repartir una no
mueve el turno de la otra. Por eso el cuadro *Le toca a* muestra un renglón por lista.

En la base son dos tablas: `catalogo_colas` (en qué listas sale cada item) y `turnos`, cuya clave
es el par `(catalogo_id, cola)`.

Cuando se carga un drop sin decir de qué lista es, sale de la primera lista del item que no sea el
asedio: la CQC entra como Kundun, las Almas como almas, y el Cofre —que solo tiene asedio— como
asedio. El campo del domingo es lo único que fuerza la lista a mano.

Un nombre nuevo entra al catálogo en la lista del Kundun; después se le agregan las otras.

En el tablero, el botón **Lista Drops** abre las ruedas separadas en dos solapas: *Kundun* con
las listas de todos los días y *Castle Siege* con las del domingo. Un item que sale en las dos
aparece en ambas, cada una con su propia cuenta. Los domingos la solapa del asedio se marca con
"hoy".

---

## Subir a Cloudflare

```bash
npx wrangler login

# 1. Crear la base y pegar el id que devuelve en wrangler.jsonc (database_id)
npx wrangler d1 create subastas-kundun

# 2. Crear las tablas en la base de verdad
npm run db:migrate:remote

# 3. Cargar los secretos (uno por vez; los pide por teclado)
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET

# 4. Crear el admin en la base remota
npm run db:seed:remote

# 5. Publicar
npm run deploy
```

Después de subirlo, cambiá la contraseña del admin: hoy se cambia editando `.env.seed` y volviendo a
correr `npm run db:seed:remote`.

---

## Qué falta

- **Tope de items por persona.** Al repartir, el que ya se llevó algo pasa al final para el resto de
  los items; solo repite si nadie más pidió ese item. Si querés un tope duro de uno por evento, se
  cambia en `elegirGanador` (`worker/consultas.ts`).
- **Cambiar la propia contraseña.** Con Google no hace falta; para los que entran con usuario, hoy la
  cambia el admin.
- **Imágenes.** Se guardan como data URL dentro de la fila de D1, achicadas a 128×128. Si en algún
  momento se quieren imágenes grandes, el lugar es R2, no D1.
- **Tiempo real.** La pantalla se refresca sola cada 8 segundos mientras hay un Kundun abierto. Si
  hace falta que sea instantáneo, la pieza son los Durable Objects con WebSocket.

---

## El diseño

Las pantallas se diseñaron primero en un lienzo de Claude Design; los archivos fuente están en
`diseno/` y el lienzo publicado en `subastas-kundun.html`.
