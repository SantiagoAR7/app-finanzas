import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppLockProvider } from '../context/AppLockContext';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppLockProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </AppLockProvider>
    </AuthProvider>
  );
}
