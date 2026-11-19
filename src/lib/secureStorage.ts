import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const webPrefix = 'app-finanzas.secure.';

export async function getSecureItem(key: string) {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(`${webPrefix}${key}`);
  }

  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    window.localStorage.setItem(`${webPrefix}${key}`, value);
    return;
  }

  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string) {
  if (Platform.OS === 'web') {
    window.localStorage.removeItem(`${webPrefix}${key}`);
    return;
  }

  await SecureStore.deleteItemAsync(key);
}
