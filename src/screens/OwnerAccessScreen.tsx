import * as LocalAuthentication from 'expo-local-authentication';
import React, { useMemo, useRef, useState } from 'react';
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
import { getBiometricCopy, tApp } from '../lib/i18n';

export function OwnerAccessScreen() {
  const {
    appLanguage,
    biometricEnabled,
    loginOwnerAccount,
    registerOwnerAccount,
    requestOwnerPasswordReset,
    unlockOwnerAccountWithBiometric,
  } = useAppContext();
  const biometricCopy = getBiometricCopy(appLanguage, process.env.EXPO_OS === 'ios' ? 'ios' : 'generic');

  const scrollRef = useRef<ScrollView | null>(null);
  const registerCardY = useRef(0);
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
  const resetEmailRef = useRef<TextInput | null>(null);
  const registerFirstNameRef = useRef<TextInput | null>(null);
  const registerLastNameRef = useRef<TextInput | null>(null);
  const registerSalonNameRef = useRef<TextInput | null>(null);
  const registerBusinessPhoneRef = useRef<TextInput | null>(null);
  const registerStreetLineRef = useRef<TextInput | null>(null);
  const registerCityRef = useRef<TextInput | null>(null);
  const registerPostalCodeRef = useRef<TextInput | null>(null);
  const registerActivityCategoryRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const [activeMode, setActiveMode] = useState<'login' | 'register'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [registerFirstName, setRegisterFirstName] = useState('');
  const [registerLastName, setRegisterLastName] = useState('');
  const [registerSalonName, setRegisterSalonName] = useState('');
  const [registerBusinessPhone, setRegisterBusinessPhone] = useState('');
  const [registerStreetLine, setRegisterStreetLine] = useState('');
  const [registerCity, setRegisterCity] = useState('');
  const [registerPostalCode, setRegisterPostalCode] = useState('');
  const [registerActivityCategory, setRegisterActivityCategory] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [loadingAction, setLoadingAction] = useState<
    'login' | 'register' | 'reset' | 'biometric' | null
  >(null);

  const canSubmitLogin = useMemo(
    () => loginEmail.trim() !== '' && loginPassword.trim() !== '',
    [loginEmail, loginPassword]
  );
  const canSubmitRegister = useMemo(
    () =>
      registerFirstName.trim() !== '' &&
      registerLastName.trim() !== '' &&
      registerSalonName.trim() !== '' &&
      registerBusinessPhone.trim() !== '' &&
      registerStreetLine.trim() !== '' &&
      registerCity.trim() !== '' &&
      registerPostalCode.trim() !== '' &&
      registerActivityCategory.trim() !== '' &&
      registerEmail.trim() !== '' &&
      registerPassword.trim() !== '',
    [
      registerActivityCategory,
      registerBusinessPhone,
      registerCity,
      registerEmail,
      registerFirstName,
      registerLastName,
      registerPassword,
      registerPostalCode,
      registerSalonName,
      registerStreetLine,
    ]
  );
  const canSubmitReset = useMemo(() => resetEmail.trim() !== '', [resetEmail]);

  const scrollToRegisterCard = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(registerCardY.current - 18, 0),
        animated: true,
      });
    });
  };

  const handleLogin = async () => {
    if (!canSubmitLogin) return;
    setLoadingAction('login');
    const result = await loginOwnerAccount(loginEmail, loginPassword);
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert(
        tApp(appLanguage, 'auth_login_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_login_failed_body')
      );
    }
  };

  const handleRegister = async () => {
    if (!canSubmitRegister) return;
    setLoadingAction('register');
    const result = await registerOwnerAccount({
      firstName: registerFirstName,
      lastName: registerLastName,
      salonName: registerSalonName,
      businessPhone: registerBusinessPhone,
      streetLine: registerStreetLine,
      city: registerCity,
      postalCode: registerPostalCode,
      activityCategory: registerActivityCategory,
      email: registerEmail,
      password: registerPassword,
    });
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert(
        tApp(appLanguage, 'auth_register_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_register_failed_body')
      );
      return;
    }

    setLoginEmail(result.email ?? registerEmail.trim());
    setLoginPassword('');
    setRegisterPassword('');
    setShowRegister(false);
    setShowReset(false);
    setActiveMode('login');

    Alert.alert(
      tApp(appLanguage, 'auth_register_success_title'),
      `${tApp(appLanguage, 'auth_register_success_body')}\n\nOra accedi con le credenziali appena create.`
    );
  };

  const handleResetPassword = async () => {
    if (!canSubmitReset) return;
    setLoadingAction('reset');
    const result = await requestOwnerPasswordReset(resetEmail);
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert(
        tApp(appLanguage, 'auth_reset_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_register_failed_body')
      );
      return;
    }

    Alert.alert(
      tApp(appLanguage, 'auth_reset_ready_title'),
      result.backendRequired
        ? tApp(appLanguage, 'auth_reset_ready_backend')
        : tApp(appLanguage, 'auth_reset_ready_email')
    );
  };

  const handleBiometricLogin = async () => {
    setLoadingAction('biometric');

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      setLoadingAction(null);
      Alert.alert(tApp(appLanguage, 'settings_biometric_unavailable_title'), biometricCopy.unavailable);
      return;
    }

    const biometricResult = await LocalAuthentication.authenticateAsync({
      promptMessage: biometricCopy.login,
      cancelLabel: tApp(appLanguage, 'common_cancel'),
      fallbackLabel: 'Usa password',
      disableDeviceFallback: false,
    });

    if (!biometricResult.success) {
      setLoadingAction(null);
      return;
    }

    const result = await unlockOwnerAccountWithBiometric();
    setLoadingAction(null);

    if (!result.ok) {
      Alert.alert(
        tApp(appLanguage, 'auth_login_failed_title'),
        result.error ?? tApp(appLanguage, 'auth_login_failed_body')
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={Keyboard.dismiss}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>{tApp(appLanguage, 'auth_badge')}</Text>
              </View>
            </View>

            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>{tApp(appLanguage, 'auth_eyebrow')}</Text>
              <View style={styles.heroBrandWrap}>
                <AppWordmark />
              </View>
              <Text style={styles.heroSubtitle}>
                {tApp(appLanguage, 'auth_subtitle')}
              </Text>
            </View>

            <View style={styles.heroHighlights}>
              <View style={[styles.heroHighlightPill, styles.heroHighlightPillBlue]}>
                <Text style={[styles.heroHighlightText, styles.heroHighlightTextBlue]}>
                  {tApp(appLanguage, 'auth_highlight_agenda')}
                </Text>
              </View>
              <View style={[styles.heroHighlightPill, styles.heroHighlightPillMint]}>
                <Text style={[styles.heroHighlightText, styles.heroHighlightTextMint]}>
                  {tApp(appLanguage, 'auth_highlight_clients')}
                </Text>
              </View>
              <View style={[styles.heroHighlightPill, styles.heroHighlightPillRose]}>
                <Text style={[styles.heroHighlightText, styles.heroHighlightTextRose]}>
                  {tApp(appLanguage, 'auth_highlight_owner')}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[
                styles.modeSwitchButton,
                activeMode === 'login' && styles.modeSwitchButtonActive,
              ]}
              onPress={() => {
                setActiveMode('login');
                setShowRegister(false);
              }}
              activeOpacity={0.9}
            >
              <Text
                style={[
                  styles.modeSwitchButtonText,
                  activeMode === 'login' && styles.modeSwitchButtonTextActive,
                ]}
              >
                {tApp(appLanguage, 'auth_mode_login')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeSwitchButton,
                activeMode === 'register' && styles.modeSwitchButtonActive,
              ]}
              onPress={() => {
                setActiveMode('register');
                setShowRegister(true);
                scrollToRegisterCard();
              }}
              activeOpacity={0.9}
            >
              <Text
                style={[
                  styles.modeSwitchButtonText,
                  activeMode === 'register' && styles.modeSwitchButtonTextActive,
                ]}
              >
                {tApp(appLanguage, 'auth_mode_register')}
              </Text>
            </TouchableOpacity>
          </View>

          <View
            style={styles.card}
            onLayout={(event) => {
              registerCardY.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionTopRow}>
              <View style={styles.sectionTopText}>
                <Text style={styles.cardTitle}>{tApp(appLanguage, 'auth_login_title')}</Text>
                <Text style={styles.cardSubtitle}>
                  {tApp(appLanguage, 'auth_login_subtitle')}
                </Text>
              </View>
            </View>

            <TextInput
              ref={loginEmailRef}
              style={styles.input}
              placeholder={tApp(appLanguage, 'auth_email_placeholder')}
              placeholderTextColor="#98a2b3"
              autoCapitalize="none"
              keyboardType="email-address"
              value={loginEmail}
              onChangeText={setLoginEmail}
              returnKeyType="next"
              onSubmitEditing={() => loginPasswordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <TextInput
              ref={loginPasswordRef}
              style={styles.input}
              placeholder={tApp(appLanguage, 'auth_password_placeholder')}
              placeholderTextColor="#98a2b3"
              secureTextEntry
              value={loginPassword}
              onChangeText={setLoginPassword}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TouchableOpacity
              style={[styles.primaryButton, !canSubmitLogin && styles.primaryButtonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.9}
              disabled={!canSubmitLogin || loadingAction !== null}
            >
              <Text style={styles.primaryButtonText}>
                {loadingAction === 'login'
                  ? tApp(appLanguage, 'auth_login_loading')
                  : tApp(appLanguage, 'auth_login_button')}
              </Text>
            </TouchableOpacity>

            {biometricEnabled ? (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
                activeOpacity={0.9}
                disabled={loadingAction !== null}
              >
                <Text style={styles.biometricButtonText}>
                  {loadingAction === 'biometric'
                    ? tApp(appLanguage, 'auth_biometric_loading')
                    : biometricCopy.login}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setShowReset((current) => !current)}
              activeOpacity={0.8}
            >
              <Text style={styles.linkButtonText}>{tApp(appLanguage, 'auth_forgot_password')}</Text>
            </TouchableOpacity>

            {showReset ? (
              <View style={styles.inlinePanel}>
                <Text style={styles.inlinePanelTitle}>{tApp(appLanguage, 'auth_reset_title')}</Text>
                <Text style={styles.inlinePanelText}>
                  {tApp(appLanguage, 'auth_reset_subtitle')}
                </Text>

                <TextInput
                  ref={resetEmailRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_reset_email_placeholder')}
                  placeholderTextColor="#98a2b3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    !canSubmitReset && styles.secondaryButtonDisabled,
                  ]}
                  onPress={handleResetPassword}
                  activeOpacity={0.9}
                  disabled={!canSubmitReset || loadingAction !== null}
                >
                  <Text style={styles.secondaryButtonText}>
                    {loadingAction === 'reset'
                      ? tApp(appLanguage, 'auth_reset_loading')
                      : tApp(appLanguage, 'auth_reset_button')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.registerHeader}>
              <View style={styles.registerHeaderText}>
                <Text style={styles.cardTitle}>{tApp(appLanguage, 'auth_register_title')}</Text>
                <Text style={styles.cardSubtitle}>
                  {tApp(appLanguage, 'auth_register_subtitle')}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.outlineButton}
                onPress={() => {
                  const nextShowRegister = !showRegister;
                  setShowRegister(nextShowRegister);
                  setActiveMode(nextShowRegister ? 'register' : 'login');
                  if (nextShowRegister) {
                    scrollToRegisterCard();
                  }
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.outlineButtonText}>
                  {showRegister
                    ? tApp(appLanguage, 'auth_register_close')
                    : tApp(appLanguage, 'auth_register_open')}
                </Text>
              </TouchableOpacity>
            </View>

            {showRegister ? (
              <View style={styles.registerForm}>
                <TextInput
                  ref={registerFirstNameRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_first_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerFirstName}
                  onChangeText={setRegisterFirstName}
                  returnKeyType="next"
                  onSubmitEditing={() => registerLastNameRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerLastNameRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_last_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerLastName}
                  onChangeText={setRegisterLastName}
                  returnKeyType="next"
                  onSubmitEditing={() => registerSalonNameRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerSalonNameRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_salon_name_placeholder')}
                  placeholderTextColor="#98a2b3"
                  value={registerSalonName}
                  onChangeText={setRegisterSalonName}
                  returnKeyType="next"
                  onSubmitEditing={() => registerBusinessPhoneRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerBusinessPhoneRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_business_phone_placeholder')}
                  placeholderTextColor="#98a2b3"
                  keyboardType="phone-pad"
                  value={registerBusinessPhone}
                  onChangeText={setRegisterBusinessPhone}
                  returnKeyType="next"
                  onSubmitEditing={() => registerStreetLineRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerStreetLineRef}
                  style={styles.input}
                  placeholder="Via e n. civico"
                  placeholderTextColor="#98a2b3"
                  value={registerStreetLine}
                  onChangeText={setRegisterStreetLine}
                  returnKeyType="next"
                  onSubmitEditing={() => registerCityRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerCityRef}
                  style={styles.input}
                  placeholder="Città"
                  placeholderTextColor="#98a2b3"
                  value={registerCity}
                  onChangeText={setRegisterCity}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => registerPostalCodeRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerPostalCodeRef}
                  style={styles.input}
                  placeholder="CAP"
                  placeholderTextColor="#98a2b3"
                  keyboardType="number-pad"
                  value={registerPostalCode}
                  onChangeText={setRegisterPostalCode}
                  returnKeyType="next"
                  onSubmitEditing={() => registerActivityCategoryRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerActivityCategoryRef}
                  style={styles.input}
                  placeholder="Categoria attivita"
                  placeholderTextColor="#98a2b3"
                  value={registerActivityCategory}
                  onChangeText={setRegisterActivityCategory}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => registerEmailRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerEmailRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_email_placeholder')}
                  placeholderTextColor="#98a2b3"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={registerEmail}
                  onChangeText={setRegisterEmail}
                  returnKeyType="next"
                  onSubmitEditing={() => registerPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TextInput
                  ref={registerPasswordRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'auth_password_placeholder')}
                  placeholderTextColor="#98a2b3"
                  secureTextEntry
                  value={registerPassword}
                  onChangeText={setRegisterPassword}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />

                <Text style={styles.helperText}>
                  {tApp(appLanguage, 'auth_register_helper')}
                </Text>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    !canSubmitRegister && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleRegister}
                  activeOpacity={0.9}
                  disabled={!canSubmitRegister || loadingAction !== null}
                >
                  <Text style={styles.primaryButtonText}>
                    {loadingAction === 'register'
                      ? tApp(appLanguage, 'auth_register_loading')
                      : tApp(appLanguage, 'auth_register_button')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -80,
    right: -30,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#dbeafe',
    opacity: 0.65,
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: '#d1fae5',
    opacity: 0.45,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 68,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 34,
    padding: 22,
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 14,
  },
  heroChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  heroChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5563',
  },
  hero: {
    marginBottom: 18,
    alignItems: 'center',
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#6b7280',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroBrandWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#667085',
    maxWidth: 460,
    textAlign: 'center',
  },
  heroHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  heroHighlightPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
  },
  heroHighlightPillBlue: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  heroHighlightPillMint: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  heroHighlightPillRose: {
    backgroundColor: '#fce7f3',
    borderColor: '#fbcfe8',
  },
  heroHighlightText: {
    fontSize: 12,
    fontWeight: '800',
  },
  heroHighlightTextBlue: {
    color: '#075985',
  },
  heroHighlightTextMint: {
    color: '#166534',
  },
  heroHighlightTextRose: {
    color: '#9d174d',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  modeSwitch: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 6,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  modeSwitchButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  modeSwitchButtonActive: {
    backgroundColor: '#111827',
  },
  modeSwitchButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#6b7280',
    textAlign: 'center',
  },
  modeSwitchButtonTextActive: {
    color: '#ffffff',
  },
  cardTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#667085',
    marginBottom: 12,
    textAlign: 'center',
  },
  sectionTopRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sectionTopText: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
  },
  sectionMiniChip: {
    alignSelf: 'center',
    backgroundColor: '#eef6f5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  sectionMiniChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f766e',
  },
  input: {
    backgroundColor: '#f7f7f8',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#2f2f2f',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  biometricButton: {
    marginTop: 12,
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9e1ea',
  },
  biometricButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  linkButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f766e',
    textAlign: 'center',
  },
  inlinePanel: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'center',
  },
  inlinePanelTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  inlinePanelText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#667085',
    marginBottom: 12,
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.45,
  },
  secondaryButtonText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  registerHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerHeaderText: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 0,
  },
  outlineButton: {
    backgroundColor: '#eef6f5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 2,
  },
  outlineButtonText: {
    color: '#0f766e',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  registerForm: {
    marginTop: 10,
  },
  helperText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#667085',
    marginBottom: 4,
    textAlign: 'center',
  },
});
