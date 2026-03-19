import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { GreatVibes_400Regular } from '@expo-google-fonts/great-vibes';
import { Orbitron_700Bold } from '@expo-google-fonts/orbitron';
import { PlayfairDisplay_700Bold } from '@expo-google-fonts/playfair-display';
import { Rajdhani_700Bold } from '@expo-google-fonts/rajdhani';
import { useFonts } from 'expo-font';
import * as LocalAuthentication from 'expo-local-authentication';
import { Stack } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppProvider, useAppContext } from '../src/context/AppContext';
import { appFonts } from '../src/lib/fonts';
import { getBiometricCopy, tApp } from '../src/lib/i18n';
import {
  configurePushNotifications,
  registerPushNotifications,
} from '../src/lib/push/push-notifications';
import { OwnerAccessScreen } from '../src/screens/OwnerAccessScreen';

function AppContent() {
  const {
    appLanguage,
    isAuthenticated,
    isLoaded,
    biometricEnabled,
    salonWorkspace,
    workspaceAccessAllowed,
    logoutOwnerAccount,
  } = useAppContext();
  const biometricCopy = getBiometricCopy(appLanguage, process.env.EXPO_OS === 'ios' ? 'ios' : 'generic');
  const [biometricPassed, setBiometricPassed] = React.useState(false);
  const [biometricChecking, setBiometricChecking] = React.useState(false);

  const requestBiometricUnlock = React.useCallback(async () => {
    if (!biometricEnabled || !isAuthenticated) {
      setBiometricPassed(true);
      return;
    }

    setBiometricChecking(true);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: biometricCopy.promptUnlock,
      cancelLabel: tApp(appLanguage, 'common_cancel'),
      fallbackLabel: 'Usa password',
      disableDeviceFallback: false,
    });
    setBiometricChecking(false);

    setBiometricPassed(result.success);
  }, [appLanguage, biometricCopy.promptUnlock, biometricEnabled, isAuthenticated]);

  React.useEffect(() => {
    configurePushNotifications();
  }, []);

  React.useEffect(() => {
    if (!isAuthenticated || !workspaceAccessAllowed) return;

    registerPushNotifications({
      workspaceId: salonWorkspace.id,
      ownerEmail: salonWorkspace.ownerEmail,
    }).then((result) => {
      if (!result.token) {
        console.log('Push registration skipped:', result.reason ?? 'token_unavailable');
        return;
      }

      if (!result.backendSynced) {
        console.log('Push token registrato sul device ma non sincronizzato backend.');
      }
    });
  }, [isAuthenticated, salonWorkspace.id, salonWorkspace.ownerEmail, workspaceAccessAllowed]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      setBiometricPassed(false);
      setBiometricChecking(false);
      return;
    }

    if (!biometricEnabled) {
      setBiometricPassed(true);
      return;
    }

    setBiometricPassed(false);
    requestBiometricUnlock();
  }, [biometricEnabled, isAuthenticated, requestBiometricUnlock]);

  if (!isLoaded) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f6f6f3',
        }}
      >
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <OwnerAccessScreen />;
  }

  if (biometricEnabled && !biometricPassed) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f6f6f3',
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#ffffff',
            borderRadius: 28,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.6,
              color: '#64748b',
              marginBottom: 8,
            }}
          >
            SALON PRO
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: '#1a1816',
              marginBottom: 10,
            }}
          >
            {tApp(appLanguage, 'root_unlock_title')}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: '#6d6257',
              marginBottom: 20,
            }}
          >
            {tApp(appLanguage, 'root_unlock_description', {
              biometricLabel: biometricCopy.label,
            })}
          </Text>

          <TouchableOpacity
            onPress={requestBiometricUnlock}
            activeOpacity={0.9}
            disabled={biometricChecking}
            style={{
              backgroundColor: '#111827',
              borderRadius: 18,
              paddingVertical: 14,
              alignItems: 'center',
              marginBottom: 12,
              opacity: biometricChecking ? 0.7 : 1,
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: '#ffffff',
              }}
            >
              {biometricChecking ? tApp(appLanguage, 'root_unlock_loading') : biometricCopy.unlock}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => logoutOwnerAccount()} activeOpacity={0.8}>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 14,
                fontWeight: '700',
                color: '#64748b',
              }}
            >
              {tApp(appLanguage, 'root_unlock_exit')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!workspaceAccessAllowed) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#f6f6f3',
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: '#ffffff',
            borderRadius: 28,
            padding: 24,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 1.6,
              color: '#9a6b32',
              marginBottom: 8,
            }}
          >
            SALON PRO
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '800',
              color: '#1a1816',
              marginBottom: 10,
            }}
          >
            {tApp(appLanguage, 'root_inactive_title')}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: '#6d6257',
              marginBottom: 16,
            }}
          >
            {tApp(appLanguage, 'root_inactive_description', {
              status: salonWorkspace.subscriptionStatus,
            })}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: '700',
              color: '#1a1816',
            }}
          >
            {tApp(appLanguage, 'root_inactive_account')}: {salonWorkspace.ownerEmail}
          </Text>
        </View>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    [appFonts.displayNeon]: Orbitron_700Bold,
    [appFonts.displayCondensed]: Rajdhani_700Bold,
    [appFonts.displayPoster]: BebasNeue_400Regular,
    [appFonts.displayEditorial]: PlayfairDisplay_700Bold,
    [appFonts.displayScript]: GreatVibes_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f6f6f3',
          }}
        >
          <ActivityIndicator size="large" color="#111111" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
