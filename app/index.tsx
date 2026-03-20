import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputSubmitEditingEventData,
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
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);

  if (Platform.OS !== 'web') {
    return <Redirect href={isAuthenticated ? BACKOFFICE_ROUTE : OWNER_ROUTE} />;
  }

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);
  const showCodeError = codeTouched && normalizedSalonCode === '';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    document.title = 'Area cliente | Prenotazioni online';

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }

    metaDescription.setAttribute(
      'content',
      'Scegli il tuo salone, prenota il servizio e gestisci facilmente i tuoi appuntamenti online.'
    );
  }, []);

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
      setCodeTouched(true);
      scrollToCodeSection();
      return;
    }

    router.push({
      pathname: '/join/[code]',
      params: { code: normalizedSalonCode },
    });
  };

  const handleCodeSubmit = (_event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    setCodeTouched(true);
    openJoinWithCode();
  };

  const handleCodePress = () => {
    handleCodeSubmit();
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
        <View style={[styles.shell, { maxWidth: Math.min(responsive.contentMaxWidth, 980) }]}> 
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
              <TouchableOpacity style={[styles.primaryButton, styles.heroPrimaryButton]} onPress={scrollToCodeSection} activeOpacity={0.9}>
                <Text style={styles.primaryButtonText}>Prenota ora</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, styles.heroSecondaryButton]} onPress={openClientArea} activeOpacity={0.88}>
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
              style={[styles.codeInput, codeFocused && styles.codeInputFocused, showCodeError && styles.codeInputError]}
              placeholder="Inserisci codice salone (es. ABC123)"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              value={salonCode}
              onChangeText={(value) => {
                setSalonCode(value.replace(/\s+/g, '').toUpperCase());
                if (!codeTouched) {
                  return;
                }

                setCodeTouched(false);
              }}
              onFocus={() => setCodeFocused(true)}
              onBlur={() => setCodeFocused(false)}
              returnKeyType="go"
              onSubmitEditing={handleCodeSubmit}
            />

            {showCodeError ? (
              <Text style={styles.codeErrorText}>Inserisci un codice salone per continuare.</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, !normalizedSalonCode && styles.primaryButtonDisabled]}
              onPress={handleCodePress}
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
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="flash-outline" size={18} color="#6d28d9" />
                </View>
                <Text style={styles.benefitTitle}>Prenota facilmente</Text>
                <Text style={styles.benefitText}>Apri il salone giusto, scegli il servizio e invia la richiesta in pochi passaggi.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="calendar-clear-outline" size={18} color="#0f766e" />
                </View>
                <Text style={styles.benefitTitle}>Gestisci gli appuntamenti</Text>
                <Text style={styles.benefitText}>Controlla le tue richieste, lo stato delle conferme e le eventuali modifiche.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color="#1d4ed8" />
                </View>
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
    paddingTop: 52,
    paddingBottom: 88,
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
    borderRadius: 34,
    paddingHorizontal: 28,
    paddingTop: 34,
    paddingBottom: 32,
    marginBottom: 22,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
    alignItems: 'center',
  },
  brandWrap: {
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 14,
    maxWidth: 760,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 22,
    maxWidth: 760,
    textAlign: 'center',
  },
  heroActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  heroPrimaryButton: {
    minWidth: 188,
  },
  heroSecondaryButton: {
    minWidth: 188,
  },
  accessCard: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 26,
    paddingVertical: 28,
    marginBottom: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  accessSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: 520,
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
    width: '100%',
    maxWidth: 520,
    shadowColor: '#0f172a',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  codeInputFocused: {
    borderColor: '#1d4ed8',
    backgroundColor: '#ffffff',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  codeInputError: {
    borderColor: '#dc2626',
  },
  codeErrorText: {
    width: '100%',
    maxWidth: 520,
    marginTop: -4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#b91c1c',
    textAlign: 'left',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
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
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d7e2ea',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLinkButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#2563eb',
    fontWeight: '700',
    textAlign: 'center',
  },
  benefitsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 620,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 250,
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d7e2ea',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    minHeight: 188,
  },
  benefitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
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
    borderRadius: 34,
    paddingHorizontal: 28,
    paddingVertical: 30,
    marginBottom: 28,
    alignItems: 'center',
  },
  reassuranceTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  reassuranceText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#cbd5e1',
    textAlign: 'center',
    maxWidth: 720,
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
