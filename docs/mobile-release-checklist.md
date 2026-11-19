# Checklist de release movil

Esta lista es para preparar una version instalable de App Finanzas en Android y iPhone.

## Antes de compilar

- Confirmar que `.env` tiene `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Confirmar que Supabase tiene aplicado `supabase/schema.sql`.
- Ejecutar `npm run check`.
- Ejecutar `npm run expo:config` y revisar que no muestre datos sensibles.
- Ejecutar `npm run eas:whoami`; si no hay sesion, usar `npm run eas:login`.

## Android preview

El primer artefacto recomendado es APK interno:

```sh
npm run build:android:preview
```

Cuando EAS termine, descarga el APK desde el enlace de Expo e instalalo en un telefono Android propio.

## Validacion en Android

- Crear cuenta nueva.
- Crear ingreso, gasto, presupuesto, caja de ahorro y recurrente.
- Cerrar y abrir la app para validar sesion persistente.
- Activar PIN y validar bloqueo.
- Exportar CSV desde Perfil.
- Crear una segunda cuenta y confirmar que no ve datos de la primera.

## iPhone preview

Para instalar en iPhone sin App Store publica, usa TestFlight. Requiere Apple Developer Program:

```sh
npm run build:ios:preview
```

Despues se sube a App Store Connect/TestFlight con EAS Submit o manualmente.

## Produccion

- Android Play Store usa AAB:

```sh
npm run build:android:production
```

- iOS App Store/TestFlight usa build de produccion:

```sh
npm run build:ios:production
```

## Costos base

- Google Play Console: pago unico de USD 25 para distribucion completa.
- Apple Developer Program: USD 99 al ano.
- Expo EAS: puede usarse con builds gratuitos limitados; si necesitas mas velocidad/capacidad, se puede pasar a un plan pago.
