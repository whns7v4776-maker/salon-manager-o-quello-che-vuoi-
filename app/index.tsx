import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { useAppContext } from '../src/context/AppContext';
import { useResponsiveLayout } from '../src/lib/responsive';

const normalizeSalonCodeInput = (value: string) => value.trim().toUpperCase();
const OWNER_ROUTE = '/proprietario' as Href;
const BACKOFFICE_ROUTE = '/(tabs)' as Href;

export default function PublicClientLandingScreen() {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const { isAuthenticated } = useAppContext();
  const [salonCode, setSalonCode] = useState('');

  if (Platform.OS !== 'web') {
    return <Redirect href={isAuthenticated ? BACKOFFICE_ROUTE : OWNER_ROUTE} />;
  }

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);

  const openClientArea = () => {
    if (normalizedSalonCode) {
      router.push({
        pathname: '/join/[code]',
        params: { code: normalizedSalonCode },
      });
      return;
    }

    router.push('/cliente');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={undefined}
    >
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: responsive.horizontalPadding }]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: responsive.contentMaxWidth }]}> 
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.clientBadge}>
                <Text style={styles.clientBadgeText}>Area cliente</Text>
              </View>
              <TouchableOpacity
                style={styles.ownerLink}
                onPress={() => router.push(OWNER_ROUTE)}
                activeOpacity={0.85}
              >
                <Ionicons name="briefcase-outline" size={15} color="#475569" />
                <Text style={styles.ownerLinkText}>Ingresso titolare</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.brandWrap}>
              <AppWordmark />
            </View>

            <Text style={styles.eyebrow}>Prenotazioni online del salone</Text>
            <Text style={styles.title}>Stai entrando come cliente, non nel gestionale.</Text>
            <Text style={styles.subtitle}>
              Usa il link o il QR ricevuto dal salone. Se hai solo il codice salone, inseriscilo qui sotto per aprire direttamente la tua area cliente.
            </Text>

            <View style={styles.highlightRow}>
              <View style={styles.highlightCardPrimary}>
                <Text style={styles.highlightTitle}>Prenota appuntamento</Text>
                <Text style={styles.highlightText}>Scegli servizio, data e orario disponibili.</Text>
              </View>
              <View style={styles.highlightCardSecondary}>
                <Text style={styles.highlightTitle}>Gestisci prenotazioni</Text>
                <Text style={styles.highlightText}>Controlla richieste, conferme e modifiche.</Text>
              </View>
            </View>
          </View>

          <View style={styles.accessCard}>
            <View style={styles.accessHeaderRow}>
              <View style={styles.accessIconWrap}>
                <Ionicons name="qr-code-outline" size={20} color="#1d4ed8" />
              </View>
              <View style={styles.accessHeaderTextWrap}>
                <Text style={styles.accessTitle}>Apri il tuo salone</Text>
                <Text style={styles.accessSubtitle}>Inserisci il codice salone ricevuto dal professionista oppure continua con il link cliente.</Text>
              </View>
            </View>

            <TextInput
              style={styles.codeInput}
              placeholder="Codice salone"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              value={salonCode}
              onChangeText={setSalonCode}
            />

            <TouchableOpacity style={styles.primaryButton} onPress={openClientArea} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>Accedi area cliente</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={openClientArea} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Prenota appuntamento</Text>
            </TouchableOpacity>

            <Text style={styles.supportText}>
              Se il salone ti ha inviato un QR o un link diretto, aprilo pure: entrerai subito nello spazio cliente corretto.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef4f8',
  },
  content: {
    flexGrow: 1,
    paddingTop: 36,
    paddingBottom: 72,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -120,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -140,
    left: -70,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    padding: 24,
    marginBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  clientBadge: {
    backgroundColor: '#0f172a',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  clientBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ownerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  ownerLinkText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  brandWrap: {
    marginBottom: 16,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    maxWidth: 720,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 20,
    maxWidth: 760,
  },
  highlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  highlightCardPrimary: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: '#dbeafe',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  highlightCardSecondary: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: '#dcfce7',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  highlightTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  highlightText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#334155',
  },
  accessCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 22,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  accessHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  accessIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  accessHeaderTextWrap: {
    flex: 1,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
  },
  accessSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 14,
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  supportText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
  },
});
