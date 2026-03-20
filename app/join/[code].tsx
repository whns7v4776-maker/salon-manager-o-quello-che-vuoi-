import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingEyebrow}>Area cliente</Text>
        <Text style={styles.text}>Sto preparando la pagina del tuo salone...</Text>
      </View>
    );
  }

  if (!valid) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Codice salone non valido o mancante</Text>
        <Text style={styles.note}>
          Controlla il link ricevuto dal salone oppure torna alla home cliente per inserire un codice valido.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Torna all'area cliente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.loadingEyebrow}>Area cliente</Text>
      <Text style={styles.success}>Benvenuto da {salonName || normalizedCode}</Text>
      <Text style={styles.text}>
        Continua come cliente per prenotare o gestire i tuoi appuntamenti.
      </Text>
      <Text style={styles.note}>
        Stai entrando come cliente. Non serve creare un nuovo salone o accedere al gestionale.
      </Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          router.replace({
            pathname: '/cliente',
            params: { salon: normalizedCode },
          })
        }
      >
        <Text style={styles.buttonText}>Apri area cliente</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#eef4f8',
  },
  loadingEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#2563eb',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 24,
  },
  success: {
    fontSize: 32,
    lineHeight: 38,
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
  },
  note: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 700,
  },
  button: {
    marginTop: 22,
    backgroundColor: '#111827',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});