import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getAppLanguageOptions, resolveStoredAppLanguage, tApp, type AppLanguage } from '../src/lib/i18n';
import { useResponsiveLayout } from '../src/lib/responsive';

const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';

export default function ClienteImpostazioniScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ salon?: string | string[] }>();
  const responsive = useResponsiveLayout();
  const [frontendLanguage, setFrontendLanguage] = useState<AppLanguage>('it');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY);
        setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
      } catch (error) {
        console.log('Errore caricamento impostazioni frontend:', error);
      }
    };

    loadLanguage();
  }, []);

  const handleChangeLanguage = async (value: AppLanguage) => {
    setFrontendLanguage(value);
    await AsyncStorage.setItem(FRONTEND_LANGUAGE_KEY, value);
  };

  const handleLogout = () => {
    Alert.alert(
      tApp(frontendLanguage, 'frontend_logout_confirm_title'),
      tApp(frontendLanguage, 'frontend_logout_confirm_body'),
      [
        { text: tApp(frontendLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(frontendLanguage, 'common_logout'),
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(FRONTEND_PROFILE_KEY);
            const salon = Array.isArray(params.salon) ? params.salon[0] : params.salon;
            router.replace({
              pathname: '/cliente',
              params: salon ? { salon } : undefined,
            });
          },
        },
      ]
    );
  };

  const languageOptions = getAppLanguageOptions(frontendLanguage);

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
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.9}>
              <View style={styles.actionIconBadge}>
                <Ionicons name="chevron-back" size={18} color="#111111" />
              </View>
              <Text style={styles.backButtonText}>{tApp(frontendLanguage, 'common_back')}</Text>
            </TouchableOpacity>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{tApp(frontendLanguage, 'frontend_badge')}</Text>
            </View>
          </View>
          <View style={styles.titleRow}>
            <View style={styles.titleBadge}>
              <Ionicons name="settings-outline" size={18} color="#475569" />
            </View>
            <Text style={styles.title}>{tApp(frontendLanguage, 'settings_title')}</Text>
          </View>
          <Text style={styles.subtitle}>{tApp(frontendLanguage, 'frontend_settings_subtitle')}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(frontendLanguage, 'settings_language_title')}</Text>
          <Text style={styles.cardHint}>{tApp(frontendLanguage, 'settings_language_hint')}</Text>
          <View style={styles.languageRow}>
            {languageOptions.map((option) => {
              const selected = frontendLanguage === option.value;

              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.languageChip, selected && styles.languageChipActive]}
                  onPress={() => handleChangeLanguage(option.value)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.languageChipText, selected && styles.languageChipTextActive]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.languageChipNote, selected && styles.languageChipNoteActive]}>
                    {option.note}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tApp(frontendLanguage, 'settings_session_title')}</Text>
          <Text style={styles.cardHint}>{tApp(frontendLanguage, 'frontend_settings_subtitle')}</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.9}>
            <Text style={styles.logoutButtonText}>{tApp(frontendLanguage, 'common_logout')}</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  actionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  badge: {
    backgroundColor: '#111111',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  titleBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111111',
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 22,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
  },
  cardHint: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f6b7a',
    marginBottom: 16,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  languageChip: {
    minWidth: 118,
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  languageChipActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  languageChipText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  languageChipTextActive: {
    color: '#ffffff',
  },
  languageChipNote: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
  },
  languageChipNoteActive: {
    color: '#d7dde7',
  },
  logoutButton: {
    backgroundColor: '#111111',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
