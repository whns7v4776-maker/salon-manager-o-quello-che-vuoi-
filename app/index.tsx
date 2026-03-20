import { Redirect, useRouter, type Href } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
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
  const scrollRef = useRef<ScrollView | null>(null);
  const [salonCode, setSalonCode] = useState('');
  const [codeSectionY, setCodeSectionY] = useState(0);

  if (Platform.OS !== 'web') {
    return <Redirect href={isAuthenticated ? BACKOFFICE_ROUTE : OWNER_ROUTE} />;
  }

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);

  const scrollToCodeSection = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(codeSectionY - 18, 0), animated: true });
    });
  };

  const handleCodeSectionLayout = (event: LayoutChangeEvent) => {
    setCodeSectionY(event.nativeEvent.layout.y);
  };

  const openJoinWithCode = () => {
    if (!normalizedSalonCode) {
      scrollToCodeSection();
      return;
    }

    router.push({
      pathname: '/join/[code]',
      params: { code: normalizedSalonCode },
    });
  };

  const openClientArea = () => {
    router.push('/cliente');
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={undefined}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: responsive.horizontalPadding }]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: responsive.contentMaxWidth }]}> 
          <View style={styles.heroCard}>
            <View style={styles.brandWrap}>
              <AppWordmark />
            </View>

            <Text style={styles.eyebrow}>Area prenotazioni cliente</Text>
            <Text style={styles.title}>Prenota il tuo appuntamento in pochi secondi</Text>
            <Text style={styles.subtitle}>
              Scegli il tuo salone, prenota il servizio e gestisci facilmente i tuoi appuntamenti.
            </Text>

            <View style={styles.heroActionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={scrollToCodeSection} activeOpacity={0.9}>
                <Text style={styles.primaryButtonText}>Prenota ora</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={openClientArea} activeOpacity={0.88}>
                <Text style={styles.secondaryButtonText}>Accedi area cliente</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.inlineLinkButton} onPress={scrollToCodeSection} activeOpacity={0.8}>
              <Text style={styles.inlineLinkText}>Hai un codice salone? Inseriscilo qui</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.accessCard} onLayout={handleCodeSectionLayout}>
            <Text style={styles.accessTitle}>Entra nel tuo salone</Text>
            <Text style={styles.accessSubtitle}>
              Inserisci il codice che ti ha dato il salone per aprire la pagina corretta.
            </Text>

            <TextInput
              style={styles.codeInput}
              placeholder="Es. ABC123"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              value={salonCode}
              onChangeText={setSalonCode}
            />

            <TouchableOpacity
              style={[styles.primaryButton, !normalizedSalonCode && styles.primaryButtonDisabled]}
              onPress={openJoinWithCode}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>Continua</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.benefitsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tutto quello che ti serve, lato cliente</Text>
              <Text style={styles.sectionSubtitle}>Un ingresso semplice per prenotare e tenere tutto sotto controllo.</Text>
            </View>

            <View style={styles.benefitsGrid}>
              <View style={styles.benefitCard}>
                <Text style={styles.benefitTitle}>Prenota facilmente</Text>
                <Text style={styles.benefitText}>Apri il salone giusto, scegli il servizio e invia la richiesta in pochi passaggi.</Text>
              </View>
              <View style={styles.benefitCard}>
                <Text style={styles.benefitTitle}>Gestisci gli appuntamenti</Text>
                <Text style={styles.benefitText}>Controlla le tue richieste, lo stato delle conferme e le eventuali modifiche.</Text>
              </View>
              <View style={styles.benefitCard}>
                <Text style={styles.benefitTitle}>Resta collegato al tuo salone</Text>
                <Text style={styles.benefitText}>Tieni a portata di mano i riferimenti del salone e torna nella tua area cliente quando vuoi.</Text>
              </View>
            </View>
          </View>

          <View style={styles.reassuranceCard}>
            <Text style={styles.reassuranceTitle}>Una pagina semplice, pensata per i clienti</Text>
            <Text style={styles.reassuranceText}>
              Nessun gestionale complicato, nessuna configurazione tecnica. Qui puoi solo prenotare e gestire i tuoi appuntamenti nel tuo salone di fiducia.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLink}>Privacy</Text>
            <Text style={styles.footerLink}>Supporto</Text>
            <Text style={styles.footerLink}>Contatti</Text>
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
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 26,
    marginBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  brandWrap: {
    marginBottom: 20,
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
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
    maxWidth: 760,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 22,
    maxWidth: 760,
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  accessCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 22,
    marginBottom: 18,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  accessSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 16,
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
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonDisabled: {
    opacity: 0.92,
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLinkButton: {
    alignSelf: 'flex-start',
    marginTop: 14,
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#2563eb',
    fontWeight: '700',
  },
  benefitsSection: {
    marginBottom: 18,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 220,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d7e2ea',
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
  },
  benefitText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
  },
  reassuranceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 30,
    padding: 24,
    marginBottom: 22,
  },
  reassuranceTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
  },
  reassuranceText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#cbd5e1',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 10,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
});
