import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { deleteSecureItem, getSecureItem, setSecureItem } from '../lib/secureStorage';

const pinHashKey = 'app-finanzas.pin-hash';
const pinSaltKey = 'app-finanzas.pin-salt';

type AppLockContextValue = {
  biometricAvailable: boolean;
  initializing: boolean;
  locked: boolean;
  pinEnabled: boolean;
  disablePin: () => Promise<void>;
  lock: () => void;
  setPin: (pin: string) => Promise<string | null>;
  unlockWithBiometrics: () => Promise<string | null>;
  unlockWithPin: (pin: string) => Promise<string | null>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

async function hashPin(pin: string, salt: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

function validatePin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [locked, setLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadLockState() {
      const [pinHash, hasHardware, isEnrolled] = await Promise.all([
        getSecureItem(pinHashKey),
        Platform.OS === 'web' ? false : LocalAuthentication.hasHardwareAsync(),
        Platform.OS === 'web' ? false : LocalAuthentication.isEnrolledAsync(),
      ]);

      if (!mounted) {
        return;
      }

      const enabled = Boolean(pinHash);
      setPinEnabled(enabled);
      setLocked(enabled);
      setBiometricAvailable(hasHardware && isEnrolled);
      setInitializing(false);
    }

    loadLockState();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && pinEnabled) {
        setLocked(true);
      }
    });

    return () => subscription.remove();
  }, [pinEnabled]);

  const value = useMemo<AppLockContextValue>(
    () => ({
      biometricAvailable,
      initializing,
      locked,
      pinEnabled,
      disablePin: async () => {
        await Promise.all([deleteSecureItem(pinHashKey), deleteSecureItem(pinSaltKey)]);
        setPinEnabled(false);
        setLocked(false);
      },
      lock: () => {
        if (pinEnabled) {
          setLocked(true);
        }
      },
      setPin: async (pin) => {
        if (!validatePin(pin)) {
          return 'Usa un PIN numerico de 4 a 8 digitos.';
        }

        const salt = Crypto.randomUUID();
        const pinHash = await hashPin(pin, salt);
        await Promise.all([setSecureItem(pinSaltKey, salt), setSecureItem(pinHashKey, pinHash)]);
        setPinEnabled(true);
        setLocked(false);
        return null;
      },
      unlockWithBiometrics: async () => {
        if (!biometricAvailable) {
          return 'Este dispositivo no tiene biometria configurada.';
        }

        const result = await LocalAuthentication.authenticateAsync({
          biometricsSecurityLevel: 'strong',
          fallbackLabel: 'Usar codigo del telefono',
          promptDescription: 'Confirma que eres tu para abrir tus finanzas.',
          promptMessage: 'Desbloquear App Finanzas',
        });

        if (!result.success) {
          return 'No se pudo validar la biometria.';
        }

        setLocked(false);
        return null;
      },
      unlockWithPin: async (pin) => {
        const [pinHash, salt] = await Promise.all([getSecureItem(pinHashKey), getSecureItem(pinSaltKey)]);

        if (!pinHash || !salt) {
          setPinEnabled(false);
          setLocked(false);
          return null;
        }

        const nextHash = await hashPin(pin, salt);
        if (nextHash !== pinHash) {
          return 'PIN incorrecto.';
        }

        setLocked(false);
        return null;
      },
    }),
    [biometricAvailable, initializing, locked, pinEnabled],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const value = useContext(AppLockContext);

  if (!value) {
    throw new Error('useAppLock debe usarse dentro de AppLockProvider');
  }

  return value;
}
