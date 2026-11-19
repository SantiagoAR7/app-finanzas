# App Finanzas

App privada de finanzas personales para uso propio, familiares y amigos. Esta construida con Expo, React Native, Expo Router y Supabase.

## Que tiene hoy

- Login y registro con Supabase Auth.
- Datos privados por usuario con Row Level Security.
- Movimientos de ingresos y gastos con fecha, cuenta, categoria y nota.
- Categorias distintas para gastos e ingresos.
- Edicion y eliminacion de movimientos.
- Filtros por mes, tipo y categoria.
- Presupuesto mensual.
- Presupuestos por categoria.
- Dashboard mensual con lectura rapida.
- Cajas de ahorro con meta, ahorro actual, fecha objetivo y aporte mensual sugerido.
- Transferencias internas hacia/desde cajas de ahorro.
- Historial de movimientos de ahorro.
- Movimientos recurrentes con control para no duplicar el mismo mes.
- Edicion y eliminacion de plantillas recurrentes.
- Reportes por mes, categoria de gasto e ingresos.
- Bloqueo local con PIN y biometria cuando el dispositivo lo permite.
- Exportacion de respaldo CSV con movimientos, ahorros, presupuestos y recurrentes.

## Desarrollo local

1. Instala dependencias:

```sh
npm install
```

2. Copia `.env.example` a `.env`.

3. Completa las variables:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

4. En Supabase, abre SQL Editor y ejecuta:

```text
supabase/schema.sql
```

5. Inicia la app:

```sh
npm run start
```

## Pruebas rapidas

```sh
npx tsc --noEmit
npx eslint . --no-cache
npm run export:web
```

Para previsualizar web:

```sh
npm run preview:web
```

Luego abre:

```text
http://127.0.0.1:8082
```

## Probar en celular con Expo Go

```sh
npm run start:phone
```

Abre Expo Go en el telefono y escanea el QR desde Expo Go. Si lo escaneas con la camara normal y dice `No usable data found`, abre Expo Go y usa su lector interno.

El telefono y el computador deben estar en la misma red Wi-Fi. Si el QR no conecta, revisa el valor de `REACT_NATIVE_PACKAGER_HOSTNAME` en `package.json`.

## Seguridad

- La `anon key` de Supabase puede vivir en el cliente porque las tablas estan protegidas con RLS.
- Cada tabla sensible tiene `user_id` y politicas que comparan contra `auth.uid()`.
- Una cuenta autenticada solo puede leer, crear, editar o borrar sus propios datos.
- El PIN local protege el acceso en el telefono, pero no reemplaza el login ni las reglas de Supabase.
- El PIN se guarda como hash con salt usando almacenamiento seguro/local.
- La app no se conecta a bancos. Solo guarda la informacion que cada persona ingresa manualmente.

## Documentos utiles

- Guia de despliegue movil: `docs/mobile-deployment.md`
- SQL de Supabase: `supabase/schema.sql`

## Siguiente endurecimiento recomendado

Para que ni un administrador de Supabase pueda leer montos o notas, el siguiente paso seria cifrado del lado del dispositivo. Eso requiere definir recuperacion de clave: frase de recuperacion, clave familiar o aceptar que perder la clave impide recuperar los datos.
