import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../src/context/AppContext';
import { getAppLanguageOptions, getBiometricCopy, tApp } from '../src/lib/i18n';
import { useResponsiveLayout } from '../src/lib/responsive';

export default function ImpostazioniScreen() {
  const responsive = useResponsiveLayout();
  const router = useRouter();
  const {
    appLanguage,
    setAppLanguage,
    biometricEnabled,
    setBiometricEnabled,
    reopenOnboarding,
    logoutOwnerAccount,
    salonWorkspace,
    salonAccountEmail,
  } = useAppContext();
  const biometricCopy = getBiometricCopy(appLanguage, process.env.EXPO_OS === 'ios' ? 'ios' : 'generic');
  const languageOptions = getAppLanguageOptions(appLanguage);

  const handleLogout = () => {
    Alert.alert(tApp(appLanguage, 'settings_logout_confirm_title'), tApp(appLanguage, 'settings_logout_confirm_body'), [
      { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
      {
        text: tApp(appLanguage, 'common_logout'),
        style: 'destructive',
        onPress: () => {
          logoutOwnerAccount();
        },
      },
    ]);
  };

  const handleToggleBiometric = async () => {
    if (biometricEnabled) {
      setBiometricEnabled(false);
      Alert.alert(
        tApp(appLanguage, 'settings_biometric_disabled_title'),
        tApp(appLanguage, 'settings_biometric_disabled_body')
      );
      return;
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

    if (!hasHardware || !isEnrolled || supportedTypes.length === 0) {
      Alert.alert(tApp(appLanguage, 'settings_biometric_unavailable_title'), biometricCopy.unavailable);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: biometricCopy.promptEnable,
      cancelLabel: tApp(appLanguage, 'common_cancel'),
      fallbackLabel: 'Usa password',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      Alert.alert(
        tApp(appLanguage, 'settings_biometric_cancelled_title'),
        tApp(appLanguage, 'settings_biometric_cancelled_body')
      );
      return;
    }

    setBiometricEnabled(true);
    Alert.alert(
      tApp(appLanguage, 'settings_biometric_enabled_title'),
      tApp(appLanguage, 'settings_biometric_enabled_body', {
        biometricLabel: biometricCopy.label,
      })
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: responsive.horizontalPadding },
      ]}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
        <View style={styles.heroCard}>
          <View style={styles.topActionsRow}>
            <TouchableOpacity
              style={styles.headerBackButton}
              onPress={() => {
                Haptics.selectionAsync().catch(() => null);
                router.back();
              }}
              activeOpacity={0.9}
            >
              <Ionicons name="chevron-back" size={30} color="#050505" />
            </TouchableOpacity>
          </View>

          <View style={styles.screenHeaderRow}>
            <Text style={styles.title}>{tApp(appLanguage, 'settings_title')}</Text>
            <View style={styles.screenBrandChip}>
              <Text style={styles.screenBrandChipText}>
                  {salonWorkspace.salonName.trim() || 'Salon Pro'}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            {tApp(appLanguage, 'settings_subtitle')}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_active_account')}</Text>
          <Text style={styles.cardText}>{salonWorkspace.ownerEmail || salonAccountEmail}</Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_workspace')}: {salonWorkspace.id}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_biometric_title')}</Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_biometric_hint', {
              biometricLabel: biometricCopy.label,
            })}
          </Text>

          <TouchableOpacity
            style={[styles.biometricRow, biometricEnabled && styles.biometricRowActive]}
            onPress={handleToggleBiometric}
            activeOpacity={0.9}
          >
            <View style={styles.biometricContent}>
              <Text style={styles.biometricTitle}>
                {biometricEnabled
                  ? tApp(appLanguage, 'settings_biometric_active_title')
                  : tApp(appLanguage, 'settings_biometric_inactive_title', {
                      biometricLabel: biometricCopy.label,
                    })}
              </Text>
              <Text style={styles.biometricText}>
                {biometricEnabled
                  ? tApp(appLanguage, 'settings_biometric_active_body')
                  : tApp(appLanguage, 'settings_biometric_inactive_body')}
              </Text>
            </View>
            <View style={[styles.biometricToggle, biometricEnabled && styles.biometricToggleActive]}>
              <View
                style={[
                  styles.biometricToggleKnob,
                  biometricEnabled && styles.biometricToggleKnobActive,
                ]}
              />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_language_title')}</Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_language_hint')}
          </Text>

          <View style={styles.languageRow}>
            {languageOptions.map((option) => {
              const selected = appLanguage === option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.languageChip, selected && styles.languageChipActive]}
                  onPress={() => setAppLanguage(option.value)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.languageChipText,
                      selected && styles.languageChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text
                    style={[
                      styles.languageChipNote,
                      selected && styles.languageChipNoteActive,
                    ]}
                  >
                    {option.note}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Onboarding</Text>
          <Text style={styles.cardHint}>
            Rivedi in qualsiasi momento la panoramica iniziale con QR, agenda e flusso operativo.
          </Text>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => {
              reopenOnboarding();
              router.back();
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryActionButtonText}>Riapri onboarding</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(appLanguage, 'settings_session_title')}</Text>
          <Text style={styles.cardHint}>
            {tApp(appLanguage, 'settings_session_hint')}
          </Text>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
            <Text style={styles.logoutButtonText}>{tApp(appLanguage, 'common_logout')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  content: {
    paddingTop: 47,
    paddingBottom: 140,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 22,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  topActionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerBackButton: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenHeaderRow: {
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  screenBrandChip: {
    maxWidth: '100%',
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 6,
  },
  screenBrandChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  cardHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
  },
  languageRow: {
    marginTop: 14,
  },
  biometricRow: {
    marginTop: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#f8fafc',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  biometricContent: {
    flex: 1,
    maxWidth: 220,
  },
  biometricRowActive: {
    backgroundColor: '#eefbf4',
    borderColor: '#b7e4c7',
  },
  biometricTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  biometricText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    maxWidth: 210,
  },
  biometricToggle: {
    width: 52,
    height: 32,
    borderRadius: 999,
    backgroundColor: '#d1d5db',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 4,
  },
  biometricToggleActive: {
    backgroundColor: '#111827',
  },
  biometricToggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  biometricToggleKnobActive: {
    alignSelf: 'flex-end',
  },
  languageChip: {
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
    marginBottom: 10,
  },
  languageChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  languageChipText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  languageChipTextActive: {
    color: '#ffffff',
  },
  languageChipNote: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  languageChipNoteActive: {
    color: '#cbd5e1',
  },
  logoutButton: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryActionButton: {
    marginTop: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  secondaryActionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  logoutButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
});
