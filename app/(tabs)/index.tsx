import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { useAppContext } from '../../src/context/AppContext';
import { salonNameFontOptions } from '../../src/lib/fonts';
import { getBiometricCopy, tApp } from '../../src/lib/i18n';
import { formatSalonAddress } from '../../src/lib/platform';
import { useResponsiveLayout } from '../../src/lib/responsive';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateString?: string) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

const formatMinutes = (value?: number) => {
  if (!value) return '—';
  if (value === 30) return '30 min';
  if (value === 60) return '1 ora';

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  return hours > 0 ? `${hours}h` : `${minutes} min`;
};

const buildClientInviteMessage = ({
  brandName,
  salonCode,
  salonClientLink,
  isPublicWebEnabled,
}: {
  brandName: string;
  salonCode: string;
  salonClientLink: string;
  isPublicWebEnabled: boolean;
}) =>
  isPublicWebEnabled
    ? `Ciao! Prenota da ${brandName} aprendo questo link nel browser:\n${salonClientLink}\n\nCodice salone: ${salonCode}`
    : `Ciao! Prenota da ${brandName} usando questo link diretto:\n${salonClientLink}\n\nCodice salone: ${salonCode}`;

const toUppercaseField = (value: string) => value.toLocaleUpperCase('it-IT');
const BIOMETRIC_PROMPT_SEEN_KEY = 'salon_manager_biometric_prompt_seen';
const buildAccountScopedKey = (baseKey: string, accountEmail: string) =>
  `${baseKey}__${accountEmail.trim().toLowerCase()}`;

export default function HomeScreen() {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const scrollRef = useRef<ScrollView | null>(null);
  const salonNameFieldRef = useRef<TextInput | null>(null);
  const activityCategoryFieldRef = useRef<TextInput | null>(null);
  const businessPhoneFieldRef = useRef<TextInput | null>(null);
  const streetLineFieldRef = useRef<TextInput | null>(null);
  const cityFieldRef = useRef<TextInput | null>(null);
  const postalCodeFieldRef = useRef<TextInput | null>(null);
  const accountEmailFieldRef = useRef<TextInput | null>(null);
  const biometricPromptShownRef = useRef(false);

  const {
    clienti,
    appuntamenti,
    movimenti,
    servizi,
    salonAccountEmail,
    salonWorkspace,
    setSalonWorkspace,
    biometricEnabled,
    setBiometricEnabled,
    switchSalonAccount,
    appLanguage,
  } = useAppContext();

  const [loadingSalon, setLoadingSalon] = useState(false);
  const [savingSalon, setSavingSalon] = useState(false);

  const [accountEmailInput, setAccountEmailInput] = useState(salonAccountEmail);
  const [salonNameInput, setSalonNameInput] = useState(salonWorkspace.salonName);
  const [salonNameDisplayStyleInput] = useState<'corsivo' | 'stampatello' | 'minuscolo'>(
    salonWorkspace.salonNameDisplayStyle
  );
  const [salonNameFontVariantInput, setSalonNameFontVariantInput] = useState(
    salonWorkspace.salonNameFontVariant
  );
  const [businessPhoneInput, setBusinessPhoneInput] = useState(salonWorkspace.businessPhone);
  const [activityCategoryInput, setActivityCategoryInput] = useState(
    toUppercaseField(salonWorkspace.activityCategory)
  );
  const [streetLineInput, setStreetLineInput] = useState(
    [salonWorkspace.streetType, salonWorkspace.streetName].filter(Boolean).join(' ').trim()
  );
  const [cityInput, setCityInput] = useState(toUppercaseField(salonWorkspace.city));
  const [postalCodeInput, setPostalCodeInput] = useState(salonWorkspace.postalCode);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isEditingSalonProfile, setIsEditingSalonProfile] = useState(false);
  const [showProfileSection, setShowProfileSection] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);

  const oggi = getTodayDateString();
  const numeroClienti = clienti.length;
  const numeroAppuntamenti = appuntamenti.length;

  const incassoTotale = useMemo(
    () => movimenti.reduce((totale, movimento) => totale + movimento.importo, 0),
    [movimenti]
  );

  const appuntamentiOggi = useMemo(
    () =>
      appuntamenti
        .filter((item) => item.data === oggi)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [appuntamenti, oggi]
  );

  const appuntamentiIncassati = appuntamenti.filter((item) => item.incassato).length;
  const appuntamentiDaIncassare = appuntamenti.filter((item) => !item.incassato).length;

  const valoreDaIncassare = useMemo(
    () =>
      appuntamenti
        .filter((item) => !item.incassato)
        .reduce((totale, item) => totale + item.prezzo, 0),
    [appuntamenti]
  );

  const prossimoAppuntamento = appuntamentiOggi[0];
  const ultimoCliente = clienti[0];

  const servizioTop = useMemo(() => {
    const counts = appuntamenti.reduce<Record<string, number>>((acc, item) => {
      acc[item.servizio] = (acc[item.servizio] ?? 0) + 1;
      return acc;
    }, {});

    const [nome, count] =
      Object.entries(counts).sort((first, second) => second[1] - first[1])[0] ?? [];

    if (!nome || !count) return null;

    const servizio = servizi.find((item) => item.nome === nome);
    return {
      nome,
      count,
      durataMinuti: servizio?.durataMinuti,
    };
  }, [appuntamenti, servizi]);

  const mediaScontrino = useMemo(() => {
    if (movimenti.length === 0) return 0;
    return incassoTotale / movimenti.length;
  }, [incassoTotale, movimenti.length]);

  const livelloOperativo = useMemo(() => {
    if (appuntamentiOggi.length >= 5) {
      return {
        label: 'Giornata piena',
        tone: styles.statusHot,
        textTone: styles.statusHotText,
      };
    }

    if (appuntamentiOggi.length >= 2) {
      return {
        label: 'Buon ritmo',
        tone: styles.statusWarm,
        textTone: styles.statusWarmText,
      };
    }

    return {
      label: 'Spazio libero',
      tone: styles.statusCalm,
      textTone: styles.statusCalmText,
    };
  }, [appuntamentiOggi.length]);

  useEffect(() => {
    setAccountEmailInput(salonAccountEmail);
  }, [salonAccountEmail]);

  const salvaDatiSalone = async () => {
    if (
      !salonNameInput.trim() ||
      !activityCategoryInput.trim() ||
      !businessPhoneInput.trim() ||
      !streetLineInput.trim() ||
      !cityInput.trim() ||
      !postalCodeInput.trim()
    ) {
      Alert.alert(
        'Profilo salone incompleto',
        'Compila nome salone, categoria attività, cellulare azienda, via e nome strada, comune e CAP prima di salvare.'
      );
      return;
    }

    try {
      setSavingSalon(true);

      const formattedAddress = formatSalonAddress({
        streetType: '',
        streetName: streetLineInput,
        streetNumber: '',
        city: cityInput,
        postalCode: postalCodeInput,
        salonAddress: '',
      });

      setSavingSalon(false);

      setSalonWorkspace((current) => ({
        ...current,
        salonName: salonNameInput.trim(),
        salonNameDisplayStyle: salonNameDisplayStyleInput,
        salonNameFontVariant: salonNameFontVariantInput,
        ownerEmail: accountEmailInput.trim().toLowerCase(),
        businessPhone: businessPhoneInput.trim(),
        activityCategory: toUppercaseField(activityCategoryInput.trim()),
        streetType: '',
        streetName: toUppercaseField(streetLineInput.trim()),
        streetNumber: '',
        city: toUppercaseField(cityInput.trim()),
        postalCode: postalCodeInput.trim(),
        salonAddress: formattedAddress,
        updatedAt: new Date().toISOString(),
      }));

      Alert.alert(
        'Profilo salvato',
        'Dati salone aggiornati. La pubblicazione verso il portale cliente avviene automaticamente.'
      );
      setIsEditingSalonProfile(false);
      setShowProfileSection(false);
    } catch (e: any) {
      setSavingSalon(false);
      Alert.alert('Errore generale', e.message ?? 'Errore durante il salvataggio');
    }
  };

  const salvaAccountSalone = async () => {
    const success = await switchSalonAccount(accountEmailInput);

    if (!success) {
      Alert.alert(
        'Email non valida',
        'Inserisci una mail valida per separare correttamente i dati del salone.'
      );
      return;
    }

    Alert.alert(
      'Account aggiornato',
      `Ora l'app usa il profilo ${accountEmailInput.trim().toLowerCase()}.`
    );
  };

  const aggiornaStatoWorkspace = (
    status: 'active' | 'suspended' | 'expired',
    plan: 'starter' | 'pro' =
      salonWorkspace.subscriptionPlan === 'pro' ? 'pro' : 'starter'
  ) => {
    const formattedAddress = formatSalonAddress({
      streetType: '',
      streetName: streetLineInput,
      streetNumber: '',
      city: cityInput,
      postalCode: postalCodeInput,
      salonAddress: '',
    });

    setSalonWorkspace((current) => ({
      ...current,
      ownerEmail: accountEmailInput.trim().toLowerCase(),
      businessPhone: businessPhoneInput.trim(),
      activityCategory: toUppercaseField(activityCategoryInput.trim()),
      streetType: '',
      streetName: toUppercaseField(streetLineInput.trim()),
      streetNumber: '',
      city: toUppercaseField(cityInput.trim()),
      postalCode: postalCodeInput.trim(),
      salonAddress: formattedAddress,
      subscriptionStatus: status,
      subscriptionPlan: plan,
      updatedAt: new Date().toISOString(),
    }));
  };

  const profiloSaloneCompleto =
    salonNameInput.trim() !== '' &&
    activityCategoryInput.trim() !== '' &&
    businessPhoneInput.trim() !== '' &&
    streetLineInput.trim() !== '' &&
    cityInput.trim() !== '' &&
    postalCodeInput.trim().length >= 5;

  const salonPreviewName = salonNameInput.trim() || 'Nome salone';
  const salonPreviewAddress = formatSalonAddress({
    streetType: '',
    streetName: streetLineInput,
    streetNumber: '',
    city: cityInput,
    postalCode: postalCodeInput,
    salonAddress: '',
  });
  const requiredFieldsFilled = [
    salonNameInput,
    activityCategoryInput,
    businessPhoneInput,
    streetLineInput,
    cityInput,
    postalCodeInput,
  ].filter((value) => value.trim() !== '').length;

  const brandName =
    salonNameInput.trim() ? toUppercaseField(salonNameInput) : 'SALON PRO';
  const publicClientBaseUrl = useMemo(() => {
    const extra = Constants.expoConfig?.extra as { publicClientBaseUrl?: string } | undefined;
    return extra?.publicClientBaseUrl?.trim().replace(/\/+$/, '') ?? '';
  }, []);
  const hasPublicClientWeb =
    publicClientBaseUrl.startsWith('http://') || publicClientBaseUrl.startsWith('https://');
  const salonClientJoinPath = useMemo(
    () => `/join/${salonWorkspace.salonCode}`,
    [salonWorkspace.salonCode]
  );

  const canEditSalonProfile = isEditingSalonProfile;

  const salonClientLink = useMemo(
    () => (hasPublicClientWeb ? `${publicClientBaseUrl}${salonClientJoinPath}` : ''),
    [hasPublicClientWeb, publicClientBaseUrl, salonClientJoinPath]
  );

  const openFrontendPreviewForAdmin = useCallback(() => {
    router.push({
      pathname: '/cliente',
      params: { salon: salonWorkspace.salonCode },
    });
  }, [router, salonWorkspace.salonCode]);

  const markBiometricPromptAsSeen = useCallback(async () => {
    if (!salonAccountEmail) return;

    try {
      await AsyncStorage.setItem(
        buildAccountScopedKey(BIOMETRIC_PROMPT_SEEN_KEY, salonAccountEmail),
        'true'
      );
    } catch {
      // Ignore prompt persistence issues and keep biometric management available in settings.
    }
  }, [salonAccountEmail]);

  const enableBiometricFromPrompt = useCallback(async () => {
    await markBiometricPromptAsSeen();

    const biometricCopy = getBiometricCopy(
      appLanguage,
      process.env.EXPO_OS === 'ios' ? 'ios' : 'generic'
    );
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: biometricCopy.promptEnable,
      cancelLabel: tApp(appLanguage, 'common_cancel'),
      fallbackLabel: 'Usa password',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      router.push('/impostazioni');
      return;
    }

    setBiometricEnabled(true);
    Alert.alert(
      tApp(appLanguage, 'settings_biometric_enabled_title'),
      tApp(appLanguage, 'settings_biometric_enabled_body', {
        biometricLabel: biometricCopy.label,
      })
    );
  }, [appLanguage, markBiometricPromptAsSeen, router, setBiometricEnabled]);

  useEffect(() => {
    biometricPromptShownRef.current = false;
  }, [salonAccountEmail]);

  useEffect(() => {
    if (loadingSalon || !salonAccountEmail || biometricEnabled || biometricPromptShownRef.current) {
      return;
    }

    let cancelled = false;

    const maybePromptBiometric = async () => {
      const promptKey = buildAccountScopedKey(BIOMETRIC_PROMPT_SEEN_KEY, salonAccountEmail);

      try {
        const hasSeenPrompt = await AsyncStorage.getItem(promptKey);

        if (hasSeenPrompt === 'true' || cancelled) return;

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();

        if (!hasHardware || !isEnrolled || supportedTypes.length === 0 || cancelled) {
          await AsyncStorage.setItem(promptKey, 'true');
          return;
        }

        const biometricCopy = getBiometricCopy(
          appLanguage,
          process.env.EXPO_OS === 'ios' ? 'ios' : 'generic'
        );

        biometricPromptShownRef.current = true;

        Alert.alert(
          tApp(appLanguage, 'settings_biometric_title'),
          tApp(appLanguage, 'home_biometric_prompt_body', {
            biometricLabel: biometricCopy.label,
          }),
          [
            {
              text: tApp(appLanguage, 'common_no'),
              style: 'cancel',
              onPress: () => {
                void markBiometricPromptAsSeen();
              },
            },
            {
              text: tApp(appLanguage, 'settings_title'),
              onPress: () => {
                void markBiometricPromptAsSeen();
                router.push('/impostazioni');
              },
            },
            {
              text: biometricCopy.action,
              onPress: () => {
                void enableBiometricFromPrompt();
              },
            },
          ]
        );
      } catch {
        biometricPromptShownRef.current = true;
      }
    };

    void maybePromptBiometric();

    return () => {
      cancelled = true;
    };
  }, [
    appLanguage,
    biometricEnabled,
    enableBiometricFromPrompt,
    loadingSalon,
    markBiometricPromptAsSeen,
    router,
    salonAccountEmail,
  ]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        setShowProfileSection(false);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      };
    }, [])
  );

  const condividiAccessoCliente = async () => {
    if (!hasPublicClientWeb || !salonClientLink) {
      Alert.alert(
        'Link pubblico mancante',
        'Imposta publicClientBaseUrl in app.json con l\'URL web pubblico definitivo prima di condividere il QR cliente.'
      );
      return;
    }

    try {
      await Share.share({
        title: `Prenota da ${brandName}`,
        message: buildClientInviteMessage({
          brandName,
          salonCode: salonWorkspace.salonCode,
          salonClientLink,
          isPublicWebEnabled: hasPublicClientWeb,
        }),
      });
    } catch (error) {
      Alert.alert(
        'Condivisione non riuscita',
        'Non è stato possibile aprire la condivisione. Riprova tra qualche secondo.'
      );
    }
  };

  if (loadingSalon) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingWrap]}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Caricamento salone...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
        <View style={styles.heroCard}>
          <ModuleHeroHeader
            moduleKey="index"
            title={tApp(appLanguage, 'tab_home')}
            salonName={salonNameInput || salonWorkspace.salonName}
            salonNameDisplayStyle={salonNameDisplayStyleInput}
            salonNameFontVariant={salonNameFontVariantInput}
            onTitleLongPress={() => setShowAdminPanel((current) => !current)}
            rightAccessory={
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => null);
                  router.push('/impostazioni');
                }}
                activeOpacity={0.9}
              >
                <Ionicons name="settings" size={25} color="#7a5a2d" style={styles.settingsIcon} />
              </TouchableOpacity>
            }
          />

          <View style={styles.heroTopRow}>
            <View style={styles.heroMetaCard}>
              <Text style={styles.heroDateLabel}>{tApp(appLanguage, 'common_today')}</Text>
              <Text
                style={styles.heroDateValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {formatDateLabel(oggi)}
              </Text>
            </View>

            <View style={[styles.heroMetaCard, styles.heroStatusCard, livelloOperativo.tone]}>
              <Text
                style={[styles.statusPillText, livelloOperativo.textTone]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.74}
              >
                {livelloOperativo.label}
              </Text>
            </View>
          </View>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricCardBlue}>
              <Text style={styles.heroMetricNumber}>{appuntamentiOggi.length}</Text>
              <Text style={styles.heroMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>
                {tApp(appLanguage, 'home_appointments_today')}
              </Text>
            </View>

            <View style={styles.heroMetricCardRose}>
              <Text style={styles.heroMetricNumber}>€ {valoreDaIncassare.toFixed(0)}</Text>
              <Text style={styles.heroMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'home_to_collect')}</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>{tApp(appLanguage, 'home_subtitle')}</Text>
        </View>

        <View style={styles.insightGrid}>
          <View
            style={[
              styles.insightCard,
              responsive.isTablet && styles.halfWidthCard,
              responsive.isDesktop && styles.desktopThirdCard,
            ]}
          >
            <Text style={styles.insightTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{tApp(appLanguage, 'tab_clients')}</Text>
            <Text style={styles.insightNumber}>{numeroClienti}</Text>
            <Text style={styles.insightHint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}>
              {ultimoCliente
                ? `Ultimo: ${ultimoCliente.nome}`
                : tApp(appLanguage, 'home_no_customer')}
            </Text>
          </View>

          <View
            style={[
              styles.insightCardMint,
              responsive.isTablet && styles.halfWidthCard,
              responsive.isDesktop && styles.desktopThirdCard,
            ]}
          >
            <Text style={styles.insightTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{tApp(appLanguage, 'home_total_income')}</Text>
            <Text style={styles.insightNumber}>€ {incassoTotale.toFixed(0)}</Text>
            <Text style={styles.insightHint} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}>
              {tApp(appLanguage, 'home_registered_movements')}
            </Text>
          </View>
        </View>

        <View style={[styles.priorityCard, responsive.isDesktop && styles.desktopPriorityCard]}>
          <Text style={styles.priorityEyebrow}>{tApp(appLanguage, 'home_next_priority')}</Text>
          <Text style={styles.priorityTitle}>
            {prossimoAppuntamento
              ? `${prossimoAppuntamento.ora} · ${prossimoAppuntamento.cliente}`
              : tApp(appLanguage, 'home_no_appointment_today')}
          </Text>
          <Text style={styles.priorityText}>
            {prossimoAppuntamento
              ? `${prossimoAppuntamento.servizio} · € ${prossimoAppuntamento.prezzo.toFixed(2)}`
              : tApp(appLanguage, 'home_free_today')}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <View style={[styles.infoCardSun, responsive.isTablet && styles.infoCardResponsive]}>
            <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_collected')}</Text>
            <Text style={styles.infoValue}>{appuntamentiIncassati}</Text>
          </View>

          <View
            style={[styles.infoCardLavender, responsive.isTablet && styles.infoCardResponsive]}
          >
            <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_bookings')}</Text>
            <Text style={styles.infoValue}>{numeroAppuntamenti}</Text>
          </View>

          <View style={[styles.infoCardPeach, responsive.isTablet && styles.infoCardResponsive]}>
            <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_to_collect')}</Text>
            <Text style={styles.infoValue}>{appuntamentiDaIncassare}</Text>
          </View>
        </View>

        <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_smart_indicators')}
          </Text>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_service')}
            </Text>
            <Text style={[styles.smartValue, styles.smartTextCentered]}>
              {servizioTop
                ? `${servizioTop.nome} · ${servizioTop.count} volte`
                : 'Ancora nessun dato'}
            </Text>
          </View>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_duration')}
            </Text>
            <Text style={[styles.smartValue, styles.smartTextCentered]}>
              {servizioTop ? formatMinutes(servizioTop.durataMinuti) : '—'}
            </Text>
          </View>

          <View style={[styles.smartItemLast, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_average_ticket')}
            </Text>
            <Text style={[styles.smartValue, styles.smartTextCentered]}>
              € {mediaScontrino.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={[styles.sectionCardDark, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitleDark, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_quick_focus')}
          </Text>
          <Text style={[styles.sectionTextDark, styles.sectionTextCentered]}>
            {appuntamentiDaIncassare > 0
              ? `Hai ${appuntamentiDaIncassare} appuntamenti ancora da incassare. La priorita operativa è chiudere € ${valoreDaIncassare.toFixed(2)}.`
              : 'Tutti gli appuntamenti risultano già incassati. Puoi concentrarti su nuove prenotazioni e clienti.'}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <TouchableOpacity
            style={styles.profileAccordionButton}
            onPress={() => {
              setShowProfileSection((current) => {
                const nextValue = !current;
                setIsEditingSalonProfile(nextValue);
                return nextValue;
              });
            }}
            activeOpacity={0.9}
          >
            <View style={styles.profileAccordionTextWrap}>
              <Text
                style={[
                  styles.sectionTitle,
                  styles.sectionTitleCentered,
                  styles.profileAccordionTitle,
                ]}
              >
                {tApp(appLanguage, 'home_edit_profile')}
              </Text>
              <Text
                style={[
                  styles.sectionSubtext,
                  styles.sectionSubtextCentered,
                  styles.profileAccordionSubtext,
                ]}
              >
                {'Qui trovi i dati del salone salvati in registrazione. Puoi aprire il blocco e modificarli quando vuoi.'}
              </Text>
            </View>
            <View style={styles.profileAccordionIconWrap}>
              <Ionicons
                name={showProfileSection ? 'chevron-up' : 'chevron-down'}
                size={30}
                color="#334155"
              />
            </View>
          </TouchableOpacity>

          <View style={styles.profilePreviewCard}>
            <View style={styles.profilePreviewHeader}>
              <Text style={styles.profilePreviewEyebrow}>Profilo salone</Text>
              <Text style={styles.profilePreviewProgress}>
                {profiloSaloneCompleto
                  ? 'Contatti e indirizzo salvati'
                  : `${requiredFieldsFilled}/6 campi obbligatori`}
              </Text>
            </View>
            <Text
              style={[
                styles.profilePreviewName,
                salonNameDisplayStyleInput === 'minuscolo' && styles.profilePreviewNameLower,
                salonNameDisplayStyleInput === 'stampatello' && styles.profilePreviewNameUpper,
                {
                  fontFamily: salonNameFontOptions.find(
                    (item) => item.key === salonNameFontVariantInput
                  )?.family,
                },
              ]}
            >
              {salonPreviewName}
            </Text>
            <Text style={styles.profilePreviewMeta}>
              {activityCategoryInput.trim() || 'Categoria libera'}
            </Text>
            <View style={styles.profilePreviewInfoRow}>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="call-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText}>
                  {businessPhoneInput.trim() || 'Telefono'}
                </Text>
              </View>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="location-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText} numberOfLines={1}>
                  {salonPreviewAddress || 'Indirizzo salone'}
                </Text>
              </View>
            </View>
          </View>

          {showProfileSection ? (
            <>
              <View style={styles.profileEditorCard}>
                <Text style={styles.profileEditorTitle}>Dati salone</Text>
                <Text style={styles.profileEditorCaption}>
                  Registrazione e Home usano gli stessi dati. Qui li puoi rivedere e correggere in un unico blocco.
                </Text>

                <View style={styles.profileSectionDivider} />

                <Text style={styles.profileSectionTitle}>Identita salone</Text>
                <Text style={styles.profileSectionCaption}>
                  Nome pubblico e categoria con cui il salone viene mostrato nell&apos;app.
                </Text>

                <Text style={styles.fieldLabel}>Nome salone</Text>
                <ClearableTextInput
                  ref={salonNameFieldRef}
                  style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                  value={salonNameInput}
                  onChangeText={setSalonNameInput}
                  placeholder={tApp(appLanguage, 'auth_salon_name_placeholder')}
                  placeholderTextColor="#8f8f8f"
                  editable={canEditSalonProfile}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => activityCategoryFieldRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <Text style={styles.fieldLabel}>Categoria attivita</Text>
                <ClearableTextInput
                  ref={activityCategoryFieldRef}
                  style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                  value={activityCategoryInput}
                  onChangeText={(value) => setActivityCategoryInput(toUppercaseField(value))}
                  placeholder="Categoria attivita"
                  placeholderTextColor="#8f8f8f"
                  editable={canEditSalonProfile}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => businessPhoneFieldRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <View style={styles.profileSectionDivider} />

                <Text style={styles.profileSectionTitle}>Contatti e indirizzo</Text>
                <Text style={styles.profileSectionCaption}>
                  Questi campi sono obbligatori e vengono usati per attivare correttamente il salone.
                </Text>

                <Text style={styles.fieldLabel}>Cellulare azienda</Text>
                <ClearableTextInput
                  ref={businessPhoneFieldRef}
                  style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                  value={businessPhoneInput}
                  onChangeText={setBusinessPhoneInput}
                  placeholder={tApp(appLanguage, 'auth_business_phone_placeholder')}
                  keyboardType="phone-pad"
                  placeholderTextColor="#8f8f8f"
                  editable={canEditSalonProfile}
                  returnKeyType="next"
                  onSubmitEditing={() => streetLineFieldRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <Text style={styles.fieldLabel}>Via, nome strada e civico</Text>
                <ClearableTextInput
                  ref={streetLineFieldRef}
                  style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                  value={streetLineInput}
                  onChangeText={(value) => setStreetLineInput(toUppercaseField(value))}
                  placeholder="Via Roma 1"
                  placeholderTextColor="#8f8f8f"
                  editable={canEditSalonProfile}
                  autoCapitalize="characters"
                  returnKeyType="next"
                  onSubmitEditing={() => cityFieldRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <View style={styles.formRow}>
                  <View style={styles.formColumn}>
                    <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_city')}</Text>
                    <ClearableTextInput
                      ref={cityFieldRef}
                      style={[
                        styles.accountInput,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={cityInput}
                      onChangeText={(value) => setCityInput(toUppercaseField(value))}
                      placeholder={tApp(appLanguage, 'common_city')}
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => postalCodeFieldRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={[styles.formColumn, styles.formColumnCompact]}>
                    <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_postal_code')}</Text>
                    <ClearableTextInput
                      ref={postalCodeFieldRef}
                      style={[
                        styles.accountInput,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={postalCodeInput}
                      onChangeText={setPostalCodeInput}
                      placeholder={tApp(appLanguage, 'common_postal_code')}
                      keyboardType="number-pad"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  </View>
                </View>

                <View style={styles.profileSectionDivider} />

                <TouchableOpacity
                  style={styles.fontDropdownButton}
                  onPress={() => setShowFontPicker((current) => !current)}
                  activeOpacity={0.9}
                >
                  <View style={styles.fontDropdownTextWrap}>
                    <Text style={styles.profileSectionTitle}>Aspetto insegna</Text>
                    <Text style={styles.profileSectionCaption}>
                      Font attuale: {salonNameFontOptions.find((item) => item.key === salonNameFontVariantInput)?.label}
                    </Text>
                  </View>
                  <View style={styles.profileAccordionIconWrap}>
                    <Ionicons
                      name={showFontPicker ? 'chevron-up' : 'chevron-down'}
                      size={24}
                      color="#334155"
                    />
                  </View>
                </TouchableOpacity>

                {showFontPicker ? (
                  <View style={styles.profileFontSelectorGrid}>
                    {salonNameFontOptions.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.profileFontChip,
                          salonNameFontVariantInput === option.key &&
                            styles.profileFontChipActive,
                        ]}
                        onPress={() => setSalonNameFontVariantInput(option.key)}
                        activeOpacity={0.9}
                        disabled={!canEditSalonProfile}
                      >
                        <Text
                          style={[
                            styles.profileFontChipText,
                            { fontFamily: option.family },
                            salonNameFontVariantInput === option.key &&
                              styles.profileFontChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.previewButton, savingSalon && styles.buttonDisabled]}
                onPress={salvaDatiSalone}
                activeOpacity={0.9}
                disabled={savingSalon}
              >
                <Text style={styles.previewButtonText}>
                  {savingSalon
                    ? 'Salvataggio...'
                    : tApp(appLanguage, 'home_save_profile')}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {showAdminPanel ? (
          <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Admin account</Text>
            <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
              Pannello nascosto: qui puoi cambiare il profilo dati del salone senza mostrarlo agli utenti.
            </Text>

            <TextInput
              ref={accountEmailFieldRef}
              style={styles.accountInput}
              value={accountEmailInput}
              onChangeText={setAccountEmailInput}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email@salone.it"
              placeholderTextColor="#8f8f8f"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <TextInput
              style={[styles.accountInput, styles.accountInputLocked]}
              value={formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: salonWorkspace.salonAddress,
              })}
              editable={false}
              placeholder="Indirizzo salone"
              placeholderTextColor="#8f8f8f"
            />

            <TouchableOpacity
              style={styles.previewButton}
              onPress={salvaAccountSalone}
              activeOpacity={0.9}
            >
              <Text style={styles.previewButtonText}>Salva account attivo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.previewButton}
              onPress={openFrontendPreviewForAdmin}
              activeOpacity={0.9}
            >
              <Text style={styles.previewButtonText}>Anteprima frontend cliente (admin)</Text>
            </TouchableOpacity>

            <Text style={styles.accountHint}>Attuale: {salonAccountEmail}</Text>
            <Text style={styles.accountHint}>Portale cliente: sincronizzazione automatica attiva</Text>
            <Text style={styles.accountHint}>Workspace: {salonWorkspace.id}</Text>
            <Text style={styles.accountHint}>
              Mail unica abbonamento: {salonWorkspace.ownerEmail}
            </Text>
            <Text style={styles.accountHint}>
              Salone: {salonNameInput || salonWorkspace.salonName}
            </Text>
            <Text style={styles.accountHint}>
              Categoria attività: {activityCategoryInput || 'Non impostata'}
            </Text>
            <Text style={styles.accountHint}>
              Cellulare azienda: {businessPhoneInput || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Indirizzo:{' '}
              {formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: '',
              }) || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Piano/Stato: {salonWorkspace.subscriptionPlan} ·{' '}
              {salonWorkspace.subscriptionStatus}
            </Text>

            <View style={styles.adminStatusRow}>
              <TouchableOpacity
                style={styles.adminStatusChip}
                onPress={() => aggiornaStatoWorkspace('active', 'starter')}
                activeOpacity={0.9}
              >
                <Text style={styles.adminStatusChipText}>Attivo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.adminStatusChipDanger}
                onPress={() => aggiornaStatoWorkspace('suspended')}
                activeOpacity={0.9}
              >
                <Text style={styles.adminStatusChipDangerText}>Sospeso</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Accesso cliente</Text>
          <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
            Questo codice collega il frontend cliente direttamente a questo salone. Condividi il link
            oppure fai scansionare il QR al cliente.
          </Text>

          {!hasPublicClientWeb ? (
            <View style={styles.accessWarningCard}>
              <Text style={styles.accessWarningTitle}>Frontend web cliente non ancora configurato</Text>
              <Text style={styles.accessWarningText}>
                Per far entrare i clienti reali dal browser imposta publicClientBaseUrl in app.json con
                l'URL pubblico definitivo del frontend web. Finché resta vuoto, il QR prodotto non va condiviso.
              </Text>
            </View>
          ) : null}

          <View style={styles.accessCard}>
            <Text style={styles.accessLabel}>Link web cliente</Text>
            <Text style={styles.accessCode}>{salonWorkspace.salonCode}</Text>
            <Text style={styles.accessLink} numberOfLines={2}>
              {salonClientLink || 'Configura publicClientBaseUrl per generare il link pubblico.'}
            </Text>
          </View>

          <View style={[styles.qrCard, responsive.isTablet && styles.qrCardResponsive]}>
            <QRCode
              value={salonClientLink || 'https://configura-public-client-base-url.invalid'}
              size={170}
              color="#111111"
              backgroundColor="#ffffff"
            />
            <Text style={styles.qrTitle}>QR cliente del salone</Text>
            <Text style={styles.qrText}>
              {hasPublicClientWeb
                ? 'Questo QR apre il frontend web cliente già collegato al tuo salone.'
                : 'Configura prima il link web pubblico definitivo, poi condividi questo QR ai clienti.'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={condividiAccessoCliente}
            activeOpacity={0.9}
          >
            <Text style={styles.resetButtonText}>Condividi link cliente</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Strumenti</Text>
          <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
            Qui trovi solo strumenti interni del salone. L'anteprima cliente resta disponibile nel pannello admin nascosto.
          </Text>
        </View>
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  content: {
    flexGrow: 1,
    paddingTop: 54,
    paddingBottom: 140,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#475569',
    fontWeight: '700',
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 0,
    paddingBottom: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  settingsButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#f2e5cf',
    borderWidth: 1,
    borderColor: 'rgba(124, 171, 232, 0.92)',
    shadowColor: '#7cb4ff',
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIcon: {
    textShadowColor: 'rgba(122, 90, 45, 0.34)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 12,
    gap: 12,
  },
  heroMetaCard: {
    flex: 1,
    backgroundColor: '#e8eef8',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#cfdcf0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatusCard: {
    backgroundColor: '#e8f6ff',
    borderColor: '#c7e8fb',
  },
  heroDateLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#35517a',
    marginBottom: 8,
    textAlign: 'center',
  },
  heroDateValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
  },
  statusPillText: {
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusHot: {
    backgroundColor: '#ffe3e6',
    borderColor: '#f9c0c7',
  },
  statusWarm: {
    backgroundColor: '#e8f6ff',
    borderColor: '#c7e8fb',
  },
  statusCalm: {
    backgroundColor: '#e1f6eb',
    borderColor: '#bce8d4',
  },
  statusHotText: {
    color: '#b42318',
  },
  statusWarmText: {
    color: '#0c4a6e',
  },
  statusCalmText: {
    color: '#0f766e',
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  heroMetricCardBlue: {
    flex: 1,
    backgroundColor: '#dbeafe',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
  },
  heroMetricCardRose: {
    flex: 1,
    backgroundColor: '#fce7f3',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#f9c5da',
    alignItems: 'center',
  },
  heroMetricNumber: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 6,
  },
  heroMetricLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5b6472',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    lineHeight: 22,
    textAlign: 'center',
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  insightCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  insightCardMint: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#dcfce7',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 22,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    alignItems: 'center',
  },
  halfWidthCard: {
    minWidth: '48%',
  },
  desktopThirdCard: {
    minWidth: '48%',
  },
  insightTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#6b7280',
    marginBottom: 10,
    textAlign: 'center',
  },
  insightNumber: {
    fontSize: 32,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  insightHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#665f57',
    fontWeight: '700',
    textAlign: 'center',
  },
  priorityCard: {
    backgroundColor: '#1f2937',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 24,
    marginBottom: 14,
    alignItems: 'center',
  },
  desktopPriorityCard: {
    alignSelf: 'stretch',
  },
  priorityEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#cbd5e1',
    letterSpacing: 4,
    marginBottom: 10,
    textAlign: 'center',
  },
  priorityTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
  },
  priorityText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e2e8f0',
    textAlign: 'center',
  },
  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  infoCardSun: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#fef3c7',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#fcd34d',
    alignItems: 'center',
  },
  infoCardLavender: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#ede9fe',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#ddd6fe',
    alignItems: 'center',
  },
  infoCardPeach: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#ffedd5',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
  },
  infoCardResponsive: {
    minWidth: '31%',
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#7c6b5b',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionCardMandatory: {
    backgroundColor: '#fffdf8',
    borderColor: '#f1e2b8',
    shadowColor: '#c59d34',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  sectionCardDark: {
    backgroundColor: '#1f2937',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2b3647',
  },
  desktopWideCard: {
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  sectionTitleDark: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  sectionSubtext: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 12,
  },
  sectionSubtextCentered: {
    textAlign: 'center',
  },
  sectionTextDark: {
    fontSize: 15,
    lineHeight: 22,
    color: '#e2e8f0',
  },
  sectionTextCentered: {
    textAlign: 'center',
  },
  smartItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  smartItemLast: {
    paddingTop: 10,
  },
  smartItemCentered: {
    alignItems: 'center',
  },
  smartLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
  },
  smartValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
  },
  smartTextCentered: {
    textAlign: 'center',
  },
  profileAccordionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  mandatoryIntroCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#fffaf0',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f3dfb2',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    marginBottom: 14,
    alignItems: 'center',
  },
  mandatoryIntroGlow: {
    position: 'absolute',
    top: -18,
    width: 180,
    height: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
  },
  mandatoryIntroBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  mandatoryIntroEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.8,
    color: '#9a6700',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  mandatoryIntroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  mandatoryIntroText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6b7280',
    textAlign: 'center',
  },
  profileAccordionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  profileAccordionTitle: {
    marginBottom: 4,
  },
  profileAccordionSubtext: {
    marginBottom: 0,
  },
  profileAccordionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileEditorCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e7edf4',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  profileEditorTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileEditorCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  profileSectionDivider: {
    height: 1,
    backgroundColor: '#e7edf4',
    marginVertical: 16,
  },
  profileSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileSectionCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  profileEditorWrap: {
    gap: 14,
  },
  profilePreviewCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
  },
  profilePreviewHeader: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  profilePreviewEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.2,
    color: '#8b6b36',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  profilePreviewProgress: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
  },
  profilePreviewName: {
    fontSize: 30,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  profilePreviewNameUpper: {
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  profilePreviewNameLower: {
    textTransform: 'lowercase',
  },
  profilePreviewMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 14,
    textAlign: 'center',
  },
  profilePreviewInfoRow: {
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  profilePreviewInfoPill: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profilePreviewInfoText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  formGroupCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e7edf4',
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  formGroupTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  formGroupCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
    textAlign: 'center',
    alignSelf: 'center',
  },
  fontDropdownButton: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  fontDropdownTextWrap: {
    alignItems: 'center',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  formColumn: {
    flex: 1,
    minWidth: 180,
  },
  formColumnCompact: {
    width: 120,
    minWidth: 120,
  },
  accountInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
    marginTop: 0,
    width: '100%',
    textAlign: 'center',
  },
  accountInputLocked: {
    opacity: 0.65,
  },
  profileFontSelectorGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  profileFontChip: {
    flex: 1,
    minWidth: 104,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  profileFontChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  profileFontChipText: {
    fontSize: 14,
    color: '#334155',
  },
  profileFontChipTextActive: {
    color: '#ffffff',
  },
  previewButton: {
    marginTop: 14,
    backgroundColor: '#111827',
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  accessWarningCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fdba74',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  accessWarningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9a3412',
    textAlign: 'center',
    marginBottom: 4,
  },
  accessWarningText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#9a3412',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 10,
    backgroundColor: '#eef2f7',
    borderRadius: 20,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  accountHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  adminStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  adminStatusChip: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  adminStatusChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#075985',
  },
  adminStatusChipDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  adminStatusChipDangerText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#b91c1c',
  },
  accessCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    marginTop: 4,
    marginBottom: 14,
    alignItems: 'center',
  },
  accessLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
  },
  accessCode: {
    fontSize: 26,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  accessLink: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
  },
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    alignItems: 'center',
  },
  qrCardResponsive: {
    alignSelf: 'center',
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  qrText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  mandatoryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mandatoryOverlayCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#eef2f7',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  mandatoryOverlayAccent: {
    position: 'absolute',
    top: -36,
    width: 210,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(96, 165, 250, 0.16)',
  },
  mandatoryOverlayBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2.6,
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
  },
  mandatoryOverlayTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  mandatoryOverlayButton: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 22,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mandatoryOverlayButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
});
