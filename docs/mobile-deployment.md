# Guia de despliegue movil

Esta guia deja la app lista para probar y compartir con familiares o amigos sin publicarla como producto comercial.

## Estado recomendado antes de compartir

- `npx tsc --noEmit` pasa sin errores.
- `npx eslint . --no-cache` pasa sin errores.
- `npm run export:web` pasa sin errores.
- Supabase tiene aplicado `supabase/schema.sql`.
- RLS esta activo en todas las tablas.
- Se probo una cuenta nueva y no ve datos de otra cuenta.
- Se probo crear, editar y eliminar:
  - movimientos
  - cajas de ahorro
  - transferencias internas
  - presupuestos por categoria
  - recurrentes
- Se probo exportar respaldo CSV desde Perfil.

## Probar en telefono con Expo Go

1. Instala Expo Go en el telefono.
2. Conecta computador y telefono a la misma red Wi-Fi.
3. Inicia Metro en modo LAN:

```sh
npm run start:phone
```

4. Abre Expo Go y escanea el QR desde el lector interno de Expo Go.

Si aparece `No usable data found`, normalmente significa que se intento escanear con la camara normal. Usa el lector interno de Expo Go.

Si Expo Go no conecta:

- Revisa que el telefono y el computador esten en la misma red.
- Desactiva VPN si bloquea trafico local.
- Revisa la IP usada en `REACT_NATIVE_PACKAGER_HOSTNAME` dentro de `package.json`.
- Ejecuta `npm run start:clear`.
- Si aparece error de Watchman, ejecuta `npm run fix:watchman`.

## Android instalable

Para Android hay dos caminos:

### Opcion A: desarrollo con Expo Go

Es la opcion mas simple para uso personal mientras seguimos probando. No genera APK.

### Opcion B: APK/AAB con EAS Build

Requiere iniciar sesion con una cuenta Expo.

Comandos base:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
```

El resultado recomendado para compartir por fuera de Play Store es un APK interno. Para publicar en Play Store se usa AAB.

## iPhone instalable

Para iPhone hay tres caminos:

### Opcion A: Expo Go

Sirve para pruebas personales rapidas.

### Opcion B: TestFlight

Requiere cuenta Apple Developer. Es la forma mas comoda para que familiares o amigos instalen la app sin publicarla en App Store.

Comandos base:

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform ios --profile preview
```

Luego se sube a App Store Connect/TestFlight con EAS Submit o manualmente.

### Opcion C: App Store no listada

No es necesaria para esta app si el uso sera personal y familiar.

## Configuracion actual de identificadores

En `app.json`:

```json
{
  "ios": {
    "bundleIdentifier": "com.personal.appfinanzas"
  },
  "android": {
    "package": "com.personal.appfinanzas"
  }
}
```

Antes del build final conviene decidir si ese identificador queda asi o si usamos uno mas personal, por ejemplo:

```text
com.santiago.appfinanzas
```

Cambiarlo despues de publicar builds puede complicar actualizaciones.

## Checklist de privacidad antes de invitar personas

- Crear una cuenta de prueba A con movimientos.
- Crear una cuenta de prueba B sin datos.
- Confirmar que B no ve datos de A.
- Confirmar que cerrar sesion borra la vista local.
- Confirmar que el PIN local bloquea la app al volver del segundo plano.
- Confirmar que el respaldo CSV solo exporta datos de la cuenta actual.
- Confirmar que no hay service role key dentro de `.env`, `README`, commits o codigo.

## Variables de entorno

La app solo necesita:

```sh
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Nunca usar la service role key en la app movil.

## Flujo recomendado

1. Terminar QA en web.
2. Probar en Expo Go en Android.
3. Probar en Expo Go en iPhone.
4. Generar build Android preview.
5. Instalar APK en un telefono propio.
6. Generar build iOS/TestFlight si se quiere compartir con iPhone.
7. Invitar familiares/amigos despues de validar privacidad con dos cuentas.
