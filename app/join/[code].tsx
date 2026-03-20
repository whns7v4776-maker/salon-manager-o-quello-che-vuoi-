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
        <Text style={styles.text}>Collegamento al salone in corso...</Text>
      </View>
    );
  }

  if (!valid) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Codice salone non valido o mancante</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/')}>
          <Text style={styles.buttonText}>Torna alla home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <Text style={styles.success}>Salone collegato</Text>
      <Text style={styles.code}>{salonName || normalizedCode}</Text>
      <Text style={styles.text}>Apertura frontend cliente...</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          router.replace({
            pathname: '/cliente',
            params: { salon: normalizedCode },
          })
        }
      >
        <Text style={styles.buttonText}>Apri frontend cliente</Text>
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
    backgroundColor: '#f4f4f4',
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#444',
  },
  success: {
    fontSize: 24,
    fontWeight: '800',
    color: '#15803d',
    textAlign: 'center',
  },
  error: {
    fontSize: 18,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  code: {
    marginTop: 10,
    fontSize: 16,
    color: '#111',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#111827',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
});