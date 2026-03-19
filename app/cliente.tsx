import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
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
import { HeroSalonName } from '../components/hero-salon-name';
import { NativeDatePickerModal } from '../components/ui/native-date-picker-modal';
import { useAppContext } from '../src/context/AppContext';
import {
  buildDisplayTimeSlots,
  buildFutureDates,
  doesAppointmentOccupySlot,
  doesServiceFitWithinDaySchedule,
  doesServiceOverlapLunchBreak,
  doesServiceUseOperators,
  findConflictingAppointment,
  formatDateCompact,
  formatDateLong,
  getDateAvailabilityInfo,
  getEligibleOperatorsForService,
  getServiceDuration,
  getTodayDateString,
  isSlotBlockedByOverride,
  isTimeBlockedByLunchBreak,
  isTimeWithinDaySchedule,
  normalizeAvailabilitySettings,
  parseIsoDate,
  timeToMinutes,
} from '../src/lib/booking';
import { appFonts } from '../src/lib/fonts';
import { AppLanguage, resolveStoredAppLanguage, tApp } from '../src/lib/i18n';
import { formatSalonAddress, normalizeSalonCode, SalonWorkspace } from '../src/lib/platform';

const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LANGUAGE_KEY = 'salon_manager_frontend_language';

type FrontendProfile = {
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  instagram: string;
};

type PublicSalonState = {
  workspace: SalonWorkspace;
  clienti: {
    id: string;
    nome: string;
    telefono: string;
    email?: string;
    instagram?: string;
    nota: string;
    fonte?: 'salone' | 'frontend';
    viewedBySalon?: boolean;
    annullamentiCount?: number;
    inibito?: boolean;
  }[];
  appuntamenti: {
    id: string;
    data?: string;
    ora: string;
    cliente: string;
    servizio: string;
    prezzo: number;
    durataMinuti?: number;
    operatoreId?: string;
    operatoreNome?: string;
    incassato?: boolean;
    completato?: boolean;
    nonEffettuato?: boolean;
  }[];
  servizi: {
    id: string;
    nome: string;
    prezzo: number;
    prezzoOriginale?: number;
    durataMinuti?: number;
    mestiereRichiesto?: string;
  }[];
  operatori: {
    id: string;
    nome: string;
    mestiere: string;
    availability?: {
      enabledWeekdays: number[];
      dateRanges: {
        id: string;
        startDate: string;
        endDate: string;
        label?: string;
      }[];
    };
  }[];
  richiestePrenotazione: {
    id: string;
    data: string;
    ora: string;
    servizio: string;
    prezzo: number;
    durataMinuti?: number;
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    instagram?: string;
    note?: string;
    operatoreId?: string;
    operatoreNome?: string;
    origine?: 'frontend' | 'backoffice';
    stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
    createdAt: string;
    viewedByCliente?: boolean;
    viewedBySalon?: boolean;
  }[];
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
};

const EMPTY_PROFILE: FrontendProfile = {
  nome: '',
  cognome: '',
  email: '',
  telefono: '',
  instagram: '',
};

const getServiceAccent = (serviceName: string) => {
  const value = serviceName.trim().toLowerCase();

  if (value.includes('barba')) {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  }

  if (value.includes('capelli') || value.includes('taglio')) {
    return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }

  return { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' };
};

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');

const canCancelUntilPreviousMidnight = (appointmentDate: string) => {
  const cutoff = parseIsoDate(appointmentDate);
  cutoff.setHours(0, 0, 0, 0);
  return Date.now() < cutoff.getTime();
};

const formatDurationLabel = (durationMinutes: number) => {
  if (durationMinutes === 30) return '30 min';
  if (durationMinutes === 60) return '1 ora';
  if (durationMinutes === 90) return '1 ora e 30';
  return `${durationMinutes} min`;
};

export default function ClienteFrontendScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ salon?: string | string[] }>();
  const scrollRef = useRef<ScrollView | null>(null);
  const lastUnreadCancelledSignatureRef = useRef('');
  const cognomeInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const telefonoInputRef = useRef<TextInput | null>(null);
  const instagramInputRef = useRef<TextInput | null>(null);
  const noteInputRef = useRef<TextInput | null>(null);
  const {
    richiestePrenotazione,
    appuntamenti,
    clienti,
    servizi,
    operatori,
    salonWorkspace,
    availabilitySettings,
    resolveSalonByCode,
    upsertFrontendCustomerForSalon,
    addBookingRequestForSalon,
    markClientRequestsViewedForSalon,
    cancelClientAppointmentForSalon,
  } = useAppContext();

  const [profile, setProfile] = useState<FrontendProfile>(EMPTY_PROFILE);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isBookingStarted, setIsBookingStarted] = useState(false);
  const [showRequestsExpanded, setShowRequestsExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [data, setData] = useState(getTodayDateString());
  const [servizio, setServizio] = useState('');
  const [operatoreId, setOperatoreId] = useState('');
  const [operatoreNome, setOperatoreNome] = useState('');
  const [ora, setOra] = useState('');
  const [note, setNote] = useState('');
  const [ultimaRichiesta, setUltimaRichiesta] = useState<{
    nomeCompleto: string;
    data: string;
    ora: string;
    servizio: string;
    operatoreNome?: string;
  } | null>(null);
  const initialSalonCodeParam = Array.isArray(searchParams.salon)
    ? searchParams.salon[0]
    : searchParams.salon;
  const [selectedSalonCode, setSelectedSalonCode] = useState(
    initialSalonCodeParam || salonWorkspace.salonCode
  );
  const [salonCodeDraft, setSalonCodeDraft] = useState(
    initialSalonCodeParam || salonWorkspace.salonCode
  );
  const [publicSalonState, setPublicSalonState] = useState<PublicSalonState | null>(null);
  const [isLoadingSalon, setIsLoadingSalon] = useState(false);
  const [salonLoadError, setSalonLoadError] = useState('');
  const [frontendLanguage, setFrontendLanguage] = useState<AppLanguage>('it');

  const normalizedSelectedSalonCode = normalizeSalonCode(selectedSalonCode);
  const isCurrentWorkspaceSalon =
    !normalizedSelectedSalonCode || normalizedSelectedSalonCode === salonWorkspace.salonCode;
  const effectiveWorkspace = isCurrentWorkspaceSalon
    ? salonWorkspace
    : publicSalonState?.workspace ?? null;
  const effectiveServizi = useMemo(
    () => (isCurrentWorkspaceSalon ? servizi : publicSalonState?.servizi ?? []),
    [isCurrentWorkspaceSalon, publicSalonState?.servizi, servizi]
  );
  const effectiveOperatori = useMemo(
    () => (isCurrentWorkspaceSalon ? operatori : publicSalonState?.operatori ?? []),
    [isCurrentWorkspaceSalon, operatori, publicSalonState?.operatori]
  );
  const effectiveAppuntamenti = useMemo(
    () =>
      isCurrentWorkspaceSalon ? appuntamenti : publicSalonState?.appuntamenti ?? [],
    [appuntamenti, isCurrentWorkspaceSalon, publicSalonState?.appuntamenti]
  );
  const effectiveRichieste = useMemo(
    () =>
      isCurrentWorkspaceSalon
        ? richiestePrenotazione
        : publicSalonState?.richiestePrenotazione ?? [],
    [isCurrentWorkspaceSalon, publicSalonState?.richiestePrenotazione, richiestePrenotazione]
  );
  const effectiveAvailabilitySettings = isCurrentWorkspaceSalon
    ? availabilitySettings
    : publicSalonState?.availabilitySettings ?? normalizeAvailabilitySettings();
  const salonAddress = effectiveWorkspace ? formatSalonAddress(effectiveWorkspace) : '';
  const salonBusinessPhone = effectiveWorkspace?.businessPhone?.trim() ?? '';
  const salonActivityCategory = effectiveWorkspace?.activityCategory?.trim() ?? '';
  const displayTimeSlots = useMemo(
    () => buildDisplayTimeSlots(effectiveAvailabilitySettings, data),
    [effectiveAvailabilitySettings, data]
  );
  const tf = useCallback(
    (key: Parameters<typeof tApp>[1], params?: Record<string, string | number>) =>
      tApp(frontendLanguage, key, params),
    [frontendLanguage]
  );

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [saved, savedLanguage] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY),
        ]);
        setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
        if (!saved) return;

        const parsed = JSON.parse(saved) as FrontendProfile;
        setProfile({
          nome: parsed.nome ?? '',
          cognome: parsed.cognome ?? '',
          email: parsed.email ?? '',
          telefono: parsed.telefono ?? '',
          instagram: parsed.instagram ?? '',
        });
        if (
          parsed.nome?.trim() &&
          parsed.cognome?.trim() &&
          parsed.email?.trim() &&
          parsed.telefono?.trim()
        ) {
          setIsRegistered(true);
        }
      } catch (error) {
        console.log('Errore caricamento profilo cliente:', error);
      }
    };

    loadProfile();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refreshFrontendPreferences = async () => {
        try {
          const savedLanguage = await AsyncStorage.getItem(FRONTEND_LANGUAGE_KEY);
          if (active) {
            setFrontendLanguage(resolveStoredAppLanguage(savedLanguage));
          }
        } catch (error) {
          console.log('Errore aggiornamento lingua frontend:', error);
        }
      };

      refreshFrontendPreferences();

      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    AsyncStorage.setItem(FRONTEND_LANGUAGE_KEY, frontendLanguage);
  }, [frontendLanguage]);

  useEffect(() => {
    const incomingSalonCode = Array.isArray(searchParams.salon)
      ? searchParams.salon[0]
      : searchParams.salon;

    if (incomingSalonCode) {
      setSelectedSalonCode(incomingSalonCode);
      setSalonCodeDraft(incomingSalonCode);
    }
  }, [searchParams.salon]);

  useEffect(() => {
    const loadSalon = async () => {
      if (isCurrentWorkspaceSalon) {
        setPublicSalonState(null);
        setSalonLoadError('');
        return;
      }

      if (!normalizedSelectedSalonCode) {
        setPublicSalonState(null);
        setSalonLoadError('Inserisci un codice salone valido per continuare.');
        return;
      }

      setIsLoadingSalon(true);
      setPublicSalonState(null);
      const resolved = await resolveSalonByCode(normalizedSelectedSalonCode);
      setIsLoadingSalon(false);

      if (!resolved) {
        setPublicSalonState(null);
        setSalonLoadError(
          'Questo codice salone non è stato trovato. Controlla il codice oppure usa il link del tuo parrucchiere.'
        );
        return;
      }

      setPublicSalonState(resolved);
      setSalonLoadError('');
    };

    loadSalon();
  }, [isCurrentWorkspaceSalon, normalizedSelectedSalonCode, resolveSalonByCode]);

  const giorniDisponibili = useMemo(() => buildFutureDates(90), []);

  const appuntamentiDelGiorno = useMemo(
    () =>
      effectiveAppuntamenti
        .filter((item) => (item.data ?? getTodayDateString()) === data)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [effectiveAppuntamenti, data]
  );

  const operatoriCompatibili = useMemo(
    () =>
      servizio.trim()
        ? getEligibleOperatorsForService({
            serviceName: servizio,
            services: effectiveServizi,
            operators: effectiveOperatori,
            appointmentDate: data,
            settings: effectiveAvailabilitySettings,
          })
        : [],
    [data, effectiveAvailabilitySettings, effectiveOperatori, effectiveServizi, servizio]
  );
  const useOperatorScheduling = effectiveOperatori.length > 0;
  const serviceRequiresOperatorScheduling =
    !!servizio.trim() &&
    useOperatorScheduling &&
    doesServiceUseOperators(servizio, effectiveServizi);
  const serviceUsesOperatorScheduling =
    serviceRequiresOperatorScheduling && operatoriCompatibili.length > 0;
  const operatorSelectionRequired =
    serviceUsesOperatorScheduling && operatoriCompatibili.length > 1;

  const richiestaInConflitto =
    data && ora && servizio
      ? findConflictingAppointment({
          appointmentDate: data,
          startTime: ora,
          serviceName: servizio,
          appointments: effectiveAppuntamenti,
          services: effectiveServizi,
          operatorId: operatoreId || null,
          useOperators: serviceUsesOperatorScheduling,
        })
      : null;

  useEffect(() => {
    if (!serviceUsesOperatorScheduling || operatoriCompatibili.length === 0) {
      setOperatoreId('');
      setOperatoreNome('');
      return;
    }

    if (operatoriCompatibili.length === 1) {
      const [singleOperator] = operatoriCompatibili;

      if (singleOperator && singleOperator.id !== operatoreId) {
        setOperatoreId(singleOperator.id);
        setOperatoreNome(singleOperator.nome);
        setOra('');
      }

      return;
    }

    if (!operatoriCompatibili.some((item) => item.id === operatoreId)) {
      setOperatoreId('');
      setOperatoreNome('');
      setOra('');
    }
  }, [operatoreId, operatoriCompatibili, serviceUsesOperatorScheduling]);

  const clienteInibito = useMemo(() => {
    if (!isRegistered) return false;

    const sourceClienti = isCurrentWorkspaceSalon ? clienti : publicSalonState?.clienti ?? [];

    return sourceClienti.some((item: PublicSalonState['clienti'][number]) => {
      const samePhone = item.telefono.trim() === profile.telefono.trim();
      const sameEmail =
        (item.email ?? '').trim().toLowerCase() === profile.email.trim().toLowerCase();

      return (samePhone || sameEmail) && item.inibito === true;
    });
  }, [
    clienti,
    isCurrentWorkspaceSalon,
    isRegistered,
    profile.email,
    profile.telefono,
    publicSalonState?.clienti,
  ]);

  const orariInConflitto = new Set(
    displayTimeSlots.filter((slotTime) => {
      if (!servizio) return false;
      if (getDateAvailabilityInfo(effectiveAvailabilitySettings, data).closed) {
        return false;
      }

      return !!findConflictingAppointment({
        appointmentDate: data,
        startTime: slotTime,
        serviceName: servizio,
        appointments: effectiveAppuntamenti,
        services: effectiveServizi,
        operatorId: serviceUsesOperatorScheduling ? operatoreId : null,
        useOperators: serviceUsesOperatorScheduling,
      });
    })
  );

  const getFrontendSlotAvailableCount = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
      operators,
      appointments,
      services,
      settings,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
      operators: typeof effectiveOperatori;
      appointments: typeof effectiveAppuntamenti;
      services: typeof effectiveServizi;
      settings: typeof effectiveAvailabilitySettings;
    }) => {
      if (!serviceName.trim()) return 0;
      if (!isTimeWithinDaySchedule(settings, dateValue, startTime)) return 0;
      if (
        !doesServiceFitWithinDaySchedule({
          settings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName, services),
        })
      ) {
        return 0;
      }
      if (isSlotBlockedByOverride(settings, dateValue, startTime)) return 0;
      if (
        doesServiceOverlapLunchBreak({
          settings,
          startTime,
          durationMinutes: getServiceDuration(serviceName, services),
        })
      ) {
        return 0;
      }

      const appointmentsForDate = appointments.filter(
        (item) => (item.data ?? getTodayDateString()) === dateValue
      );
      const serviceStart = timeToMinutes(startTime);
      const serviceEnd = serviceStart + getServiceDuration(serviceName, services);
      const overlappingAppointments = appointmentsForDate.filter((item) => {
        const existingStart = timeToMinutes(item.ora);
        const existingEnd =
          existingStart +
          (typeof item.durataMinuti === 'number'
            ? item.durataMinuti
            : getServiceDuration(item.servizio, services));

        return serviceStart < existingEnd && serviceEnd > existingStart;
      });

      if (!serviceUsesOperatorScheduling) {
        return overlappingAppointments.length === 0 ? 1 : 0;
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName,
        services,
        operators,
        appointmentDate: dateValue,
        settings: effectiveAvailabilitySettings,
      });

      if (compatibleOperators.length === 0) {
        return 0;
      }

      const selectedOperator = selectedOperatorId?.trim() ?? '';
      if (selectedOperator) {
        const isSelectedOperatorAvailable = compatibleOperators.some(
          (item) => item.id.trim() === selectedOperator
        );

        if (!isSelectedOperatorAvailable) {
          return 0;
        }

        return overlappingAppointments.some(
          (item) => (item.operatoreId?.trim() ?? '') === selectedOperator
        )
          ? 0
          : 1;
      }

      const compatibleIds = new Set(
        compatibleOperators.map((item) => item.id.trim()).filter(Boolean)
      );
      const busyCompatibleIds = new Set(
        overlappingAppointments
          .map((item) => item.operatoreId?.trim() ?? '')
          .filter((id) => compatibleIds.has(id))
      );
      const anonymousOverlaps = overlappingAppointments.filter(
        (item) => !(item.operatoreId?.trim() ?? '')
      ).length;

      return Math.max(
        0,
        compatibleOperators.length - busyCompatibleIds.size - anonymousOverlaps
      );
    },
    [effectiveAvailabilitySettings, serviceUsesOperatorScheduling]
  );

  const orariNonDisponibili = new Set(
    displayTimeSlots.filter((slotTime) => {
      if (clienteInibito) {
        return true;
      }

      if (getDateAvailabilityInfo(effectiveAvailabilitySettings, data).closed) {
        return true;
      }

      if (!isTimeWithinDaySchedule(effectiveAvailabilitySettings, data, slotTime)) {
        return true;
      }

      if (
        servizio &&
        !doesServiceFitWithinDaySchedule({
          settings: effectiveAvailabilitySettings,
          dateValue: data,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio, effectiveServizi),
        })
      ) {
        return true;
      }

      if (
        servizio &&
        doesServiceOverlapLunchBreak({
          settings: effectiveAvailabilitySettings,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio, effectiveServizi),
        })
      ) {
        return true;
      }

      if (isSlotBlockedByOverride(effectiveAvailabilitySettings, data, slotTime)) {
        return true;
      }

      if (!servizio) {
        return appuntamentiDelGiorno.some((item) =>
          doesAppointmentOccupySlot(item, slotTime, effectiveServizi)
        );
      }

      return (
        getFrontendSlotAvailableCount({
          dateValue: data,
          startTime: slotTime,
          serviceName: servizio,
          selectedOperatorId: operatoreId || null,
          operators: effectiveOperatori,
          appointments: effectiveAppuntamenti,
          services: effectiveServizi,
          settings: effectiveAvailabilitySettings,
        }) === 0
      );
    })
  );
  const servizioSelezionato = effectiveServizi.find((item) => item.nome === servizio) ?? null;
  const selectedDateAvailability = useMemo(
    () => getDateAvailabilityInfo(effectiveAvailabilitySettings, data),
    [effectiveAvailabilitySettings, data]
  );
  const overlapsLunchBreakSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    doesServiceOverlapLunchBreak({
      settings: effectiveAvailabilitySettings,
      startTime: ora,
      durationMinutes: getServiceDuration(servizio, effectiveServizi),
    });
  const selectedServiceDuration = servizio.trim()
    ? getServiceDuration(servizio, effectiveServizi)
    : 0;
  const exceedsClosingTimeSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    !doesServiceFitWithinDaySchedule({
      settings: effectiveAvailabilitySettings,
      dateValue: data,
      startTime: ora,
      durationMinutes: selectedServiceDuration,
    });
  const selectedTimeRange = useMemo(() => {
    if (!servizio.trim() || !ora.trim()) return new Set<string>();

    const start = timeToMinutes(ora);
    const end = start + selectedServiceDuration;

    return new Set(
      displayTimeSlots.filter((slotTime) => {
        const slot = timeToMinutes(slotTime);
        return slot >= start && slot < end;
      })
    );
  }, [displayTimeSlots, ora, selectedServiceDuration, servizio]);

  const canSaveProfile =
    profile.nome.trim() !== '' &&
    profile.cognome.trim() !== '' &&
    profile.email.trim() !== '' &&
    profile.telefono.trim() !== '';

  const canSendRequest =
    !!effectiveWorkspace &&
    !isLoadingSalon &&
    isRegistered &&
    servizio.trim() !== '' &&
    (!serviceUsesOperatorScheduling || !operatorSelectionRequired || operatoreId.trim() !== '') &&
    ora.trim() !== '' &&
    !selectedDateAvailability.closed &&
    !clienteInibito &&
    !exceedsClosingTimeSelection &&
    !overlapsLunchBreakSelection &&
    !richiestaInConflitto;
  const canChooseDay = !!effectiveWorkspace && servizio.trim() !== '';
  const canChooseOperator = canChooseDay && !selectedDateAvailability.closed;
  const canChooseTime =
    canChooseOperator &&
    (!serviceUsesOperatorScheduling || !operatorSelectionRequired || operatoreId.trim() !== '');
  const canWriteNote = canChooseTime && ora.trim() !== '';
  const visibleFrontendTimeSlots =
    canChooseTime && servizio.trim()
      ? displayTimeSlots.filter(
          (slotTime) => !orariNonDisponibili.has(slotTime) && !orariInConflitto.has(slotTime)
        )
      : displayTimeSlots;

  const mieRichieste = useMemo(() => {
    if (!isRegistered) return [];

    return effectiveRichieste
      .filter(
        (item) =>
          item.email.trim().toLowerCase() === profile.email.trim().toLowerCase() &&
          item.telefono.trim() === profile.telefono.trim()
      )
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }, [effectiveRichieste, isRegistered, profile.email, profile.telefono]);

  const notificheRisposteCount = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
      ).length,
    [mieRichieste]
  );

  const unreadCancelledRequests = useMemo(
    () =>
      mieRichieste.filter(
        (item) => item.stato === 'Annullata' && item.viewedByCliente === false
      ),
    [mieRichieste]
  );

  useEffect(() => {
    if (!isRegistered || unreadCancelledRequests.length === 0) {
      lastUnreadCancelledSignatureRef.current = '';
      return;
    }

    const signature = unreadCancelledRequests.map((item) => item.id).sort().join('|');
    if (signature === lastUnreadCancelledSignatureRef.current) return;

    lastUnreadCancelledSignatureRef.current = signature;

    Alert.alert(
      'Appuntamento annullato dal salone',
      unreadCancelledRequests.length === 1
        ? 'Il salone ha programmato una chiusura in una data che include una tua prenotazione. L’appuntamento è stato annullato.'
        : `Il salone ha programmato una chiusura in date che includono ${unreadCancelledRequests.length} tue prenotazioni. Gli appuntamenti sono stati annullati.`,
      [
        {
          text: 'Apri prenotazioni',
          onPress: () => setShowRequestsExpanded(true),
        },
      ]
    );
  }, [isRegistered, unreadCancelledRequests]);

  useEffect(() => {
    if (!isRegistered || !showRequestsExpanded) return;

    const hasUnread = mieRichieste.some(
      (item) => item.stato !== 'In attesa' && item.viewedByCliente === false
    );

    if (!hasUnread) return;

    markClientRequestsViewedForSalon(
      effectiveWorkspace?.salonCode ?? salonWorkspace.salonCode,
      profile.email,
      profile.telefono
    );

    if (!isCurrentWorkspaceSalon) {
      setPublicSalonState((current) =>
        current
          ? {
              ...current,
              richiestePrenotazione: current.richiestePrenotazione.map((item) =>
                item.email.trim().toLowerCase() === profile.email.trim().toLowerCase() &&
                item.telefono.trim() === profile.telefono.trim() &&
                item.stato !== 'In attesa'
                  ? { ...item, viewedByCliente: true }
                  : item
              ),
            }
          : current
      );
    }
  }, [
    effectiveWorkspace?.salonCode,
    isRegistered,
    isCurrentWorkspaceSalon,
    mieRichieste,
    markClientRequestsViewedForSalon,
    profile.email,
    profile.telefono,
    showRequestsExpanded,
    salonWorkspace.salonCode,
  ]);

  const saveProfile = async () => {
    if (!canSaveProfile) {
      Alert.alert(
        'Registrazione incompleta',
        'Compila nome, cognome, email e numero di cellulare per continuare.'
      );
      return;
    }

    if (!effectiveWorkspace) {
      Alert.alert(
        'Salone non disponibile',
        'Apri il link corretto del salone oppure inserisci un codice valido prima di registrarti.'
      );
      return;
    }

    await AsyncStorage.setItem(
      FRONTEND_PROFILE_KEY,
      JSON.stringify({
        nome: profile.nome.trim(),
        cognome: profile.cognome.trim(),
        email: profile.email.trim(),
        telefono: profile.telefono.trim(),
        instagram: profile.instagram.trim(),
      })
    );

    const saved = await upsertFrontendCustomerForSalon({
      salonCode: effectiveWorkspace.salonCode,
      profile: {
        nome: profile.nome,
        cognome: profile.cognome,
        email: profile.email,
        telefono: profile.telefono,
        instagram: profile.instagram,
      },
    });

    if (!saved) {
      Alert.alert(
        'Registrazione non completata',
        'Non sono riuscito a collegare il tuo profilo al salone selezionato. Riprova tra un attimo.'
      );
      return;
    }

    setIsRegistered(true);
    setIsBookingStarted(false);
    setShowRequestsExpanded(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const resetFrontendCliente = () => {
    setData(getTodayDateString());
    setServizio('');
    setOperatoreId('');
    setOperatoreNome('');
    setOra('');
    setNote('');
    setIsBookingStarted(false);
    setShowRequestsExpanded(false);
    setUltimaRichiesta(null);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  };

  const inviaRichiesta = async () => {
    if (!isRegistered) {
      Alert.alert(
        'Registrazione richiesta',
        'Prima registra il tuo profilo cliente, poi invia la richiesta di prenotazione.'
      );
      return;
    }

    if (!servizio.trim() || !ora.trim()) {
      Alert.alert(
        'Dati mancanti',
        'Scegli servizio, giorno e orario prima di inviare la richiesta.'
      );
      return;
    }

    if (selectedDateAvailability.closed) {
      Alert.alert(
        'Giorno non disponibile',
        'Il salone ha impostato questo giorno come chiuso o festivo. Scegline uno disponibile.'
      );
      return;
    }

    if (
      doesServiceOverlapLunchBreak({
        settings: effectiveAvailabilitySettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, effectiveServizi),
      })
    ) {
      Alert.alert(
        'Orario non disponibile',
        'Questo servizio si accavalla con la pausa pranzo del salone. Scegli un altro orario.'
      );
      return;
    }

    if (exceedsClosingTimeSelection) {
      const daySchedule = effectiveAvailabilitySettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      Alert.alert(
        'Orario oltre chiusura',
        `Questo servizio finirebbe oltre l'orario di chiusura del salone${daySchedule ? `, previsto alle ${daySchedule.endTime}` : ''}. Scegli un orario precedente.`
      );
      return;
    }

    if (!effectiveWorkspace) {
      Alert.alert(
        'Salone non disponibile',
        'Apri il link corretto del salone oppure inserisci un codice valido prima di inviare la richiesta.'
      );
      return;
    }

    const latestSalonState =
      !isCurrentWorkspaceSalon && effectiveWorkspace?.salonCode
        ? await resolveSalonByCode(effectiveWorkspace.salonCode)
        : null;

    const validationServices = latestSalonState?.servizi ?? effectiveServizi;
    const validationOperators = latestSalonState?.operatori ?? effectiveOperatori;
    const validationAppointments = latestSalonState?.appuntamenti ?? effectiveAppuntamenti;
    const validationSettings =
      latestSalonState?.availabilitySettings ?? effectiveAvailabilitySettings;
    const validationOperatoriCompatibili = servizio.trim()
      ? getEligibleOperatorsForService({
          serviceName: servizio,
          services: validationServices,
          operators: validationOperators,
          appointmentDate: data,
          settings: validationSettings,
        })
      : [];
    const validationServiceUsesOperatorScheduling =
      !!servizio.trim() &&
      validationOperators.length > 0 &&
      doesServiceUseOperators(servizio, validationServices) &&
      validationOperatoriCompatibili.length > 0;

    if (latestSalonState) {
      setPublicSalonState(latestSalonState);
    }

    const refreshedDateAvailability = getDateAvailabilityInfo(validationSettings, data);
    const refreshedConflict =
      data && ora && servizio
        ? findConflictingAppointment({
            appointmentDate: data,
            startTime: ora,
            serviceName: servizio,
            appointments: validationAppointments,
            services: validationServices,
            operatorId: validationServiceUsesOperatorScheduling ? operatoreId : null,
            useOperators: validationServiceUsesOperatorScheduling,
          })
        : null;

    const refreshedLunchOverlap =
      !!servizio.trim() &&
      !!ora.trim() &&
      doesServiceOverlapLunchBreak({
        settings: validationSettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, validationServices),
      });

    if (refreshedDateAvailability.closed) {
      Alert.alert(
        'Giorno non disponibile',
        'Il salone ha appena aggiornato questo giorno come chiuso o festivo. Scegline uno disponibile.'
      );
      return;
    }

    if (refreshedLunchOverlap) {
      Alert.alert(
        'Orario non disponibile',
        'Questo servizio si accavalla con la pausa pranzo del salone. Scegli un altro orario.'
      );
      return;
    }

    if (
      !doesServiceFitWithinDaySchedule({
        settings: validationSettings,
        dateValue: data,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio, validationServices),
      })
    ) {
      const daySchedule = validationSettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      Alert.alert(
        'Orario oltre chiusura',
        `Il salone chiude${daySchedule ? ` alle ${daySchedule.endTime}` : ' prima della fine di questo servizio'}. Scegli un orario precedente.`
      );
      return;
    }

    if (
      validationServiceUsesOperatorScheduling &&
      !validationOperatoriCompatibili.some((item) => item.id === operatoreId)
    ) {
      Alert.alert(
        'Operatore non disponibile',
        'Il salone ha appena aggiornato gli operatori disponibili per questo servizio. Scegli di nuovo il nome corretto.'
      );
      setOperatoreId('');
      setOperatoreNome('');
      setOra('');
      return;
    }

    const completeFrontendRequest = async () => {
      const nomeCompleto = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim();

      const nextRequest = {
        id: `req-${Date.now()}`,
        data,
        ora,
        servizio,
        prezzo:
          validationServices.find((item) => item.nome === servizio)?.prezzo ??
          servizioSelezionato?.prezzo ??
          0,
        durataMinuti: getServiceDuration(servizio, validationServices),
        operatoreId: operatoreId || undefined,
        operatoreNome: operatoreNome || undefined,
        nome: profile.nome.trim(),
        cognome: profile.cognome.trim(),
        email: profile.email.trim(),
        telefono: profile.telefono.trim(),
        instagram: profile.instagram.trim(),
        note: note.trim(),
        origine: 'frontend' as const,
        stato: 'In attesa' as const,
        createdAt: new Date().toISOString(),
        viewedByCliente: true,
        viewedBySalon: false,
      };

      const saved = await addBookingRequestForSalon(effectiveWorkspace.salonCode, nextRequest);

      if (!saved) {
        Alert.alert(
          'Richiesta non inviata',
          'Non sono riuscito a salvare la prenotazione sul salone selezionato. Riprova tra un attimo.'
        );
        return;
      }

      if (!isCurrentWorkspaceSalon) {
        const refreshed = await resolveSalonByCode(effectiveWorkspace.salonCode);
        if (refreshed) {
          setPublicSalonState(refreshed);
        }
      }

      setUltimaRichiesta({
        nomeCompleto,
        data,
        ora,
        servizio,
        operatoreNome: operatoreNome || '',
      });
      setData(getTodayDateString());
      setServizio('');
      setOperatoreId('');
      setOperatoreNome('');
      setOra('');
      setNote('');
      setIsBookingStarted(false);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    };

    if (refreshedConflict || richiestaInConflitto) {
      Alert.alert(
        'Orario non disponibile',
        `Hai scelto un orario che si sovrappone a un altro appuntamento. ${servizio} alle ${ora} non è disponibile il ${formatDateCompact(
          data
        )}.`
      );
      return;
    }

    await completeFrontendRequest();
  };

  const aggiungiRichiestaAccettataAlCalendario = async (richiestaId: string) => {
    const richiesta = mieRichieste.find((item) => item.id === richiestaId);
    if (!richiesta || richiesta.stato !== 'Accettata') return;

    try {
      const permission = await Calendar.requestCalendarPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert(
          'Permesso necessario',
          'Per salvare l’appuntamento nel calendario devi autorizzare l’accesso al calendario del telefono.'
        );
        return;
      }

      const eventDate = parseIsoDate(richiesta.data);
      const startDate = new Date(eventDate);
      const startMinutes = timeToMinutes(richiesta.ora);
      startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + (richiesta.durataMinuti ?? 60));

      await Calendar.createEventInCalendarAsync({
        title: `${richiesta.servizio} - ${richiesta.nome} ${richiesta.cognome}`.trim(),
        startDate,
        endDate,
        location: salonAddress || undefined,
        notes: [
          `Appuntamento confermato dal salone per ${richiesta.servizio}.`,
          salonAddress
            ? `Indirizzo salone: ${salonAddress}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch {
      Alert.alert(
        'Calendario non disponibile',
        'Non sono riuscito ad aprire il calendario del telefono. Riprova tra un attimo.'
      );
    }
  };

  const annullaPrenotazioneCliente = (requestId: string) => {
    const richiesta = mieRichieste.find((item) => item.id === requestId);
    if (!richiesta) return;

    if (richiesta.stato !== 'Accettata') {
      Alert.alert(
        'Annullamento non disponibile',
        'Puoi annullare solo appuntamenti già confermati dal salone.'
      );
      return;
    }

    if (!canCancelUntilPreviousMidnight(richiesta.data)) {
      Alert.alert(
        'Tempo scaduto',
        'Puoi annullare l’appuntamento solo fino alla mezzanotte del giorno prima. Contatta direttamente il salone.'
      );
      return;
    }

    if (!effectiveWorkspace) {
      Alert.alert('Salone non disponibile', 'Non riesco a contattare il salone in questo momento.');
      return;
    }

    Alert.alert(
      'Annulla appuntamento',
      `Vuoi davvero annullare ${richiesta.servizio} del ${formatDateLong(richiesta.data)} alle ${richiesta.ora}? Il salone verrà avvisato subito.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Conferma',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelClientAppointmentForSalon({
              salonCode: effectiveWorkspace.salonCode,
              requestId,
              email: profile.email,
              telefono: profile.telefono,
            });

            if (!result.ok) {
              Alert.alert(
                'Annullamento non riuscito',
                result.error ?? 'Non sono riuscito ad annullare la prenotazione.'
              );
              return;
            }

            if (!isCurrentWorkspaceSalon) {
              const refreshed = await resolveSalonByCode(effectiveWorkspace.salonCode);
              if (refreshed) {
                setPublicSalonState(refreshed);
              }
            }

            Alert.alert(
              'Appuntamento annullato',
              'La prenotazione è stata annullata e il salone è stato avvisato.'
            );
          },
        },
      ]
    );
  };

  const blurOnSubmit = (_event: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    Keyboard.dismiss();
  };

  const chiamaSalone = async () => {
    if (!salonBusinessPhone) {
      Alert.alert('Numero non disponibile', 'Questo salone non ha ancora impostato un numero di contatto.');
      return;
    }

    const dialablePhone = buildDialablePhone(salonBusinessPhone);

    try {
      const supported = await Linking.canOpenURL(`tel:${dialablePhone}`);
      if (!supported) {
        Alert.alert('Chiamata non disponibile', 'Questo dispositivo non può aprire la chiamata telefonica.');
        return;
      }

      await Linking.openURL(`tel:${dialablePhone}`);
    } catch {
      Alert.alert('Chiamata non disponibile', 'Non sono riuscito ad aprire la chiamata verso il salone.');
    }
  };

  const scriviWhatsAppSalone = async () => {
    if (!salonBusinessPhone) {
      Alert.alert('Numero non disponibile', 'Questo salone non ha ancora impostato un numero di contatto.');
      return;
    }

    const dialablePhone = buildDialablePhone(salonBusinessPhone).replace(/^\+/, '');
    const brandLabel = effectiveWorkspace?.salonName?.trim() || 'il salone';
    const message = encodeURIComponent(`Ciao, ti contatto dall'app per avere informazioni su una prenotazione da ${brandLabel}.`);
    const appUrl = `whatsapp://send?phone=${dialablePhone}&text=${message}`;
    const webUrl = `https://wa.me/${dialablePhone}?text=${message}`;

    try {
      const supportedApp = await Linking.canOpenURL(appUrl);
      if (supportedApp) {
        await Linking.openURL(appUrl);
        return;
      }

      const supportedWeb = await Linking.canOpenURL(webUrl);
      if (supportedWeb) {
        await Linking.openURL(webUrl);
        return;
      }

      Alert.alert('WhatsApp non disponibile', 'Non sono riuscito ad aprire WhatsApp su questo dispositivo.');
    } catch {
      Alert.alert('WhatsApp non disponibile', 'Non sono riuscito ad aprire la chat WhatsApp del salone.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.9}
            >
              <View style={[styles.actionIconBadge, styles.homeHouseSettingsButton]}>
                <Ionicons name="chevron-back" size={30} color="#050505" />
              </View>
              <Text style={styles.backButtonText}>{tf('common_back')}</Text>
            </TouchableOpacity>

            <View style={styles.heroTopActions}>
              <View style={styles.publicBadge}>
                <Text style={styles.publicBadgeText}>{tf('frontend_badge')}</Text>
              </View>
              <TouchableOpacity
                style={[styles.actionIconBadge, styles.homeHouseSettingsButton, styles.settingsGearBadge]}
                onPress={() =>
                  router.push({
                    pathname: '/cliente-impostazioni',
                    params: { salon: normalizedSelectedSalonCode || salonWorkspace.salonCode },
                  })
                }
                activeOpacity={0.9}
              >
                <Ionicons name="settings" size={24} color="#0f172a" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.frontendBrandBand}>
            <AppWordmark />
          </View>

          <View style={styles.frontendTitleBand}>
            <View style={styles.frontendTitleBadge}>
              <Ionicons name="sparkles-outline" size={20} color="#315ea8" />
            </View>
            <Text style={styles.title}>
              {effectiveWorkspace ? 'Prenota' : tf('frontend_find_salon')}
            </Text>
          </View>

          {effectiveWorkspace ? (
            <HeroSalonName
              salonName={effectiveWorkspace.salonName}
              displayStyle={effectiveWorkspace.salonNameDisplayStyle}
              fontVariant={effectiveWorkspace.salonNameFontVariant}
            />
          ) : null}

          {salonActivityCategory ? (
            <View style={styles.salonCategoryChip}>
              <Text style={styles.salonCategoryChipText}>{salonActivityCategory}</Text>
            </View>
          ) : null}
          <Text style={styles.subtitle}>{tf('frontend_subtitle')}</Text>

        {!isRegistered ? (
          <>
            <View style={styles.heroHighlightsRow}>
              <View style={styles.heroHighlightCard}>
                <Text style={styles.heroHighlightNumber}>{effectiveServizi.length}</Text>
                <Text style={styles.heroHighlightLabel}>{tf('frontend_bookable_services')}</Text>
              </View>

              <View style={styles.heroHighlightCardAccent}>
                <Text style={styles.heroHighlightNumber}>{giorniDisponibili.length}</Text>
                <Text style={styles.heroHighlightLabel}>{tf('frontend_available_days')}</Text>
              </View>
            </View>

            <View style={styles.heroInfoCard}>
              <Text style={styles.heroInfoTitle}>{tf('frontend_first_registration')}</Text>
              <Text style={styles.heroInfoText}>{tf('frontend_first_registration_text')}</Text>
            </View>
          </>
        ) : !isBookingStarted ? (
          <>
            <View style={styles.heroInfoCard}>
              <Text style={styles.heroInfoEyebrow}>Profilo</Text>
              <Text style={styles.heroInfoTitle}>{tf('frontend_profile_active')}</Text>
              <Text style={styles.heroInfoName}>
                {profile.nome} {profile.cognome}
              </Text>
              <Text style={styles.heroInfoEmail}>{profile.email}</Text>
              {salonActivityCategory ? (
                <View style={styles.heroInfoCategoryChip}>
                  <Text style={styles.heroInfoCategoryChipText}>{salonActivityCategory}</Text>
                </View>
              ) : null}
              {salonAddress ? (
                <View style={styles.heroInfoAddressCard}>
                  <Ionicons name="location-outline" size={15} color="#64748b" />
                  <Text style={styles.heroInfoAddress}>{salonAddress}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.heroPrimaryButton}
                onPress={() => {
                  setShowRequestsExpanded(false);
                  setIsBookingStarted(true);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.heroPrimaryButtonText}>{tf('frontend_book')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </View>

      {isRegistered && !isBookingStarted ? (
        <>
          <TouchableOpacity
            style={styles.requestsToggleButton}
            onPress={() => setShowRequestsExpanded((current) => !current)}
            activeOpacity={0.9}
          >
            <View style={styles.requestsToggleTextWrap}>
              <Text style={styles.requestsToggleTitle}>{tf('frontend_my_bookings')}</Text>
              <Text style={styles.requestsToggleSubtitle}>
                {tf('frontend_my_bookings_hint')}
              </Text>
            </View>
            {notificheRisposteCount > 0 ? (
              <View style={styles.requestsToggleBadge}>
                <Text style={styles.requestsToggleBadgeText}>
                  {notificheRisposteCount > 99 ? '99+' : notificheRisposteCount}
                </Text>
              </View>
            ) : null}
            <View style={styles.requestsToggleIconWrap}>
              <Ionicons
                name={showRequestsExpanded ? 'chevron-up' : 'chevron-down'}
                size={26}
                color="#0f766e"
              />
            </View>
          </TouchableOpacity>

        </>
      ) : null}

      {isRegistered && !isBookingStarted ? (
        <View style={styles.salonAccessCard}>
          <Text style={styles.salonAccessTitle}>{tf('frontend_salon_code_title')}</Text>
          <TextInput
            style={styles.salonCodeInput}
            placeholder={tf('frontend_salon_code_placeholder')}
            placeholderTextColor="#8f8f8f"
            autoCapitalize="none"
            autoCorrect={false}
            value={salonCodeDraft}
            onChangeText={setSalonCodeDraft}
          />
          <TouchableOpacity
            style={styles.salonCodeButton}
            onPress={() => setSelectedSalonCode(salonCodeDraft)}
            activeOpacity={0.9}
          >
            <Text style={styles.salonCodeButtonText}>{tf('frontend_open_salon')}</Text>
          </TouchableOpacity>
          <View style={styles.salonAccessFooter}>
            <Text style={styles.salonAccessHint}>
              {effectiveWorkspace
                ? tf('frontend_active_salon', { salonName: effectiveWorkspace.salonName })
                : tf('frontend_open_hint')}
            </Text>
            {isLoadingSalon ? (
              <Text style={styles.salonAccessLoading}>{tf('frontend_loading')}</Text>
            ) : null}
          </View>
          {effectiveWorkspace && salonBusinessPhone ? (
            <View style={styles.salonContactRow}>
              <View style={styles.salonContactInfo}>
                <Text style={styles.salonContactLabel}>{tf('frontend_business_phone')}</Text>
                <Text style={styles.salonContactValue}>{salonBusinessPhone}</Text>
              </View>
              <View style={styles.salonContactActions}>
                <TouchableOpacity
                  style={styles.salonWhatsappButton}
                  onPress={scriviWhatsAppSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                  <Text style={styles.salonWhatsappButtonText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.salonCallButton}
                  onPress={chiamaSalone}
                  activeOpacity={0.9}
                >
                  <Ionicons name="call-outline" size={16} color="#0f766e" />
                  <Text style={styles.salonCallButtonText}>Chiama</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {salonLoadError ? <Text style={styles.salonAccessError}>{salonLoadError}</Text> : null}
        </View>
      ) : null}

      {ultimaRichiesta && !isBookingStarted ? (
        <View style={styles.confirmationCard}>
          <View style={styles.confirmationTopRow}>
            <View style={styles.confirmationIconWrap}>
              <Ionicons name="paper-plane-outline" size={22} color="#0f766e" />
            </View>
            <View style={styles.confirmationTextWrap}>
              <Text style={styles.confirmationEyebrow}>{tf('frontend_request_sent')}</Text>
              <Text style={styles.confirmationTitle}>
                {ultimaRichiesta.servizio} per {ultimaRichiesta.nomeCompleto}
              </Text>
              {ultimaRichiesta.operatoreNome ? (
                <Text style={styles.confirmationOperator}>
                  Operatore: {ultimaRichiesta.operatoreNome}
                </Text>
              ) : null}
              {salonActivityCategory ? (
                <View style={styles.requestCategoryChip}>
                  <Text style={styles.requestCategoryChipText}>{salonActivityCategory}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.confirmationSummaryGrid}>
            <View style={styles.confirmationSummaryBox}>
              <Text style={styles.confirmationSummaryLabel}>Data</Text>
              <Text style={styles.confirmationSummaryValue}>
                {formatDateCompact(ultimaRichiesta.data)}
              </Text>
            </View>

            <View style={styles.confirmationSummaryBox}>
              <Text style={styles.confirmationSummaryLabel}>Ora</Text>
              <Text style={styles.confirmationSummaryValue}>{ultimaRichiesta.ora}</Text>
            </View>
          </View>

          <View style={styles.confirmationDetailsCard}>
            <Text style={styles.confirmationDetailsText}>
              {formatDateLong(ultimaRichiesta.data)}
            </Text>
            <Text style={styles.confirmationDetailsText}>
              Il salone deve ancora accettare questa prenotazione.
            </Text>
            {salonAddress ? (
              <Text style={styles.confirmationDetailsText}>
                Indirizzo salone: {salonAddress}
              </Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.clientHomeButton}
            onPress={resetFrontendCliente}
            activeOpacity={0.9}
          >
            <Text style={styles.clientHomeButtonText}>{tf('frontend_return_home')}</Text>
          </TouchableOpacity>
          {salonBusinessPhone ? (
            <View style={styles.confirmationActionsRow}>
              <TouchableOpacity
                style={styles.inlineWhatsappButton}
                onPress={scriviWhatsAppSalone}
                activeOpacity={0.9}
              >
                <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                <Text style={styles.inlineWhatsappButtonText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inlineCallButton}
                onPress={chiamaSalone}
                activeOpacity={0.9}
              >
                <Ionicons name="call-outline" size={16} color="#0f766e" />
                <Text style={styles.inlineCallButtonText}>Chiama</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          </View>
        ) : null}

      {!isRegistered ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{tf('frontend_registration_title')}</Text>
          <TextInput
            style={styles.input}
            placeholder={tf('auth_first_name_placeholder')}
            placeholderTextColor="#8f8f8f"
            value={profile.nome}
            onChangeText={(value) => setProfile((current) => ({ ...current, nome: value }))}
            returnKeyType="next"
            onSubmitEditing={() => cognomeInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={cognomeInputRef}
            style={styles.input}
            placeholder={tf('auth_last_name_placeholder')}
            placeholderTextColor="#8f8f8f"
            value={profile.cognome}
            onChangeText={(value) => setProfile((current) => ({ ...current, cognome: value }))}
            returnKeyType="next"
            onSubmitEditing={() => emailInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={emailInputRef}
            style={styles.input}
            placeholder={tf('common_email')}
            placeholderTextColor="#8f8f8f"
            keyboardType="email-address"
            autoCapitalize="none"
            value={profile.email}
            onChangeText={(value) => setProfile((current) => ({ ...current, email: value }))}
            returnKeyType="next"
            onSubmitEditing={() => telefonoInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={telefonoInputRef}
            style={styles.input}
            placeholder={tf('auth_business_phone_placeholder')}
            placeholderTextColor="#8f8f8f"
            keyboardType="phone-pad"
            value={profile.telefono}
            onChangeText={(value) => setProfile((current) => ({ ...current, telefono: value }))}
            returnKeyType="next"
            onSubmitEditing={() => instagramInputRef.current?.focus()}
            blurOnSubmit={false}
          />
          <TextInput
            ref={instagramInputRef}
            style={styles.input}
            placeholder="Instagram"
            placeholderTextColor="#8f8f8f"
            autoCapitalize="none"
            value={profile.instagram}
            onChangeText={(value) => setProfile((current) => ({ ...current, instagram: value }))}
            returnKeyType="done"
            onSubmitEditing={blurOnSubmit}
          />

          <TouchableOpacity
            style={[styles.primaryButton, !canSaveProfile && styles.primaryButtonDisabled]}
            onPress={saveProfile}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>{tf('auth_register_button')}</Text>
          </TouchableOpacity>
          </View>
        ) : null}

      {isRegistered && !isBookingStarted && showRequestsExpanded ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{tf('frontend_my_bookings')}</Text>
            {mieRichieste.length === 0 ? (
              <Text style={styles.sectionHint}>{tf('frontend_no_requests')}</Text>
            ) : null}
          </View>

          {mieRichieste.map((item) => {
            const isAccepted = item.stato === 'Accettata';
            const isCancelled = item.stato === 'Annullata';
            const canCancelAppointment = isAccepted && canCancelUntilPreviousMidnight(item.data);

            return (
              <View key={item.id} style={styles.requestStatusCard}>
                <View style={styles.requestStatusTopRow}>
                  <View>
                    <Text style={styles.requestStatusTitle}>{item.servizio}</Text>
                    <Text style={styles.requestStatusMeta}>
                      {formatDateLong(item.data)} · {item.ora}
                    </Text>
                    {salonActivityCategory ? (
                      <View style={styles.requestCategoryChip}>
                        <Text style={styles.requestCategoryChipText}>{salonActivityCategory}</Text>
                      </View>
                    ) : null}
                    {item.operatoreNome ? (
                      <Text style={styles.requestStatusOperator}>Operatore: {item.operatoreNome}</Text>
                    ) : null}
                  </View>

                  <View
                    style={[
                      styles.requestStateBadge,
                      item.stato === 'In attesa'
                        ? styles.requestStateBadgePending
                        : isAccepted
                          ? styles.requestStateBadgeAccepted
                          : isCancelled
                            ? styles.requestStateBadgeCancelled
                            : styles.requestStateBadgeRejected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.requestStateBadgeText,
                        item.stato === 'In attesa'
                          ? styles.requestStateBadgeTextPending
                          : isAccepted
                            ? styles.requestStateBadgeTextAccepted
                            : isCancelled
                              ? styles.requestStateBadgeTextCancelled
                              : styles.requestStateBadgeTextRejected,
                      ]}
                    >
                      {item.stato}
                    </Text>
                  </View>
                </View>

                <Text style={styles.requestStatusBody}>
                  {(item.origine ?? 'frontend') === 'backoffice'
                    ? tf('frontend_request_from_salon')
                    : item.stato === 'In attesa'
                      ? tf('frontend_request_pending_text')
                      : isAccepted
                        ? tf('frontend_request_accepted_text')
                        : isCancelled
                          ? tf('frontend_request_cancelled_text')
                        : tf('frontend_request_rejected_text')}
                </Text>

                {salonAddress ? (
                  <Text style={styles.requestStatusAddress}>{salonAddress}</Text>
                ) : null}

                {isAccepted ? (
                  <Text style={styles.requestStatusHint}>
                    {canCancelAppointment
                      ? tf('frontend_can_cancel_until')
                      : tf('frontend_cannot_cancel')}
                  </Text>
                ) : null}

                {isAccepted ? (
                  <>
                    {canCancelAppointment ? (
                      <TouchableOpacity
                        style={styles.cancelBookingButton}
                        onPress={() => annullaPrenotazioneCliente(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.cancelBookingButtonText}>{tf('frontend_cancel_booking')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.calendarButton}
                      onPress={() => aggiungiRichiestaAccettataAlCalendario(item.id)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.calendarButtonText}>{tf('frontend_add_calendar')}</Text>
                    </TouchableOpacity>
                    {salonBusinessPhone ? (
                      <View style={styles.confirmationActionsRow}>
                        <TouchableOpacity
                          style={styles.inlineWhatsappButton}
                          onPress={scriviWhatsAppSalone}
                          activeOpacity={0.9}
                        >
                          <Ionicons name="logo-whatsapp" size={16} color="#166534" />
                          <Text style={styles.inlineWhatsappButtonText}>WhatsApp</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.inlineCallButton}
                          onPress={chiamaSalone}
                          activeOpacity={0.9}
                        >
                          <Ionicons name="call-outline" size={16} color="#0f766e" />
                          <Text style={styles.inlineCallButtonText}>Chiama</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </>
      ) : null}

      {isRegistered && isBookingStarted ? (
        <>
          <View style={styles.stepsRow}>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>1</Text>
              <Text style={styles.stepText}>{tf('frontend_step_service')}</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>2</Text>
              <Text style={styles.stepText}>{tf('frontend_step_day')}</Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>3</Text>
              <Text style={styles.stepText}>
                {operatorSelectionRequired ? 'Operatore' : tf('frontend_step_time')}
              </Text>
            </View>
            <View style={styles.stepItem}>
              <Text style={styles.stepBadge}>4</Text>
              <Text style={styles.stepText}>
                {operatorSelectionRequired ? tf('frontend_step_time') : tf('frontend_step_note')}
              </Text>
            </View>
            {operatorSelectionRequired ? (
              <View style={styles.stepItem}>
                <Text style={styles.stepBadge}>5</Text>
                <Text style={styles.stepText}>{tf('frontend_step_note')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionEyebrow}>Step 1</Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_service')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {effectiveServizi.map((item) => {
                const selected = item.nome === servizio;
                const accent = getServiceAccent(item.nome);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.serviceCard,
                      {
                        backgroundColor: '#ffffff',
                        borderColor: selected ? accent.text : accent.border,
                      },
                      selected && styles.serviceCardActive,
                    ]}
                    onPress={() => {
                      setServizio(item.nome);
                      if (
                        ora &&
                        findConflictingAppointment({
                          appointmentDate: data,
                          startTime: ora,
                          serviceName: item.nome,
                          appointments: effectiveAppuntamenti,
                          services: effectiveServizi,
                        })
                      ) {
                        setOra('');
                      }
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.serviceCardTitle, { color: accent.text }]}>
                      {item.nome}
                    </Text>
                    {item.mestiereRichiesto ? (
                      <View style={[styles.serviceRoleBadge, { borderColor: accent.border }]}>
                        <Text style={[styles.serviceRoleBadgeText, { color: accent.text }]}>
                          {item.mestiereRichiesto}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={[styles.serviceCardPrice, { color: accent.text }]}>
                      € {item.prezzo.toFixed(2)}
                    </Text>
                    <Text style={[styles.serviceCardDuration, { color: accent.text }]}>
                      {formatDurationLabel(item.durataMinuti ?? 60)}
                    </Text>
                    {item.prezzoOriginale && item.prezzoOriginale > item.prezzo ? (
                      <View style={styles.discountRow}>
                        <View style={styles.discountBadge}>
                          <Text style={styles.discountBadgeText}>Sconto</Text>
                        </View>
                        <Text style={styles.servicePriceOriginal}>
                          € {item.prezzoOriginale.toFixed(2)}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={[styles.sectionCard, !canChooseDay && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>Step 2</Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_day')}</Text>
            {!canChooseDay ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.calendarToggleButton}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.9}
            >
              <Ionicons name="calendar-outline" size={16} color="#111111" />
              <Text style={styles.calendarToggleButtonText}>{formatDateLong(data)}</Text>
            </TouchableOpacity>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayPickerRow}
            >
              {giorniDisponibili.map((day) => {
                const selected = day.value === data;
                const availability = getDateAvailabilityInfo(effectiveAvailabilitySettings, day.value);
                const closed = availability.closed;
                const vacationLabel =
                  availability.reason === 'vacation'
                    ? effectiveAvailabilitySettings.vacationRanges.find(
                        (item) => item.startDate <= day.value && day.value <= item.endDate
                      )?.label?.trim() || tf('agenda_vacation')
                    : null;
                const statusLabel =
                  availability.reason === 'holiday'
                    ? tf('agenda_holiday')
                    : availability.reason === 'vacation'
                      ? vacationLabel
                    : availability.reason === 'weekly'
                        ? 'Salone\nchiuso'
                        : availability.reason === 'manual'
                          ? 'Salone\nchiuso'
                          : null;
                const footerLabel = selected
                  ? tf('agenda_selected_short')
                  : closed
                    ? tf('agenda_unavailable_short')
                    : tf('agenda_available_short');

                return (
                  <View key={day.value} style={styles.dayCardWrap}>
                    <TouchableOpacity
                      style={[
                        styles.dayCard,
                        selected && styles.dayCardActive,
                        selected && styles.dayCardActiveShadow,
                        closed && !selected && styles.dayCardClosed,
                      ]}
                      onPress={() => {
                        if (!canChooseDay) return;
                        if (closed) return;
                        setData(day.value);
                        if (
                          ora &&
                          servizio &&
                          findConflictingAppointment({
                            appointmentDate: day.value,
                            startTime: ora,
                            serviceName: servizio,
                            appointments: effectiveAppuntamenti,
                            services: effectiveServizi,
                          })
                        ) {
                          setOra('');
                        }
                      }}
                      activeOpacity={canChooseDay ? 0.9 : 1}
                      disabled={!canChooseDay}
                    >
                      <View style={styles.dayCardHeader}>
                        <Text
                          style={[
                            styles.dayWeek,
                            selected && styles.dayTextActive,
                            closed && !selected && styles.dayTextClosed,
                          ]}
                        >
                          {day.weekdayShort}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.dayNumber,
                          selected && styles.dayTextActive,
                          closed && !selected && styles.dayTextClosed,
                        ]}
                      >
                        {day.dayNumber}
                      </Text>
                      {statusLabel ? (
                        <View
                          style={[
                            styles.dayStatusBadge,
                            styles.dayStatusBadgeClosed,
                            availability.reason === 'holiday' && styles.dayStatusBadgeHoliday,
                          ]}
                        >
                          <Text style={styles.dayStatusBadgeText} numberOfLines={1}>
                            {statusLabel}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.dayStatusBadgeSpacer} />
                      )}
                      <Text
                        style={[
                          styles.dayMonth,
                          selected && styles.dayTextActive,
                          closed && !selected && styles.dayTextClosed,
                        ]}
                        >
                          {day.monthShort}
                        </Text>
                      <View
                        style={[
                          styles.dayCardFooter,
                          selected && styles.dayCardFooterActive,
                          closed && styles.dayCardFooterClosed,
                          !selected && !closed && styles.dayCardFooterAvailable,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayCardFooterText,
                            selected && styles.dayCardFooterTextActive,
                            closed && styles.dayCardFooterTextClosed,
                            !selected && !closed && styles.dayCardFooterTextAvailable,
                          ]}
                        >
                          {footerLabel}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
            <Text style={styles.sectionHint}>{formatDateLong(data)}</Text>
          </View>

          {serviceUsesOperatorScheduling ? (
            <View style={[styles.sectionCard, !canChooseOperator && styles.sectionCardLocked]}>
              <Text style={styles.sectionEyebrow}>Step 3</Text>
              <Text style={styles.sectionTitle}>Scegli operatore</Text>
              {!canChooseOperator ? (
                <Text style={styles.lockedSectionText}>{tf('frontend_unlock_days')}</Text>
              ) : null}
              {canChooseOperator && operatoriCompatibili.length === 0 ? (
                <Text style={styles.lockedSectionText}>
                  Nessun operatore disponibile per questo servizio nella data scelta.
                </Text>
              ) : null}
              {operatorSelectionRequired ? (
                <View style={styles.operatorSelectionGrid}>
                  {operatoriCompatibili.map((item) => {
                    const selected = item.id === operatoreId;

                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.operatorSelectionCard,
                          selected && styles.operatorSelectionCardActive,
                        ]}
                        onPress={() => {
                          if (!canChooseOperator) return;
                          setOperatoreId(item.id);
                          setOperatoreNome(item.nome);
                          setOra('');
                        }}
                        activeOpacity={canChooseOperator ? 0.9 : 1}
                        disabled={!canChooseOperator}
                      >
                        <Text
                          style={[
                            styles.operatorSelectionName,
                            selected && styles.operatorSelectionNameActive,
                          ]}
                        >
                          {item.nome}
                        </Text>
                        <Text
                          style={[
                            styles.operatorSelectionRole,
                            selected && styles.operatorSelectionRoleActive,
                          ]}
                        >
                          {item.mestiere}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : operatoriCompatibili.length === 1 ? (
                <Text style={styles.lockedSectionText}>
                  Operatore assegnato automaticamente: {operatoriCompatibili[0]?.nome}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={[styles.sectionCard, !canChooseTime && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>
              {operatorSelectionRequired ? 'Step 4' : 'Step 3'}
            </Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_time')}</Text>
            {!canChooseTime ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_times')}</Text>
            ) : null}
            {canChooseTime && servizio.trim() && visibleFrontendTimeSlots.length === 0 ? (
              <Text style={styles.lockedSectionText}>
                Nessuno slot libero per questo servizio nel giorno selezionato.
              </Text>
            ) : null}
            <View style={styles.timeGrid}>
              {visibleFrontendTimeSlots.map((item) => {
                const selected = selectedTimeRange.has(item);
                const disabled = !canChooseTime || !servizio || orariNonDisponibili.has(item);
                const lunchBadge = isTimeBlockedByLunchBreak(effectiveAvailabilitySettings, item);
                const lunchOverlapCandidate =
                  !!servizio &&
                  doesServiceOverlapLunchBreak({
                    settings: effectiveAvailabilitySettings,
                    startTime: item,
                    durationMinutes: selectedServiceDuration,
                  });

                return (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.timeChip,
                      selected && styles.timeChipActive,
                      disabled && !selected && styles.timeChipDisabled,
                    ]}
                    onPress={() => {
                      if (lunchOverlapCandidate) {
                        Alert.alert(
                          tf('frontend_lunch_overlap_title'),
                          tf('frontend_lunch_overlap_body')
                        );
                        return;
                      }
                      if (disabled) return;
                      setOra(item);
                    }}
                    activeOpacity={disabled ? 1 : 0.9}
                    disabled={!canChooseTime || !servizio}
                  >
                    {lunchBadge ? (
                      <View style={styles.slotMiniBadge}>
                        <Text style={styles.slotMiniBadgeText}>Pausa</Text>
                      </View>
                    ) : null}
                    <Text
                      style={[
                        styles.timeChipText,
                        selected && styles.timeChipTextActive,
                        disabled && !selected && styles.timeChipTextDisabled,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {overlapsLunchBreakSelection ? (
              <Text style={styles.errorText}>{tf('frontend_lunch_overlap_text')}</Text>
            ) : null}
            {clienteInibito ? (
              <Text style={styles.sectionHint}>{tf('frontend_no_online_slots')}</Text>
            ) : null}
            {!servizio ? (
              <Text style={styles.sectionHint}>{tf('frontend_select_service_for_times')}</Text>
            ) : null}
          </View>

          <View style={[styles.sectionCard, !canWriteNote && styles.sectionCardLocked]}>
            <Text style={styles.sectionEyebrow}>
              {operatorSelectionRequired ? 'Step 5' : 'Step 4'}
            </Text>
            <Text style={styles.sectionTitle}>{tf('frontend_choose_note')}</Text>
            {!canWriteNote ? (
              <Text style={styles.lockedSectionText}>{tf('frontend_unlock_note')}</Text>
            ) : null}
            <TextInput
              ref={noteInputRef}
              style={[styles.input, styles.noteInput]}
              placeholder={tf('frontend_note_placeholder')}
              placeholderTextColor="#8f8f8f"
              multiline
              value={note}
              onChangeText={setNote}
              returnKeyType="done"
              onSubmitEditing={blurOnSubmit}
              editable={canWriteNote}
            />
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionEyebrow}>Conferma</Text>
            <Text style={styles.summaryTitle}>{tf('frontend_request_summary')}</Text>
            <Text style={styles.summaryText}>Cliente: {profile.nome} {profile.cognome}</Text>
            <Text style={styles.summaryText}>Data: {formatDateCompact(data)}</Text>
            <Text style={styles.summaryText}>Ora: {ora || '—'}</Text>
            <Text style={styles.summaryText}>Servizio: {servizio || '—'}</Text>
            {operatorSelectionRequired ? (
              <Text style={styles.summaryText}>Operatore: {operatoreNome || '—'}</Text>
            ) : null}
            <Text style={styles.summaryText}>
              Prezzo: {servizioSelezionato ? `€ ${servizioSelezionato.prezzo.toFixed(2)}` : '—'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, !canSendRequest && styles.primaryButtonDisabled]}
              onPress={inviaRichiesta}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>{tf('frontend_send_booking')}</Text>
            </TouchableOpacity>
          </View>
          </>
        ) : null}
      </ScrollView>
      <NativeDatePickerModal
        visible={showDatePicker}
        title={tf('frontend_choose_day')}
        initialValue={data}
        minimumDate={getTodayDateString()}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(value) => {
          const availability = getDateAvailabilityInfo(effectiveAvailabilitySettings, value);
          if (availability.closed || !canChooseDay) {
            setShowDatePicker(false);
            return;
          }

          setData(value);
          if (
            ora &&
            servizio &&
            findConflictingAppointment({
              appointmentDate: value,
              startTime: ora,
              serviceName: servizio,
              appointments: effectiveAppuntamenti,
              services: effectiveServizi,
            })
          ) {
            setOra('');
          }
          setShowDatePicker(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
    padding: 18,
    paddingTop: 43,
    paddingBottom: 132,
  },
  heroCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 34,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(224,232,242,0.98)',
    marginBottom: 18,
    shadowColor: '#94a3b8',
    shadowOpacity: 0.14,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  actionIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  homeHouseSettingsButton: {
    backgroundColor: 'rgba(183, 210, 244, 0.42)',
    borderColor: 'rgba(149, 184, 229, 0.7)',
    shadowColor: '#7c93b6',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  settingsGearBadge: {
    backgroundColor: '#d8e9ff',
    borderColor: '#93b5e6',
    shadowColor: '#5f84bc',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  publicBadge: {
    backgroundColor: 'rgba(31,41,55,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  publicBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  frontendBrandBand: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
  },
  frontendTitleBand: {
    width: '100%',
    minHeight: 66,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 48,
    marginBottom: 2,
  },
  frontendTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  frontendTitleBadge: {
    position: 'absolute',
    left: 0,
    top: '50%',
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,246,255,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.98)',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 360,
    fontSize: 15,
    lineHeight: 22,
    color: '#111111',
    textAlign: 'center',
    marginTop: 2,
  },
  salonCategoryChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(248,250,252,0.98)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(214,224,236,0.98)',
  },
  salonCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111111',
  },
  heroHighlightsRow: {
    flexDirection: 'row',
    marginTop: 18,
    marginBottom: 14,
  },
  heroHighlightCard: {
    flex: 1,
    backgroundColor: 'rgba(252,245,233,0.96)',
    borderRadius: 24,
    padding: 16,
    marginRight: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(237,223,199,0.98)',
    shadowColor: '#c8a96b',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroHighlightCardAccent: {
    flex: 1,
    backgroundColor: 'rgba(251,233,239,0.96)',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,194,208,0.98)',
    shadowColor: '#d88aa3',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  heroHighlightNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  heroHighlightLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5f564d',
    textAlign: 'center',
  },
  heroInfoCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 30,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(224,232,242,0.98)',
    borderTopWidth: 3,
    borderTopColor: '#dbeafe',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    alignItems: 'center',
  },
  heroInfoEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroInfoTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroInfoText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  heroInfoName: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1f2937',
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroInfoEmail: {
    fontSize: 14,
    lineHeight: 20,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  heroInfoCategoryChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(239,246,255,0.98)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  heroInfoCategoryChipText: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
  },
  heroInfoAddressCard: {
    marginTop: 14,
    backgroundColor: 'rgba(248,250,252,0.98)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(220,230,240,0.98)',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 650,
  },
  heroInfoAddress: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#111111',
    fontWeight: '700',
    marginLeft: 8,
    textAlign: 'center',
  },
  salonAccessCard: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 30,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(224,232,242,0.98)',
    borderTopWidth: 3,
    borderTopColor: '#e2e8f0',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    alignItems: 'center',
  },
  salonAccessTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  salonCodeInput: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111111',
    width: '100%',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  salonCodeButton: {
    marginTop: 10,
    width: '100%',
    backgroundColor: '#1b2330',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  salonCodeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: appFonts.displayNeon,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  salonAccessFooter: {
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salonAccessHint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  salonAccessLoading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f837b',
    marginTop: 4,
  },
  salonAccessError: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    fontWeight: '700',
  },
  salonContactRow: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
  },
  salonContactInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  salonContactActions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  salonContactLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  salonContactValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  salonWhatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dff6ed',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  salonWhatsappButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  salonCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcecff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  salonCallButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#315ea8',
  },
  heroPrimaryButton: {
    width: '100%',
    backgroundColor: '#1b2330',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  heroPrimaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    fontFamily: appFonts.displayNeon,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(255,255,255,0.95)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  requestsToggleButton: {
    backgroundColor: 'rgba(255,255,255,0.985)',
    borderRadius: 30,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(224,232,242,0.98)',
    borderTopWidth: 3,
    borderTopColor: '#dcfce7',
    minHeight: 88,
    shadowColor: '#94a3b8',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  requestsToggleTextWrap: {
    flex: 1,
    marginRight: 10,
    alignItems: 'center',
  },
  requestsToggleTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  requestsToggleSubtitle: {
    color: '#111111',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    maxWidth: 250,
    textAlign: 'center',
  },
  requestsToggleBadge: {
    marginRight: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#ff3b30',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  requestsToggleBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  requestsToggleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#e5f6f1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfe8df',
  },
  sectionCard: {
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 30,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(224,232,242,0.98)',
    shadowColor: '#94a3b8',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  sectionCardLocked: {
    opacity: 0.62,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  lockedSectionText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 10,
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
  },
  calendarToggleButton: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 12,
  },
  calendarToggleButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
  },
  frontendCalendarCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
    marginTop: 12,
    marginBottom: 0,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarNavButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#f3f1ed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavButtonDisabled: {
    opacity: 0.45,
  },
  calendarNavButtonText: {
    fontSize: 24,
    color: '#111111',
    fontWeight: '700',
    marginTop: -2,
  },
  calendarNavButtonTextDisabled: {
    color: '#8f8f8f',
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 0,
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginBottom: 0,
  },
  calendarDayCellActive: {
    backgroundColor: '#111111',
  },
  calendarDayCellDisabled: {
    opacity: 0.35,
  },
  calendarDayCellClosed: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  calendarDayCellGhost: {
    backgroundColor: 'transparent',
  },
  calendarDayText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111111',
  },
  calendarDayTextActive: {
    color: '#ffffff',
  },
  calendarDayTextDisabled: {
    color: '#9ca3af',
  },
  calendarDayTextClosed: {
    color: '#be123c',
  },
  calendarFooterText: {
    fontSize: 13,
    color: '#111111',
    lineHeight: 17,
    marginBottom: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarCloseButton: {
    alignSelf: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  calendarCloseButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
  },
  errorText: {
    marginTop: 10,
    fontSize: 13,
    color: '#b42318',
    fontWeight: '700',
    lineHeight: 19,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#dbe6f1',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    color: '#ffffff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13,
    fontWeight: '800',
    paddingTop: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  stepText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  serviceCard: {
    width: 118,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginRight: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  serviceCardActive: {
    borderWidth: 3,
    shadowColor: '#1f2937',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  serviceCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
    lineHeight: 18,
  },
  serviceRoleBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    marginBottom: 6,
  },
  serviceRoleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  serviceCardPrice: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  serviceCardDuration: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  discountRow: {
    marginTop: 8,
    alignItems: 'center',
  },
  discountBadge: {
    backgroundColor: '#fff1f2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#fecdd3',
    marginBottom: 4,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#be123c',
  },
  servicePriceOriginal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7c2d12',
    textDecorationLine: 'line-through',
  },
  dayPickerRow: {
    paddingRight: 2,
  },
  dayCardWrap: {
    marginRight: 6,
  },
  dayCard: {
    width: 68,
    minHeight: 92,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayCardActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  dayCardActiveShadow: {
    shadowColor: '#111827',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  dayCardClosed: {
    backgroundColor: '#fff1f2',
    borderColor: '#fda4af',
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minHeight: 20,
    marginBottom: 8,
  },
  dayWeek: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  dayStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 3,
    minWidth: 46,
    maxWidth: 58,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 6,
  },
  dayStatusBadgeClosed: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.22)',
  },
  dayStatusBadgeHoliday: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
    borderColor: 'rgba(225, 29, 72, 0.3)',
  },
  dayStatusBadgeText: {
    fontSize: 6,
    fontWeight: '800',
    color: '#be123c',
    letterSpacing: 0.1,
    textAlign: 'center',
    lineHeight: 9,
  },
  dayStatusBadgeSpacer: {
    height: 18,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 2,
    textAlign: 'center',
    lineHeight: 26,
  },
  dayMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: '#111111',
    textTransform: 'capitalize',
    marginBottom: 6,
    textAlign: 'center',
  },
  dayTextActive: {
    color: '#ffffff',
  },
  dayTextClosed: {
    color: '#9f1239',
  },
  dayCardFooter: {
    alignSelf: 'center',
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 50,
    maxWidth: '100%',
  },
  dayCardFooterActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  dayCardFooterClosed: {
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
  },
  dayCardFooterAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.18)',
  },
  dayCardFooterText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  dayCardFooterTextActive: {
    color: '#ffffff',
  },
  dayCardFooterTextClosed: {
    color: '#be123c',
  },
  dayCardFooterTextAvailable: {
    color: '#047857',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  timeChip: {
    width: '22%',
    marginHorizontal: '1.5%',
    marginBottom: 10,
    backgroundColor: '#f7efe3',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ead9bb',
  },
  timeChipActive: {
    backgroundColor: '#dcecff',
    borderColor: '#93c5fd',
  },
  timeChipDisabled: {
    backgroundColor: '#fde2e7',
    borderColor: '#f5b3c2',
  },
  slotMiniBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  slotMiniBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.1,
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
  },
  timeChipTextActive: {
    color: '#1d4ed8',
  },
  timeChipTextDisabled: {
    color: '#b42318',
  },
  operatorSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  operatorSelectionCard: {
    width: '47%',
    marginHorizontal: '1.5%',
    marginBottom: 10,
    backgroundColor: '#fff7ec',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#ead9bb',
    alignItems: 'center',
  },
  operatorSelectionCardActive: {
    backgroundColor: '#dcecff',
    borderColor: '#93c5fd',
  },
  operatorSelectionName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  operatorSelectionNameActive: {
    color: '#1d4ed8',
  },
  operatorSelectionRole: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  operatorSelectionRoleActive: {
    color: '#315ea8',
  },
  input: {
    backgroundColor: '#fbfdff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111111',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dde7f1',
  },
  noteInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  summaryCard: {
    backgroundColor: '#f6e9ef',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e9cddb',
    shadowColor: '#b77990',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1f2937',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6a5560',
    marginBottom: 2,
  },
  primaryButton: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmationCard: {
    backgroundColor: '#fffaf1',
    borderRadius: 28,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#ecd9b5',
  },
  requestStatusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbe6f1',
    shadowColor: '#64748b',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  requestStatusTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  requestStatusTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  requestStatusMeta: {
    fontSize: 13,
    color: '#5f6f83',
    fontWeight: '700',
  },
  confirmationOperator: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
    marginTop: 8,
  },
  requestStatusOperator: {
    fontSize: 12,
    color: '#315ea8',
    fontWeight: '800',
    marginTop: 8,
  },
  requestCategoryChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#d7e8ff',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#a9c9f3',
  },
  requestCategoryChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
  },
  requestStatusBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    marginBottom: 12,
  },
  requestStatusAddress: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5f6f83',
    fontWeight: '700',
    marginBottom: 12,
  },
  requestStateBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  requestStateBadgePending: {
    backgroundColor: '#f5e7c8',
  },
  requestStateBadgeAccepted: {
    backgroundColor: '#d9f2e7',
  },
  requestStateBadgeRejected: {
    backgroundColor: '#f6d7de',
  },
  requestStateBadgeCancelled: {
    backgroundColor: '#dbe3ec',
  },
  requestStateBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  requestStateBadgeTextPending: {
    color: '#92400e',
  },
  requestStateBadgeTextAccepted: {
    color: '#166534',
  },
  requestStateBadgeTextRejected: {
    color: '#991b1b',
  },
  requestStateBadgeTextCancelled: {
    color: '#374151',
  },
  requestStatusHint: {
    fontSize: 13,
    lineHeight: 19,
    color: '#5f6f83',
    fontWeight: '700',
    marginBottom: 12,
  },
  cancelBookingButton: {
    backgroundColor: '#fff1f2',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  cancelBookingButtonText: {
    color: '#be123c',
    fontSize: 15,
    fontWeight: '800',
  },
  calendarButton: {
    backgroundColor: '#dcecff',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  calendarButtonText: {
    color: '#1d4ed8',
    fontSize: 15,
    fontWeight: '800',
  },
  confirmationActionsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  inlineWhatsappButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcfce7',
    borderRadius: 16,
    paddingVertical: 12,
    marginRight: 8,
  },
  inlineWhatsappButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  inlineCallButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dcecff',
    borderRadius: 16,
    paddingVertical: 12,
  },
  inlineCallButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#315ea8',
  },
  confirmationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmationIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#dcecff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  confirmationTextWrap: {
    flex: 1,
  },
  confirmationEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#315ea8',
    marginBottom: 4,
  },
  confirmationTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
  },
  confirmationSummaryGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  confirmationSummaryBox: {
    flex: 1,
    backgroundColor: '#f3eee5',
    borderRadius: 18,
    padding: 14,
    marginRight: 8,
  },
  confirmationSummaryLabel: {
    fontSize: 12,
    color: '#7a6f65',
    fontWeight: '700',
    marginBottom: 4,
  },
  confirmationSummaryValue: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '800',
  },
  confirmationDetailsCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  confirmationDetailsText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#555555',
    fontWeight: '600',
  },
  clientHomeButton: {
    backgroundColor: '#1f2937',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  clientHomeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  frontendLanguageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 8,
  },
  frontendLanguageChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
    marginBottom: 10,
  },
  frontendLanguageChipActive: {
    backgroundColor: '#111827',
  },
  frontendLanguageChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  frontendLanguageChipTextActive: {
    color: '#ffffff',
  },
  frontendLogoutButton: {
    backgroundColor: '#111827',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  frontendLogoutButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
});
