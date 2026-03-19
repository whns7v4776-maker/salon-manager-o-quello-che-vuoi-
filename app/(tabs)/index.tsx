import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ExpoLinking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutChangeEvent,
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
import { tApp } from '../../src/lib/i18n';
import { formatSalonAddress, parseSalonAddress } from '../../src/lib/platform';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { supabase } from '../../src/lib/supabase';

type SalonRecord = {
  id: string;
  name: string;
  owner_user_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  is_active: boolean | null;
};

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

const buildClientInviteMessage = (
  brandName: string,
  salonCode: string,
  salonClientLink: string
) =>
  `Ciao! Prenota da ${brandName} usando questo link diretto:\n${salonClientLink}\n\nCodice salone: ${salonCode}`;

const toUppercaseField = (value: string) => value.toLocaleUpperCase('it-IT');

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

  const {
    clienti,
    appuntamenti,
    movimenti,
    servizi,
    resetDatiDemo,
    salonAccountEmail,
    salonWorkspace,
    setSalonWorkspace,
    switchSalonAccount,
    appLanguage,
  } = useAppContext();

  const [loadingSalon, setLoadingSalon] = useState(true);
  const [savingSalon, setSavingSalon] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [salonRecordId, setSalonRecordId] = useState<string | null>(null);

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
  const [profileSectionY, setProfileSectionY] = useState(0);
  const [contactsSectionY, setContactsSectionY] = useState(0);
  const [hasShownMandatoryProfilePrompt, setHasShownMandatoryProfilePrompt] = useState(false);
  const [showMandatoryProfileOverlay, setShowMandatoryProfileOverlay] = useState(false);

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

  const syncWorkspaceFromSalon = useCallback(
    (salon: SalonRecord) => {
      const dbAddress = salon.address?.trim() ?? '';
      const dbCity = salon.city?.trim() ?? '';
      const dbPhone = salon.phone?.trim() ?? '';
      const dbEmail = salon.email?.trim() ?? '';
      const parsedAddress = parseSalonAddress(dbAddress);
      const resolvedStreetLine = parsedAddress.streetLine || dbAddress;
      const resolvedCity = parsedAddress.city || dbCity;
      const resolvedPostalCode = parsedAddress.postalCode;

      setSalonWorkspace((current) => ({
        ...current,
        salonName: salon.name?.trim() || current.salonName,
        ownerEmail: dbEmail || salonAccountEmail || current.ownerEmail,
        businessPhone: dbPhone || current.businessPhone,
        activityCategory: current.activityCategory,
        streetType: '',
        streetName: resolvedStreetLine || current.streetName,
        streetNumber: current.streetNumber,
        city: resolvedCity || current.city,
        postalCode: resolvedPostalCode || current.postalCode,
        salonAddress: formatSalonAddress({
          streetType: '',
          streetName: resolvedStreetLine || current.streetName,
          streetNumber: current.streetNumber,
          city: resolvedCity || current.city,
          postalCode: resolvedPostalCode || current.postalCode,
          salonAddress: dbAddress || current.salonAddress,
        }),
        updatedAt: new Date().toISOString(),
      }));

      setSalonRecordId(salon.id);
      setSalonNameInput(salon.name ?? '');
      setBusinessPhoneInput(salon.phone ?? '');
      setStreetLineInput(resolvedStreetLine);
      setCityInput(toUppercaseField(resolvedCity));
      setPostalCodeInput(resolvedPostalCode);
      setAccountEmailInput(dbEmail || salonAccountEmail);
    },
    [salonAccountEmail, setSalonWorkspace]
  );

  const caricaSaloneDaSupabase = useCallback(async () => {
    try {
      setLoadingSalon(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        setCurrentUserId(null);
        setSalonRecordId(null);
        setLoadingSalon(false);
        return;
      }

      setCurrentUserId(session.user.id);

      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('owner_user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        setLoadingSalon(false);
        Alert.alert('Errore caricamento', error.message);
        return;
      }

      if (data) {
        syncWorkspaceFromSalon(data as SalonRecord);
      } else {
        setSalonRecordId(null);
      }

      setLoadingSalon(false);
    } catch (e: any) {
      setLoadingSalon(false);
      const message = String(e?.message ?? '');
      if (
        message.toLowerCase().includes('auth') ||
        message.toLowerCase().includes('session')
      ) {
        setCurrentUserId(null);
        setSalonRecordId(null);
        return;
      }
      Alert.alert('Errore generale', e.message ?? 'Errore durante il caricamento del salone');
    }
  }, [syncWorkspaceFromSalon]);

  const salvaDatiSalone = async () => {
    if (
      !salonNameInput.trim() ||
      !businessPhoneInput.trim() ||
      !streetLineInput.trim() ||
      !cityInput.trim() ||
      !postalCodeInput.trim()
    ) {
      Alert.alert(
        'Profilo salone incompleto',
        'Compila nome salone, cellulare azienda, via e nome strada, comune e CAP prima di salvare.'
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

      if (!currentUserId) {
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

        Alert.alert('Profilo salvato', 'Dati salone salvati sul profilo locale.');
        setIsEditingSalonProfile(false);
        setShowProfileSection(false);
        return;
      }

      const payload = {
        name: salonNameInput.trim(),
        owner_user_id: currentUserId,
        phone: businessPhoneInput.trim(),
        email: accountEmailInput.trim().toLowerCase() || null,
        address: formattedAddress,
        city: toUppercaseField(cityInput.trim()),
        country: 'Italia',
        is_active: true,
      };

      if (salonRecordId) {
        const { error } = await supabase
          .from('salons')
          .update(payload)
          .eq('id', salonRecordId)
          .eq('owner_user_id', currentUserId);

        setSavingSalon(false);

        if (error) {
          Alert.alert('Errore aggiornamento', error.message);
          return;
        }

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

        Alert.alert('Profilo aggiornato', 'Dati salone aggiornati con successo.');
        setIsEditingSalonProfile(false);
        setShowProfileSection(false);
        await caricaSaloneDaSupabase();
        return;
      }

      const { data, error } = await supabase
        .from('salons')
        .insert([payload])
        .select()
        .single();

      setSavingSalon(false);

      if (error) {
        Alert.alert('Errore creazione', error.message);
        return;
      }

      setSalonRecordId(data.id);

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

      Alert.alert('Profilo creato', 'Salone creato e collegato a Supabase.');
      setIsEditingSalonProfile(false);
      setShowProfileSection(false);
      await caricaSaloneDaSupabase();
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
    status: 'demo' | 'active' | 'suspended' | 'expired',
    plan: 'demo' | 'starter' | 'pro' = salonWorkspace.subscriptionPlan
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
    businessPhoneInput,
    streetLineInput,
    cityInput,
    postalCodeInput,
  ].filter((value) => value.trim() !== '').length;

  const brandName =
    salonNameInput.trim() && salonNameInput !== 'Il tuo salone'
      ? toUppercaseField(salonNameInput)
      : 'SALON PRO';

  const canEditSalonProfile = isEditingSalonProfile || !profiloSaloneCompleto;

  const salonClientLink = useMemo(
    () =>
      ExpoLinking.createURL('/cliente', {
        queryParams: { salon: salonWorkspace.salonCode },
      }),
    [salonWorkspace.salonCode]
  );

  useEffect(() => {
    const init = async () => {
      await caricaSaloneDaSupabase();
    };

    init();
  }, [caricaSaloneDaSupabase]);

  useEffect(() => {
    if (!profiloSaloneCompleto) {
      setIsEditingSalonProfile(true);
      setShowProfileSection(true);
    }
  }, [profiloSaloneCompleto]);

  useEffect(() => {
    if (!profiloSaloneCompleto && profileSectionY > 0) {
      setShowProfileSection(true);
      scrollRef.current?.scrollTo({ y: Math.max(profileSectionY - 18, 0), animated: true });

      if (!hasShownMandatoryProfilePrompt) {
        setHasShownMandatoryProfilePrompt(true);
        setShowMandatoryProfileOverlay(true);
      }
    }
  }, [hasShownMandatoryProfilePrompt, profileSectionY, profiloSaloneCompleto]);

  useEffect(() => {
    if (profiloSaloneCompleto) {
      setShowMandatoryProfileOverlay(false);
    }
  }, [profiloSaloneCompleto]);

  const handleProfileSectionLayout = (event: LayoutChangeEvent) => {
    setProfileSectionY(event.nativeEvent.layout.y);
  };

  const handleContactsSectionLayout = (event: LayoutChangeEvent) => {
    setContactsSectionY(event.nativeEvent.layout.y);
  };

  const focusMandatoryProfile = useCallback(() => {
    setShowProfileSection(true);
    setShowMandatoryProfileOverlay(false);
    const targetY = Math.max((contactsSectionY || profileSectionY) - 110, 0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
        setTimeout(() => {
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
        }, 280);
      });
    });
  }, [contactsSectionY, profileSectionY]);

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
    try {
      await Share.share({
        title: `Prenota da ${brandName}`,
        message: buildClientInviteMessage(brandName, salonWorkspace.salonCode, salonClientLink),
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
            iconOffsetY={-8}
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
              <Text style={styles.heroMetricLabel}>
                {tApp(appLanguage, 'home_appointments_today')}
              </Text>
            </View>

            <View style={styles.heroMetricCardRose}>
              <Text style={styles.heroMetricNumber}>€ {valoreDaIncassare.toFixed(0)}</Text>
              <Text style={styles.heroMetricLabel}>{tApp(appLanguage, 'home_to_collect')}</Text>
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
            <Text style={styles.insightTitle}>{tApp(appLanguage, 'tab_clients')}</Text>
            <Text style={styles.insightNumber}>{numeroClienti}</Text>
            <Text style={styles.insightHint}>
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
            <Text style={styles.insightTitle}>{tApp(appLanguage, 'home_total_income')}</Text>
            <Text style={styles.insightNumber}>€ {incassoTotale.toFixed(0)}</Text>
            <Text style={styles.insightHint}>
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
            <Text style={styles.infoLabel}>{tApp(appLanguage, 'home_collected')}</Text>
            <Text style={styles.infoValue}>{appuntamentiIncassati}</Text>
          </View>

          <View
            style={[styles.infoCardLavender, responsive.isTablet && styles.infoCardResponsive]}
          >
            <Text style={styles.infoLabel}>{tApp(appLanguage, 'home_bookings')}</Text>
            <Text style={styles.infoValue}>{numeroAppuntamenti}</Text>
          </View>

          <View style={[styles.infoCardPeach, responsive.isTablet && styles.infoCardResponsive]}>
            <Text style={styles.infoLabel}>{tApp(appLanguage, 'home_to_collect')}</Text>
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
            !profiloSaloneCompleto && styles.sectionCardMandatory,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
          onLayout={handleProfileSectionLayout}
        >
          {!profiloSaloneCompleto ? (
            <View style={styles.mandatoryIntroCard}>
              <View style={styles.mandatoryIntroGlow} />
              <View style={styles.mandatoryIntroBadge}>
                <Ionicons name="sparkles" size={18} color="#ffffff" />
              </View>
              <Text style={styles.mandatoryIntroEyebrow}>Primo accesso</Text>
              <Text style={styles.mandatoryIntroTitle}>Completa registrazione salone</Text>
              <Text style={styles.mandatoryIntroText}>
                Inserisci i dati base del salone per sbloccare tutta l&apos;app e renderla pronta
                per clienti, agenda e frontend.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.profileAccordionButton}
            onPress={() => {
              if (!profiloSaloneCompleto) {
                setShowProfileSection(true);
                return;
              }
              setShowProfileSection((current) => !current);
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
                {profiloSaloneCompleto
                  ? tApp(appLanguage, 'home_profile_title')
                  : tApp(appLanguage, 'home_complete_profile')}
              </Text>
              <Text
                style={[
                  styles.sectionSubtext,
                  styles.sectionSubtextCentered,
                  styles.profileAccordionSubtext,
                ]}
              >
                {profiloSaloneCompleto
                  ? 'Tocca per aprire o chiudere il profilo del salone.'
                  : 'Compilazione obbligatoria al primo accesso.'}
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

          {showProfileSection ? (
            <>
              <View style={styles.profileEditorWrap}>
                <View style={styles.profilePreviewCard}>
                  <View style={styles.profilePreviewHeader}>
                    <Text style={styles.profilePreviewEyebrow}>Anteprima insegna</Text>
                    <Text style={styles.profilePreviewProgress}>
                      {requiredFieldsFilled}/6 campi obbligatori
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.profilePreviewName,
                      salonNameDisplayStyleInput === 'minuscolo' && styles.profilePreviewNameLower,
                      salonNameDisplayStyleInput === 'stampatello' &&
                        styles.profilePreviewNameUpper,
                      { fontFamily: salonNameFontOptions.find((item) => item.key === salonNameFontVariantInput)?.family },
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

                <View style={styles.formGroupCard}>
                  <TouchableOpacity
                    style={styles.fontDropdownButton}
                    onPress={() => setShowFontPicker((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <View style={styles.fontDropdownTextWrap}>
                      <Text style={styles.formGroupTitle}>Font insegna</Text>
                      <Text style={styles.formGroupCaption}>
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

                <View style={styles.formGroupCard}>
                  <Text style={styles.formGroupTitle}>Identita salone</Text>
                  <Text style={styles.formGroupCaption}>
                    Imposta nome pubblico e categoria dell&apos;attivita.
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
                    placeholder="Categoria attivita (opzionale)"
                    placeholderTextColor="#8f8f8f"
                    editable={canEditSalonProfile}
                    autoCapitalize="characters"
                    returnKeyType="next"
                    onSubmitEditing={() => businessPhoneFieldRef.current?.focus()}
                    blurOnSubmit={false}
                  />
                </View>

                <View style={styles.formGroupCard} onLayout={handleContactsSectionLayout}>
                  <Text style={styles.formGroupTitle}>Contatti e indirizzo</Text>
                  <Text style={styles.formGroupCaption}>
                    Questi dati servono per attivare correttamente il salone.
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
                  </View>

                  <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_postal_code')}</Text>
                  <ClearableTextInput
                    ref={postalCodeFieldRef}
                    style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
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

              <TouchableOpacity
                style={[styles.previewButton, savingSalon && styles.buttonDisabled]}
                onPress={salvaDatiSalone}
                activeOpacity={0.9}
                disabled={savingSalon}
              >
                <Text style={styles.previewButtonText}>
                  {savingSalon
                    ? 'Salvataggio...'
                    : profiloSaloneCompleto
                      ? tApp(appLanguage, 'home_save_profile')
                      : tApp(appLanguage, 'home_complete_profile_button')}
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
              style={styles.resetButton}
              onPress={() => caricaSaloneDaSupabase()}
              activeOpacity={0.9}
            >
              <Text style={styles.resetButtonText}>Ricarica da Supabase</Text>
            </TouchableOpacity>

            <Text style={styles.accountHint}>Attuale: {salonAccountEmail}</Text>
            <Text style={styles.accountHint}>
              Record Supabase: {salonRecordId || 'Non creato'}
            </Text>
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
                onPress={() => aggiornaStatoWorkspace('demo', 'demo')}
                activeOpacity={0.9}
              >
                <Text style={styles.adminStatusChipText}>Demo</Text>
              </TouchableOpacity>

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
            Questo codice collega il frontend cliente direttamente a questo salone. Puoi condividere
            il link oppure far inserire il codice manualmente.
          </Text>

          <View style={styles.accessCard}>
            <Text style={styles.accessLabel}>Codice salone</Text>
            <Text style={styles.accessCode}>{salonWorkspace.salonCode}</Text>
            <Text style={styles.accessLink} numberOfLines={2}>
              {salonClientLink}
            </Text>
          </View>

          <View style={[styles.qrCard, responsive.isTablet && styles.qrCardResponsive]}>
            <QRCode value={salonClientLink} size={170} color="#111111" backgroundColor="#ffffff" />
            <Text style={styles.qrTitle}>QR cliente del salone</Text>
            <Text style={styles.qrText}>
              Questo QR è fisso: il cliente lo scansiona e si apre direttamente nel tuo salone.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.previewButton}
            onPress={() =>
              router.push({
                pathname: '/cliente',
                params: { salon: salonWorkspace.salonCode },
              })
            }
            activeOpacity={0.9}
          >
            <Text style={styles.previewButtonText}>Apri frontend cliente del salone</Text>
          </TouchableOpacity>

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
            Qui puoi aprire l’anteprima cliente oppure ripartire dai dati demo.
          </Text>

          <TouchableOpacity
            style={styles.previewButton}
            onPress={() =>
              router.push({
                pathname: '/cliente',
                params: { salon: salonWorkspace.salonCode },
              })
            }
            activeOpacity={0.9}
          >
            <Text style={styles.previewButtonText}>Apri frontend cliente</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.resetButton}
            onPress={resetDatiDemo}
            activeOpacity={0.9}
          >
            <Text style={styles.resetButtonText}>Reset dati demo</Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>

      {showMandatoryProfileOverlay ? (
        <View style={styles.mandatoryOverlay}>
          <View style={styles.mandatoryOverlayCard}>
            <View style={styles.mandatoryOverlayAccent} />
            <View style={styles.mandatoryOverlayBadge}>
              <Ionicons name="sparkles" size={20} color="#ffffff" />
            </View>
            <Text style={styles.mandatoryOverlayEyebrow}>Onboarding salone</Text>
            <Text style={styles.mandatoryOverlayTitle}>Profilo salone obbligatorio</Text>
            <Text style={styles.mandatoryOverlayText}>
              Al primo accesso devi completare il profilo del salone prima di continuare a usare
              l&apos;app.
            </Text>

            <TouchableOpacity
              style={styles.mandatoryOverlayButton}
              onPress={focusMandatoryProfile}
              activeOpacity={0.9}
            >
              <Text style={styles.mandatoryOverlayButtonText}>Compila ora</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
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
