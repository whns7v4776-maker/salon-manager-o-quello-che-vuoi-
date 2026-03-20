import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { normalizeSalonCode } from '../../src/lib/platform';

export default function JoinSalonScreen() {
  const params = useLocalSearchParams();
  const codeParam = params.code;
  const code = Array.isArray(codeParam) ? codeParam[0] : codeParam;
  const normalizedCode = useMemo(() => normalizeSalonCode(code ?? ''), [code]);
  const { resolveSalonByCode } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState<boolean | null>(null);
  const [salonName, setSalonName] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    document.title = salonName
      ? `Benvenuto da ${salonName} | Area cliente`
      : 'Area cliente | Salone';

    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }

    metaDescription.setAttribute(
      'content',
      salonName
        ? `Continua come cliente da ${salonName} per prenotare o gestire i tuoi appuntamenti.`
        : 'Continua come cliente per prenotare o gestire i tuoi appuntamenti nel salone corretto.'
    );
  }, [salonName]);

  const openClientArea = () =>
    router.replace({
      pathname: '/cliente',
      params: { salon: normalizedCode },
    });

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        if (!normalizedCode) {
          setValid(false);
          setLoading(false);
          return;
        }

        const resolved = await resolveSalonByCode(normalizedCode);

        if (!active) {
          return;
        }

        if (!resolved) {
          setValid(false);
          setSalonName('');
          return;
        }

        setValid(true);
        setSalonName(resolved.workspace.salonName);

        setTimeout(() => {
          router.replace({
            pathname: '/cliente',
            params: { salon: normalizedCode },
          });
        }, 220);
      } catch (error) {
        console.log('Errore join:', error);
        if (active) {
          setValid(false);
          setSalonName('');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    run();

    return () => {
      active = false;
    };
  }, [normalizedCode, resolveSalonByCode]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.card}>
          <View style={styles.loadingSpinnerWrap}>
        <ActivityIndicator size="large" />
          </View>
          <Text style={styles.loadingEyebrow}>Area cliente</Text>
          <Text style={styles.loadingTitle}>Sto preparando la pagina del tuo salone...</Text>
          <Text style={styles.subtitle}>Tra un attimo entrerai nello spazio giusto per prenotare o gestire i tuoi appuntamenti.</Text>
        </View>
      </View>
    );
  }

  if (!valid) {
    return (
      <View style={styles.screen}>
        <View style={styles.backgroundGlowTop} />
        <View style={styles.backgroundGlowBottom} />
        <View style={styles.card}>
          <View style={styles.inlineBadge}>
            <Text style={styles.inlineBadgeText}>Area cliente</Text>
          </View>
          <Text style={styles.error}>Codice salone non valido o mancante</Text>
          <Text style={styles.note}>
          Controlla il link ricevuto dal salone oppure torna alla home cliente per inserire un codice valido.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Torna all'area cliente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <View style={styles.card}>
        <View style={styles.inlineBadge}>
          <Text style={styles.inlineBadgeText}>Area cliente</Text>
        </View>
        <Text style={styles.success}>{salonName ? `Benvenuto da ${salonName}` : 'Benvenuto nel tuo salone'}</Text>
        <Text style={styles.subtitle}>
          Continua come cliente per prenotare o gestire i tuoi appuntamenti.
        </Text>

        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={openClientArea} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Prenota appuntamento</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={openClientArea} activeOpacity={0.88}>
            <Text style={styles.secondaryButtonText}>Accedi</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.saloonChip}>
          <Ionicons name="sparkles-outline" size={16} color="#1d4ed8" />
          <Text style={styles.saloonChipText}>{salonName || normalizedCode}</Text>
        </View>

        <Text style={styles.note}>
          Stai entrando come cliente. Non serve creare un nuovo salone o accedere al gestionale.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#eef4f8',
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
  card: {
    width: '100%',
    maxWidth: 760,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 28,
    paddingVertical: 34,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  loadingEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  loadingSpinnerWrap: {
    marginBottom: 18,
  },
  loadingTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 620,
  },
  success: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    maxWidth: 680,
  },
  error: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
    maxWidth: 620,
  },
  note: {
    marginTop: 18,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 640,
  },
  inlineBadge: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 18,
  },
  inlineBadgeText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 22,
  },
  primaryButton: {
    minWidth: 210,
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 160,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 15,
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
  saloonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  saloonChipText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
});