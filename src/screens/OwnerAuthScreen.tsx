import React, { useRef, useState } from 'react';
import {
    Alert,
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
import { AppWordmark } from '../../components/app-wordmark';
import { useAppContext } from '../context/AppContext';

const EMPTY_LOGIN = {
  email: '',
  password: '',
};

const EMPTY_REGISTER = {
  firstName: '',
  lastName: '',
  salonName: '',
  businessPhone: '',
  email: '',
  password: '',
};

export default function OwnerAuthScreen() {
  const { loginOwnerAccount, registerOwnerAccount, requestOwnerPasswordReset } = useAppContext();
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
  const resetEmailRef = useRef<TextInput | null>(null);
  const registerFirstNameRef = useRef<TextInput | null>(null);
  const registerLastNameRef = useRef<TextInput | null>(null);
  const registerSalonNameRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerBusinessPhoneRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const [login, setLogin] = useState(EMPTY_LOGIN);
  const [register, setRegister] = useState(EMPTY_REGISTER);
  const [resetEmail, setResetEmail] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const handleLogin = async () => {
    const result = await loginOwnerAccount(login.email, login.password);
    if (!result.ok) {
      Alert.alert('Accesso non riuscito', result.error ?? 'Controlla i dati e riprova.');
      return;
    }
  };

  const handleRegister = async () => {
    const result = await registerOwnerAccount(register);
    if (!result.ok) {
      Alert.alert('Registrazione non riuscita', result.error ?? 'Controlla i dati e riprova.');
      return;
    }
  };

  const handleReset = async () => {
    const result = await requestOwnerPasswordReset(resetEmail);
    if (!result.ok) {
      Alert.alert('Recupero password', result.error ?? 'Controlla la mail e riprova.');
      return;
    }

    if (result.backendRequired) {
      Alert.alert(
        'Recupero password',
        'La schermata è pronta, ma l’invio reale della mail si attiverà quando colleghiamo il backend.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.appEyebrow}>SALON PRO</Text>
          <View style={styles.appWordmarkWrap}>
            <AppWordmark />
          </View>
          <Text style={styles.appSubtitle}>
            Gestisci il tuo salone da un’unica app: agenda, clienti, cassa e prenotazioni.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accedi</Text>
          <TextInput
            ref={loginEmailRef}
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9a9a9a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={login.email}
            onChangeText={(value) => setLogin((current) => ({ ...current, email: value }))}
            returnKeyType="next"
            onSubmitEditing={() => loginPasswordRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={loginPasswordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9a9a9a"
            secureTextEntry
            value={login.password}
            onChangeText={(value) => setLogin((current) => ({ ...current, password: value }))}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Accedi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setShowReset((current) => !current);
              if (!showReset) {
                setShowRegister(false);
              }
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.linkButtonText}>Password dimenticata?</Text>
          </TouchableOpacity>
        </View>

        {showReset ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recupera password</Text>
            <Text style={styles.helperText}>
              Inserisci la mail dell’account. Il flusso mail reale lo collegheremo al backend finale.
            </Text>
            <TextInput
              ref={resetEmailRef}
              style={styles.input}
              placeholder="Email account"
              placeholderTextColor="#9a9a9a"
              autoCapitalize="none"
              keyboardType="email-address"
              value={resetEmail}
              onChangeText={setResetEmail}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <TouchableOpacity style={styles.secondaryButton} onPress={handleReset} activeOpacity={0.9}>
              <Text style={styles.secondaryButtonText}>Invia richiesta</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.registerToggle}
            onPress={() => {
              setShowRegister((current) => !current);
              if (!showRegister) {
                setShowReset(false);
              }
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.cardTitle}>Registrati</Text>
            <Text style={styles.toggleText}>{showRegister ? 'Chiudi' : 'Apri'}</Text>
          </TouchableOpacity>

          {showRegister ? (
            <>
              <TextInput
                ref={registerFirstNameRef}
                style={styles.input}
                placeholder="Nome"
                placeholderTextColor="#9a9a9a"
                value={register.firstName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, firstName: value }))
                }
                returnKeyType="next"
                onSubmitEditing={() => registerLastNameRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerLastNameRef}
                style={styles.input}
                placeholder="Cognome"
                placeholderTextColor="#9a9a9a"
                value={register.lastName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, lastName: value }))
                }
                returnKeyType="next"
                onSubmitEditing={() => registerSalonNameRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerSalonNameRef}
                style={styles.input}
                placeholder="Nome salone"
                placeholderTextColor="#9a9a9a"
                value={register.salonName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, salonName: value }))
                }
                returnKeyType="next"
                onSubmitEditing={() => registerEmailRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerEmailRef}
                style={styles.input}
                placeholder="Mail"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                keyboardType="email-address"
                value={register.email}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, email: value }))
                }
                returnKeyType="next"
                onSubmitEditing={() => registerBusinessPhoneRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerBusinessPhoneRef}
                style={styles.input}
                placeholder="Numero cellulare azienda"
                placeholderTextColor="#9a9a9a"
                keyboardType="phone-pad"
                value={register.businessPhone}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, businessPhone: value }))
                }
                returnKeyType="next"
                onSubmitEditing={() => registerPasswordRef.current?.focus()}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerPasswordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9a9a9a"
                secureTextEntry
                value={register.password}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, password: value }))
                }
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleRegister}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>Crea account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.helperText}>
              Nome, cognome, nome salone e mail sono obbligatori. Dopo la registrazione entri
              direttamente nell’app.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  content: {
    padding: 20,
    paddingTop: 44,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 32,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  appEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: '#9a6b32',
    marginBottom: 10,
  },
  appWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#665d54',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 10,
    color: '#111111',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f766e',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6d6257',
  },
  registerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f766e',
  },
});
