import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { NativeTimePickerModal } from '../../components/ui/native-time-picker-modal';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import {
  buildDisplayTimeSlots,
  doesServiceFitWithinDaySchedule,
  doesServiceOverlapLunchBreak,
  doesServiceUseOperators,
  findConflictingAppointment as findConflictingAppointmentShared,
  getDateAvailabilityInfo,
  getEligibleOperatorsForService,
  getSlotIntervalForDate,
  isSlotBlockedByOverride,
  isTimeBlockedByLunchBreak,
  isTimeWithinDaySchedule,
} from '../../src/lib/booking';
import { AppLanguage, tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { getServiceAccentByMeta } from '../../src/lib/service-accents';

const GIORNI_SETTIMANA_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI_IT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const DAY_CARD_WIDTH = 68;
const DAY_CARD_GAP = 6;
const DAY_CARD_FULL_WIDTH = DAY_CARD_WIDTH + DAY_CARD_GAP;

const SLOT_INTERVAL_OPTIONS = Array.from({ length: 20 }, (_, index) => (index + 1) * 15);

const formatPickerButtonLabel = (value: string) => {
  const [year, month, day] = value.split('-');
  const monthLabels = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${day} ${monthLabels[(Number(month) || 1) - 1] ?? month} ${year}`;
};

type AppuntamentoItem = {
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
};

type GiornoPicker = {
  value: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
};

type CalendarDay = {
  key: string;
  value: string | null;
  label: string;
  isCurrentMonth: boolean;
  isDisabled: boolean;
};

type AgendaDaySection = {
  date: string;
  items: AppuntamentoItem[];
};

type WeekAgendaDay = GiornoPicker & {
  items: AppuntamentoItem[];
  isToday: boolean;
  isClosed: boolean;
};

type AgendaView = 'today' | 'upcoming' | 'recent';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysToIso = (value: string, days: number) => {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

const formatDateCompact = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

const formatDateLong = (value: string) => {
  const date = parseIsoDate(value);
  return `${GIORNI_SETTIMANA_IT[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    MESI_IT[date.getMonth()]
  } ${date.getFullYear()}`;
};

const formatDateShortLocalized = (value: string, appLanguage: AppLanguage) => {
  const date = parseIsoDate(value);
  const months = getLocalizedShortMonths(appLanguage);
  return `${String(date.getDate()).padStart(2, '0')} ${months[date.getMonth()]}`;
};

const buildFutureDates = (daysAhead: number): GiornoPicker[] => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: daysAhead }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;

    return {
      value,
      weekdayShort: GIORNI_SETTIMANA_IT[current.getDay()],
      dayNumber: day,
      monthShort: MESI_IT[current.getMonth()],
      fullLabel: formatDateLong(value),
    };
  });
};

const getLocalizedShortWeekdays = (appLanguage: AppLanguage) => {
  switch (appLanguage) {
    case 'en':
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    case 'es':
      return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    case 'fr':
      return ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    case 'de':
      return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    default:
      return GIORNI_SETTIMANA_IT;
  }
};

const getLocalizedShortMonths = (appLanguage: AppLanguage) => {
  switch (appLanguage) {
    case 'en':
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    case 'es':
      return ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    case 'fr':
      return ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
    case 'de':
      return ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    default:
      return MESI_IT;
  }
};

const formatDateLongLocalized = (value: string, appLanguage: AppLanguage) => {
  const date = parseIsoDate(value);
  const weekdays = getLocalizedShortWeekdays(appLanguage);
  const months = getLocalizedShortMonths(appLanguage);
  return `${weekdays[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    months[date.getMonth()]
  } ${date.getFullYear()}`;
};

const formatMonthYearLabelLocalized = (value: string, appLanguage: AppLanguage) => {
  const date = parseIsoDate(value);
  const months = getLocalizedShortMonths(appLanguage);
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

const getMonthStart = (value: string) => {
  const date = parseIsoDate(value);
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const addMonthsToIso = (value: string, months: number) => {
  const date = parseIsoDate(value);
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const getWeekStartIso = (value: string) => {
  const date = parseIsoDate(value);
  const weekday = date.getDay();
  const diffFromMonday = weekday === 0 ? 6 : weekday - 1;

  date.setDate(date.getDate() - diffFromMonday);

  return toIsoDate(date);
};

const buildWeekDates = (anchorValue: string, appLanguage: AppLanguage): GiornoPicker[] => {
  const weekStart = getWeekStartIso(anchorValue);

  return Array.from({ length: 7 }, (_, index) => {
    const value = addDaysToIso(weekStart, index);
    const date = parseIsoDate(value);

    return {
      value,
      weekdayShort: getLocalizedShortWeekdays(appLanguage)[date.getDay()],
      dayNumber: String(date.getDate()).padStart(2, '0'),
      monthShort: getLocalizedShortMonths(appLanguage)[date.getMonth()],
      fullLabel: formatDateLongLocalized(value, appLanguage),
    };
  });
};

const buildMonthCalendar = (monthValue: string, minDate: string): CalendarDay[] => {
  const monthStart = getMonthStart(monthValue);
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarDay[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({
      key: `empty-${index}`,
      value: null,
      label: '',
      isCurrentMonth: false,
      isDisabled: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(
      2,
      '0'
    )}`;

    cells.push({
      key: value,
      value,
      label: String(day),
      isCurrentMonth: true,
      isDisabled: value < minDate,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `tail-${cells.length}`,
      value: null,
      label: '',
      isCurrentMonth: false,
      isDisabled: true,
    });
  }

  return cells;
};

const normalizeServiceName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+]/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const getAppointmentDateTime = (dateValue: string, timeValue: string) => {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);

  return new Date(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    hours ?? 0,
    minutes ?? 0,
    0,
    0
  );
};

const isAppointmentInFuture = (item: Pick<AppuntamentoItem, 'data' | 'ora'>, fallbackDate: string) =>
  getAppointmentDateTime(item.data ?? fallbackDate, item.ora).getTime() > Date.now();

const minutesToTime = (minutesValue: number) => {
  const hours = Math.floor(minutesValue / 60);
  const minutes = minutesValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const formatSlotInterval = (value: number) => {
  if (value < 60) return `${value} min`;
  if (value === 30) return '30 min';
  if (value === 60) return '1 ora';
  if (value % 60 === 0) {
    const hours = value / 60;
    return hours === 1 ? '1 ora' : `${hours} ore`;
  }

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours === 1 && minutes === 30) return '1 ora e 30 min';
  if (hours === 1) return `1 ora e ${minutes} min`;

  return `${hours} ore e ${minutes} min`;
};

const isDateInRange = (dateValue: string, startDate: string, endDate: string) =>
  dateValue >= startDate && dateValue <= endDate;

export default function AgendaScreen() {
  const responsive = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const {
    appuntamenti,
    setAppuntamenti,
    clienti,
    setClienti,
    servizi,
    setServizi,
    operatori,
    movimenti,
    setMovimenti,
    richiestePrenotazione,
    setRichiestePrenotazione,
    availabilitySettings,
    setAvailabilitySettings,
    salonWorkspace,
    appLanguage,
  } = useAppContext();

  const giorniDisponibili = useMemo(
    () =>
      buildFutureDates(180).map((day) => ({
        ...day,
        weekdayShort: getLocalizedShortWeekdays(appLanguage)[parseIsoDate(day.value).getDay()],
        monthShort: getLocalizedShortMonths(appLanguage)[parseIsoDate(day.value).getMonth()],
        fullLabel: formatDateLongLocalized(day.value, appLanguage),
      })),
    [appLanguage]
  );
  const [data, setData] = useState(getTodayDateString());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getTodayDateString());
  const [ora, setOra] = useState('');
  const [cliente, setCliente] = useState('');
  const [servizio, setServizio] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [operatoreId, setOperatoreId] = useState('');
  const [operatoreNome, setOperatoreNome] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [campoAttivo, setCampoAttivo] = useState<'cliente' | 'ricerca' | null>(null);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [quickClientNome, setQuickClientNome] = useState('');
  const [quickClientTelefono, setQuickClientTelefono] = useState('');
  const [quickClientEmail, setQuickClientEmail] = useState('');
  const [quickClientInstagram, setQuickClientInstagram] = useState('');
  const [quickClientBirthday, setQuickClientBirthday] = useState('');
  const [showQuickServiceModal, setShowQuickServiceModal] = useState(false);
  const [quickServiceNome, setQuickServiceNome] = useState('');
  const [quickServicePrezzo, setQuickServicePrezzo] = useState('');
  const [quickServicePrezzoOriginale, setQuickServicePrezzoOriginale] = useState('');
  const [quickServiceDurata, setQuickServiceDurata] = useState('60');
  const [quickServiceMestiere, setQuickServiceMestiere] = useState('');
  const [isQuickServiceKeyboardOpen, setIsQuickServiceKeyboardOpen] = useState(false);
  const [giornoEspanso, setGiornoEspanso] = useState(getTodayDateString());
  const [showCustomizeHoursExpanded, setShowCustomizeHoursExpanded] = useState(false);
  const [agendaView, setAgendaView] = useState<AgendaView>('today');
  const [showWeeklyPlanner, setShowWeeklyPlanner] = useState(false);
  const [weeklyReferenceDate, setWeeklyReferenceDate] = useState(getTodayDateString());
  const [slotPreviewTime, setSlotPreviewTime] = useState<string | null>(null);
  const weekdayLabels = [
    tApp(appLanguage, 'agenda_weekday_sunday'),
    tApp(appLanguage, 'agenda_weekday_monday'),
    tApp(appLanguage, 'agenda_weekday_tuesday'),
    tApp(appLanguage, 'agenda_weekday_wednesday'),
    tApp(appLanguage, 'agenda_weekday_thursday'),
    tApp(appLanguage, 'agenda_weekday_friday'),
    tApp(appLanguage, 'agenda_weekday_saturday'),
  ];
  const [vacationStartInput, setVacationStartInput] = useState('');
  const [vacationEndInput, setVacationEndInput] = useState('');
  const [vacationLabelInput, setVacationLabelInput] = useState('');
  const [vacationPickerTarget, setVacationPickerTarget] = useState<'start' | 'end' | null>(null);
  const [showSlotIntervalPicker, setShowSlotIntervalPicker] = useState(false);
  const [timeConfigTarget, setTimeConfigTarget] = useState<{
    scope: 'weekly' | 'lunch';
    weekday?: number;
    field: 'startTime' | 'endTime';
  } | null>(null);
  const listRef = useRef<FlatList<AgendaDaySection> | null>(null);
  const agendaClientInputRef = useRef<TextInput | null>(null);
  const quickClientNameInputRef = useRef<TextInput | null>(null);
  const quickClientPhoneInputRef = useRef<TextInput | null>(null);
  const quickClientEmailInputRef = useRef<TextInput | null>(null);
  const quickClientInstagramInputRef = useRef<TextInput | null>(null);
  const quickClientBirthdayInputRef = useRef<TextInput | null>(null);
  const quickServiceNameInputRef = useRef<TextInput | null>(null);
  const quickServicePriceInputRef = useRef<TextInput | null>(null);
  const quickServiceOriginalPriceInputRef = useRef<TextInput | null>(null);
  const quickServiceDurationInputRef = useRef<TextInput | null>(null);
  const quickServiceRoleInputRef = useRef<TextInput | null>(null);
  const vacationLabelInputRef = useRef<TextInput | null>(null);
  const agendaSearchInputRef = useRef<TextInput | null>(null);
  const dayPickerRef = useRef<ScrollView | null>(null);
  const [dayPickerWidth, setDayPickerWidth] = useState(0);
  const selectedDayAnim = useRef(new Animated.Value(0)).current;
  const todayDate = useMemo(() => getTodayDateString(), []);
  const displayTimeSlots = useMemo(
    () => buildDisplayTimeSlots(availabilitySettings, data),
    [availabilitySettings, data]
  );

  const closeActiveSuggestions = useCallback(() => {
    Keyboard.dismiss();
    setCampoAttivo(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        closeActiveSuggestions();
        setShowCalendarModal(false);
        setVacationPickerTarget(null);
        setShowSlotIntervalPicker(false);
        setShowCustomizeHoursExpanded(false);
        setAgendaView('today');
        setShowWeeklyPlanner(false);
        setSlotPreviewTime(null);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        dayPickerRef.current?.scrollTo({ x: 0, animated: false });
      };
    }, [closeActiveSuggestions])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setShowCustomizeHoursExpanded(false);
        setAgendaView('today');
        setShowWeeklyPlanner(false);
      }
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, () => {
      setIsQuickServiceKeyboardOpen(true);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setIsQuickServiceKeyboardOpen(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!showQuickServiceModal) return;

    const focusTimer = setTimeout(() => {
      quickServiceNameInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimer);
  }, [showQuickServiceModal]);

  useEffect(() => {
    if (!showQuickClientModal) return;

    const focusTimer = setTimeout(() => {
      quickClientNameInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(focusTimer);
  }, [showQuickClientModal]);

  const quickServiceRoleOptions = useMemo(() => {
    return Array.from(
      new Set(
        [
          ...servizi.map((item) => (item.mestiereRichiesto ?? '').trim()),
          ...operatori.map((item) => (item.mestiere ?? '').trim()),
        ].filter(Boolean)
      )
    );
  }, [operatori, servizi]);

  const getTipoAppuntamento = useCallback(
    (serviceName: string) => {
      const normalized = normalizeServiceName(serviceName);

      return (
        servizi.find((item) => normalizeServiceName(item.nome) === normalized) ?? {
          id: 'custom',
          nome: serviceName,
          prezzo: 0,
          durataMinuti: 60,
        }
      );
    },
    [servizi]
  );

  const getAppointmentEndTime = (
    item: Pick<AppuntamentoItem, 'ora' | 'servizio' | 'durataMinuti'>
  ) => {
    const durataMinuti =
      'durataMinuti' in item && typeof item.durataMinuti === 'number'
        ? item.durataMinuti
        : getTipoAppuntamento(item.servizio).durataMinuti ?? 60;

    return minutesToTime(timeToMinutes(item.ora) + durataMinuti);
  };

  const getServiceDuration = useCallback(
    (serviceName: string) => getTipoAppuntamento(serviceName).durataMinuti ?? 60,
    [getTipoAppuntamento]
  );

  const operatoriCompatibili = useMemo(
    () =>
      servizio.trim()
        ? getEligibleOperatorsForService({
            serviceName: servizio,
            services: servizi,
            operators: operatori,
            appointmentDate: data,
            settings: availabilitySettings,
          })
        : [],
    [availabilitySettings, data, operatori, servizio, servizi]
  );
  const useOperatorScheduling = operatori.length > 0;
  const serviceRequiresOperatorScheduling =
    !!servizio.trim() && useOperatorScheduling && doesServiceUseOperators(servizio, servizi);
  const serviceUsesOperatorScheduling =
    serviceRequiresOperatorScheduling && operatoriCompatibili.length > 0;
  const operatorSelectionRequired =
    serviceUsesOperatorScheduling && operatoriCompatibili.length > 1;
  const showOperatorAvailabilityCounters =
    serviceUsesOperatorScheduling && operatoriCompatibili.length > 0;

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
  }, [operatoreId, operatoriCompatibili, serviceUsesOperatorScheduling, servizio]);

  const doesAppointmentOccupySlot = useCallback(
    (item: Pick<AppuntamentoItem, 'ora' | 'servizio' | 'durataMinuti'>, slotTime: string) => {
      const start = timeToMinutes(item.ora);
      const end =
        start +
        (typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(item.servizio));
      const slot = timeToMinutes(slotTime);

      return slot >= start && slot < end;
    },
    [getServiceDuration]
  );

  const findConflictingAppointment = ({
    appointmentDate,
    startTime,
    serviceName,
    selectedOperatorId,
  }: {
    appointmentDate: string;
    startTime: string;
    serviceName: string;
    selectedOperatorId?: string | null;
  }) => {
    return findConflictingAppointmentShared({
      appointmentDate,
      startTime,
      serviceName,
      appointments: appuntamenti,
      services: servizi,
      operatorId: selectedOperatorId,
      useOperators: serviceUsesOperatorScheduling,
    });
  };

  const appuntamentiDelGiorno = useMemo(() => {
    return appuntamenti
      .filter((item) => (item.data ?? getTodayDateString()) === data)
      .sort((first, second) => first.ora.localeCompare(second.ora));
  }, [appuntamenti, data]);

  const appuntamentiOrdinati = useMemo(() => {
    return [...appuntamenti].sort((first, second) => {
      const firstDate = first.data ?? getTodayDateString();
      const secondDate = second.data ?? getTodayDateString();

      if (firstDate !== secondDate) {
        return firstDate.localeCompare(secondDate);
      }

      return first.ora.localeCompare(second.ora);
    });
  }, [appuntamenti]);

  const appuntamentiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) {
      return appuntamentiOrdinati;
    }

    return appuntamentiOrdinati.filter((item) => {
      return (
        (item.data ?? getTodayDateString()).includes(testo) ||
        item.ora.toLowerCase().includes(testo) ||
        item.cliente.toLowerCase().includes(testo) ||
        item.servizio.toLowerCase().includes(testo)
      );
    });
  }, [appuntamentiOrdinati, ricerca]);

  const appuntamentiFiltratiPerData = useMemo(() => {
    return appuntamentiFiltrati.reduce<Record<string, AppuntamentoItem[]>>((accumulator, item) => {
      const dateValue = item.data ?? todayDate;

      if (!accumulator[dateValue]) {
        accumulator[dateValue] = [];
      }

      accumulator[dateValue].push(item);
      return accumulator;
    }, {});
  }, [appuntamentiFiltrati, todayDate]);

  const appuntamentiFuturiFiltrati = useMemo(
    () => appuntamentiFiltrati.filter((item) => isAppointmentInFuture(item, todayDate)),
    [appuntamentiFiltrati, todayDate]
  );

  const appuntamentiOggiFiltrati = useMemo(
    () =>
      appuntamentiFiltrati.filter((item) => (item.data ?? getTodayDateString()) === todayDate),
    [appuntamentiFiltrati, todayDate]
  );

  const appuntamentiProssimiFiltrati = useMemo(
    () =>
      appuntamentiFuturiFiltrati.filter((item) => (item.data ?? getTodayDateString()) > todayDate),
    [appuntamentiFuturiFiltrati, todayDate]
  );

  const appuntamentiPassatiFiltrati = useMemo(() => {
    return appuntamentiFiltrati
      .filter((item) => !isAppointmentInFuture(item, todayDate))
      .sort((first, second) => {
        const firstDate = first.data ?? getTodayDateString();
        const secondDate = second.data ?? getTodayDateString();

        if (firstDate !== secondDate) {
          return secondDate.localeCompare(firstDate);
        }

        return second.ora.localeCompare(first.ora);
      });
  }, [appuntamentiFiltrati, todayDate]);

  const suggerimentiCliente = useMemo(() => {
    const testo = cliente.trim().toLowerCase();

    return clienti
      .filter((item) => (testo ? item.nome.toLowerCase().includes(testo) : true))
      .sort((first, second) => {
        if (!testo) return 0;

        const firstName = first.nome.toLowerCase();
        const secondName = second.nome.toLowerCase();
        const firstStartsWith = firstName.startsWith(testo);
        const secondStartsWith = secondName.startsWith(testo);

        if (firstStartsWith !== secondStartsWith) {
          return firstStartsWith ? -1 : 1;
        }

        return 0;
      })
      .slice(0, 6);
  }, [clienti, cliente]);

  const clienteSelezionatoRecord = useMemo(
    () =>
      clienti.find(
        (item) => item.nome.trim().toLowerCase() === cliente.trim().toLowerCase()
      ) ?? null,
    [clienti, cliente]
  );
  const clienteOnlineDisattivato = clienteSelezionatoRecord?.inibito === true;

  const suggerimentiRicerca = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    return appuntamentiOrdinati
      .filter((item) =>
        testo
          ? (item.data ?? getTodayDateString()).includes(testo) ||
            item.cliente.toLowerCase().includes(testo) ||
            item.servizio.toLowerCase().includes(testo) ||
            item.ora.toLowerCase().includes(testo)
          : true
      )
      .slice(0, 6);
  }, [appuntamentiOrdinati, ricerca]);

  const appointmentsByDate = useMemo(() => {
    return appuntamenti.reduce<Record<string, AppuntamentoItem[]>>((accumulator, item) => {
      const dateValue = item.data ?? todayDate;
      if (!accumulator[dateValue]) {
        accumulator[dateValue] = [];
      }
      accumulator[dateValue].push(item);
      return accumulator;
    }, {});
  }, [appuntamenti, todayDate]);

  const buildAgendaSections = useCallback(
    (items: AppuntamentoItem[], order: 'asc' | 'desc' = 'asc') => {
      const dateSet = new Set<string>();

      items.forEach((item) => {
        dateSet.add(item.data ?? getTodayDateString());
      });

      return Array.from(dateSet)
        .sort((first, second) =>
          order === 'asc' ? first.localeCompare(second) : second.localeCompare(first)
        )
        .map((dateValue) => ({
          date: dateValue,
          items: items.filter((item) => (item.data ?? getTodayDateString()) === dateValue),
        }));
    },
    []
  );

  const sezioniAgendaOggi = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiOggiFiltrati),
    [appuntamentiOggiFiltrati, buildAgendaSections]
  );

  const sezioniAgendaProssime = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiProssimiFiltrati),
    [appuntamentiProssimiFiltrati, buildAgendaSections]
  );

  const sezioniAgendaRecenti = useMemo<AgendaDaySection[]>(
    () => buildAgendaSections(appuntamentiPassatiFiltrati, 'desc'),
    [appuntamentiPassatiFiltrati, buildAgendaSections]
  );

  const settimanaPlanner = useMemo<WeekAgendaDay[]>(() => {
    return buildWeekDates(weeklyReferenceDate, appLanguage).map((day) => ({
      ...day,
      items: [...(appointmentsByDate[day.value] ?? [])].sort((first, second) =>
        first.ora.localeCompare(second.ora)
      ),
      isToday: day.value === todayDate,
      isClosed: getDateAvailabilityInfo(availabilitySettings, day.value).closed,
    }));
  }, [appLanguage, appointmentsByDate, availabilitySettings, todayDate, weeklyReferenceDate]);

  const settimanaPlannerInizio = useMemo(
    () => getWeekStartIso(weeklyReferenceDate),
    [weeklyReferenceDate]
  );
  const settimanaPlannerFine = useMemo(
    () => addDaysToIso(settimanaPlannerInizio, 6),
    [settimanaPlannerInizio]
  );
  const settimanaPlannerLabel = useMemo(
    () =>
      `${formatDateShortLocalized(settimanaPlannerInizio, appLanguage)} - ${formatDateShortLocalized(
        settimanaPlannerFine,
        appLanguage
      )}`,
    [appLanguage, settimanaPlannerFine, settimanaPlannerInizio]
  );

  const ultimoAppuntamentoArchiviato = useMemo(
    () => appuntamentiPassatiFiltrati[0] ?? null,
    [appuntamentiPassatiFiltrati]
  );

  const agendaQuickRows = useMemo(
    () => [
      {
        key: 'today',
        title: 'Oggi',
        note:
          appuntamentiOggiFiltrati.length === 1
            ? '1 appuntamento di oggi'
            : `${appuntamentiOggiFiltrati.length} appuntamenti di oggi`,
        date: sezioniAgendaOggi[0]?.date ?? todayDate,
        view: 'today' as AgendaView,
      },
      ...sezioniAgendaProssime.slice(0, 6).map((section) => ({
        key: `upcoming-${section.date}`,
        title: formatDateCompact(section.date),
        note:
          section.items.length === 1
            ? '1 appuntamento del giorno'
            : `${section.items.length} appuntamenti del giorno`,
        date: section.date,
        view: 'upcoming' as AgendaView,
      })),
      {
        key: 'recent',
        title: 'Archivio recente',
        note: ultimoAppuntamentoArchiviato
          ? `${formatDateCompact(ultimoAppuntamentoArchiviato.data ?? todayDate)} · ${ultimoAppuntamentoArchiviato.cliente}`
          : 'Ancora nessuno storico',
        date: sezioniAgendaRecenti[0]?.date ?? '',
        view: 'recent' as AgendaView,
      },
    ],
    [
      appuntamentiOggiFiltrati.length,
      sezioniAgendaOggi,
      todayDate,
      sezioniAgendaProssime,
      ultimoAppuntamentoArchiviato,
      sezioniAgendaRecenti,
    ]
  );

  const protectedSlotIntervalDates = useMemo(() => {
    const nextDates = new Set<string>();

    appuntamenti.forEach((item) => {
      const appointmentDate = item.data ?? todayDate;
      if (appointmentDate >= todayDate) {
        nextDates.add(appointmentDate);
      }
    });

    richiestePrenotazione.forEach((item) => {
      if (item.stato === 'Accettata' && item.data >= todayDate) {
        nextDates.add(item.data);
      }
    });

    return nextDates;
  }, [appuntamenti, richiestePrenotazione, todayDate]);

  const getSlotBookedCount = useCallback(
    (dateValue: string, slotTime: string) =>
      (appointmentsByDate[dateValue] ?? []).filter((item) =>
        doesAppointmentOccupySlot(item, slotTime)
      ).length,
    [appointmentsByDate, doesAppointmentOccupySlot]
  );

  const getSlotAvailableCount = useCallback(
    ({
      dateValue,
      startTime,
      serviceName,
      selectedOperatorId,
    }: {
      dateValue: string;
      startTime: string;
      serviceName: string;
      selectedOperatorId?: string | null;
    }) => {
      if (!serviceName.trim()) return 0;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) return 0;
      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 0;
      }
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) return 0;
      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return 0;
      }

      const appointmentsForDate = appointmentsByDate[dateValue] ?? [];
      const serviceStart = timeToMinutes(startTime);
      const serviceEnd = serviceStart + getServiceDuration(serviceName);
      const overlappingAppointments = appointmentsForDate.filter((item) => {
        const existingStart = timeToMinutes(item.ora);
        const existingEnd =
          existingStart +
          (typeof item.durataMinuti === 'number'
            ? item.durataMinuti
            : getServiceDuration(item.servizio));

        return serviceStart < existingEnd && serviceEnd > existingStart;
      });

      if (!serviceUsesOperatorScheduling) {
        return overlappingAppointments.length === 0 ? 1 : 0;
      }

      const compatibleOperators = getEligibleOperatorsForService({
        serviceName,
        services: servizi,
        operators: operatori,
        appointmentDate: dateValue,
        settings: availabilitySettings,
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
    [
      appointmentsByDate,
      availabilitySettings,
      getServiceDuration,
      operatori,
      servizi,
      serviceUsesOperatorScheduling,
    ]
  );

  const orariOccupati = new Set(
    displayTimeSlots.filter((slotTime) => getSlotBookedCount(data, slotTime) > 0)
  );

  const orariBloccatiManuali = new Set(
    displayTimeSlots.filter((slotTime) =>
      isSlotBlockedByOverride(availabilitySettings, data, slotTime)
    )
  );

  const isDateFullyBooked = (dateValue: string) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
    if (availability.closed) return false;

    const dayDisplaySlots = buildDisplayTimeSlots(availabilitySettings, dateValue);

    const candidateSlots = dayDisplaySlots.filter((slotTime) => {
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return false;
      if (
        servizio.trim() &&
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio),
        })
      ) {
        return false;
      }
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return false;
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return false;
      return true;
    });

    if (candidateSlots.length === 0) return true;

    if (servizio.trim()) {
      return candidateSlots.every(
        (slotTime) =>
          getSlotAvailableCount({
            dateValue,
            startTime: slotTime,
            serviceName: servizio,
            selectedOperatorId: operatoreId || null,
          }) === 0
      );
    }

    const appointmentsForDate = appointmentsByDate[dateValue] ?? [];

    return candidateSlots.every((slotTime) =>
      appointmentsForDate.some((item) => doesAppointmentOccupySlot(item, slotTime))
    );
  };

  const getCalendarDayMetrics = useCallback(
    (dateValue: string) => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      const isClosed = availability.closed;
      const appointmentsForDate = appointmentsByDate[dateValue] ?? [];
      const dayDisplaySlots = buildDisplayTimeSlots(availabilitySettings, dateValue);

      const scheduledSlots = dayDisplaySlots.filter(
        (slotTime) =>
          isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime) &&
          !isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)
      );

      const lunchSlots = availabilitySettings.lunchBreakEnabled
        ? scheduledSlots.filter((slotTime) => isTimeBlockedByLunchBreak(availabilitySettings, slotTime))
        : [];

      const workableSlots = scheduledSlots.filter(
        (slotTime) => !isTimeBlockedByLunchBreak(availabilitySettings, slotTime)
      );

      const occupiedSlots = workableSlots.filter((slotTime) =>
        appointmentsForDate.some((item) => doesAppointmentOccupySlot(item, slotTime))
      ).length;

      const availableSlots = Math.max(0, workableSlots.length - occupiedSlots);
      const fullyBooked = !isClosed && workableSlots.length > 0 && availableSlots === 0;
      const hasLunchBreak = availabilitySettings.lunchBreakEnabled && lunchSlots.length > 0;
      const hasAppointments = appointmentsForDate.length > 0;

      let status: 'closed' | 'full' | 'occupied' | 'lunch' | 'available' | 'neutral' = 'neutral';

      if (isClosed) status = 'closed';
      else if (fullyBooked) status = 'full';
      else if (hasAppointments) status = 'occupied';
      else if (hasLunchBreak) status = 'lunch';
      else if (availableSlots > 0) status = 'available';

      return {
        status,
        reason: availability.reason,
        isClosed,
        fullyBooked,
        hasLunchBreak,
        appointmentsCount: appointmentsForDate.length,
        availableSlots,
        occupiedSlots,
        totalSlots: workableSlots.length,
        lunchSlotsCount: lunchSlots.length,
      };
    },
    [availabilitySettings, appointmentsByDate, doesAppointmentOccupySlot]
  );

  const showCalendarDayDetails = useCallback(
    (dateValue: string) => {
      const metrics = getCalendarDayMetrics(dateValue);

      const statusLabel =
        metrics.status === 'closed'
          ? 'Chiusura salone'
          : metrics.status === 'full'
            ? 'Occupato'
            : metrics.status === 'occupied'
              ? 'Parzialmente occupato'
              : metrics.status === 'lunch'
                ? 'Disponibile con pausa pranzo'
                : metrics.status === 'available'
                  ? 'Disponibile'
                  : 'Disponibilita da verificare';

      const reasonLabel =
        metrics.reason === 'holiday'
          ? 'Festivita'
          : metrics.reason === 'vacation'
            ? 'Ferie'
            : metrics.reason === 'weekly'
              ? 'Chiusura settimanale'
              : metrics.reason === 'manual'
                ? 'Blocco manuale'
                : null;

      const details: string[] = [
        `Stato: ${statusLabel}`,
        `Appuntamenti: ${metrics.appointmentsCount}`,
        `Slot disponibili: ${metrics.availableSlots}`,
        `Slot occupati: ${metrics.occupiedSlots}`,
      ];

      if (metrics.hasLunchBreak) {
        details.push(
          `Pausa pranzo: ${availabilitySettings.lunchBreakStart}-${availabilitySettings.lunchBreakEnd} (${metrics.lunchSlotsCount} slot)`
        );
      }

      if (metrics.isClosed && reasonLabel) {
        details.push(`Motivo chiusura: ${reasonLabel}`);
      }

      Alert.alert(formatDateLongLocalized(dateValue, appLanguage), details.join('\n'));
    },
    [appLanguage, availabilitySettings.lunchBreakEnd, availabilitySettings.lunchBreakStart, getCalendarDayMetrics]
  );

  const applySlotIntervalChange = useCallback(
    (nextInterval: number) => {
      const protectedDates = Array.from(protectedSlotIntervalDates);

      Alert.alert(
        'Conferma modifica passo slot',
        "Sei sicuro che per le giornate in cui non sono presenti appuntamenti vuoi modificare il passo slot orario? Le giornate con appuntamenti o richieste già accettate manterranno il passo attuale.",
        [
          {
            text: 'No',
            style: 'cancel',
          },
          {
            text: 'Sì',
            onPress: () => {
              setAvailabilitySettings((current) => {
                const nextProtectedOverrides = protectedDates.map((dateValue) => ({
                  date: dateValue,
                  slotIntervalMinutes: getSlotIntervalForDate(current, dateValue),
                }));

                const preservedPastOverrides = current.dateSlotIntervals.filter(
                  (item) => item.date < todayDate && !protectedSlotIntervalDates.has(item.date)
                );

                return {
                  ...current,
                  slotIntervalMinutes: nextInterval,
                  dateSlotIntervals: [...preservedPastOverrides, ...nextProtectedOverrides],
                };
              });
              setShowSlotIntervalPicker(false);
            },
          },
        ]
      );
    },
    [protectedSlotIntervalDates, setAvailabilitySettings, todayDate]
  );

  const getAppuntamentiPerSlot = (slotTime: string) =>
    appuntamentiDelGiorno.filter((item) => doesAppointmentOccupySlot(item, slotTime));

  const appuntamentoInConflitto =
    data.trim() && ora.trim() && servizio.trim()
      ? findConflictingAppointment({
          appointmentDate: data,
          startTime: ora,
          serviceName: servizio,
          selectedOperatorId: serviceUsesOperatorScheduling ? operatoreId : null,
        })
      : null;

  const selectedDateAvailability = useMemo(
    () => getDateAvailabilityInfo(availabilitySettings, data),
    [availabilitySettings, data]
  );
  const isSelectedDateToday = data === todayDate;
  const currentTimeMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);
  const overlapsLunchBreakSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    doesServiceOverlapLunchBreak({
      settings: availabilitySettings,
      startTime: ora,
      durationMinutes: getServiceDuration(servizio.trim()),
    });
  const selectedServiceDuration = servizio.trim() ? getServiceDuration(servizio.trim()) : 0;
  const exceedsClosingTimeSelection =
    !!servizio.trim() &&
    !!ora.trim() &&
    !doesServiceFitWithinDaySchedule({
      settings: availabilitySettings,
      dateValue: data,
      startTime: ora,
      durationMinutes: selectedServiceDuration,
    });
  const isSelectedTimeInPast =
    !!ora.trim() && isSelectedDateToday && timeToMinutes(ora) < currentTimeMinutes;
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

  const canAdd = useMemo(() => {
    return (
      !selectedDateAvailability.closed &&
      data.trim() !== '' &&
      ora.trim() !== '' &&
      cliente.trim() !== '' &&
      servizio.trim() !== '' &&
      !exceedsClosingTimeSelection &&
      !isSelectedTimeInPast &&
      (!operatorSelectionRequired || operatoreId.trim() !== '') &&
      prezzo.trim() !== ''
    );
  }, [
    selectedDateAvailability.closed,
    data,
    ora,
    cliente,
    servizio,
    exceedsClosingTimeSelection,
    isSelectedTimeInPast,
    operatorSelectionRequired,
    operatoreId,
    prezzo,
  ]);
  const canChooseAgendaClient = true;
  const canChooseAgendaService =
    canChooseAgendaClient &&
    cliente.trim() !== '';
  const canChooseAgendaTime =
    canChooseAgendaService &&
    servizio.trim() !== '' &&
    !selectedDateAvailability.closed &&
    (!operatorSelectionRequired || operatoreId.trim() !== '');
  const canAddVacationRange =
    vacationStartInput.trim() !== '' &&
    vacationEndInput.trim() !== '' &&
    vacationStartInput.trim() <= vacationEndInput.trim();
  const orariNonDisponibiliAgenda = new Set(
    displayTimeSlots.filter((slotTime) => {
      if (selectedDateAvailability.closed) return true;
      if (isSelectedDateToday && timeToMinutes(slotTime) < currentTimeMinutes) return true;
      if (!isTimeWithinDaySchedule(availabilitySettings, data, slotTime)) return true;
      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue: data,
          startTime: slotTime,
          durationMinutes: getServiceDuration(servizio),
        })
      ) {
        return true;
      }
      if (isSlotBlockedByOverride(availabilitySettings, data, slotTime)) return true;
      if (!servizio.trim()) return true;

      return (
        getSlotAvailableCount({
          dateValue: data,
          startTime: slotTime,
          serviceName: servizio,
          selectedOperatorId: operatoreId || null,
        }) === 0
      );
    })
  );

  const meseCalendarioLabel = useMemo(
    () => formatMonthYearLabelLocalized(calendarMonth, appLanguage),
    [appLanguage, calendarMonth]
  );
  const canGoToPreviousMonth = useMemo(
    () => getMonthStart(calendarMonth).getTime() > getMonthStart(todayDate).getTime(),
    [calendarMonth, todayDate]
  );
  const calendarioMese = useMemo(
    () => buildMonthCalendar(calendarMonth, todayDate),
    [calendarMonth, todayDate]
  );

  useEffect(() => {
    const selectedIndex = giorniDisponibili.findIndex((item) => item.value === data);

    if (selectedIndex < 0) return;

    const rawOffset =
      selectedIndex * DAY_CARD_FULL_WIDTH - (dayPickerWidth - DAY_CARD_WIDTH) / 2;
    const targetOffset = Math.max(0, rawOffset);

    dayPickerRef.current?.scrollTo({
      x: targetOffset,
      animated: true,
    });
  }, [data, dayPickerWidth, giorniDisponibili]);

  useEffect(() => {
    selectedDayAnim.setValue(0);

    Animated.sequence([
      Animated.timing(selectedDayAnim, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(selectedDayAnim, {
        toValue: 0,
        friction: 7,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [data, selectedDayAnim]);

  useEffect(() => {
    setGiornoEspanso(data);
  }, [data]);

  useEffect(() => {
    setSlotPreviewTime(null);
  }, [data]);

  const handleSelectDate = (nextDate: string) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, nextDate);

    if (availability.closed) {
      Alert.alert(
        tApp(appLanguage, 'agenda_day_unavailable_title'),
        tApp(appLanguage, 'agenda_day_unavailable_body')
      );
      return;
    }

    setData(nextDate);
    setCalendarMonth(nextDate);
    setCampoAttivo(null);

    const orarioGiaOccupatoNelNuovoGiorno =
      ora.trim() !== '' &&
      appuntamenti.some(
        (item) =>
          (item.data ?? getTodayDateString()) === nextDate &&
          doesAppointmentOccupySlot(item, ora) &&
          (!serviceUsesOperatorScheduling ||
            !operatoreId ||
            !item.operatoreId ||
            item.operatoreId === operatoreId)
      );

    if (orarioGiaOccupatoNelNuovoGiorno) {
      setOra('');
    }
  };

  const upsertDateOverride = (
    dateValue: string,
    nextOverride: { forceOpen?: boolean; closed?: boolean } | null
  ) => {
    setAvailabilitySettings((current) => ({
      ...current,
      dateOverrides: nextOverride
        ? [
            { date: dateValue, ...nextOverride },
            ...current.dateOverrides.filter((item) => item.date !== dateValue),
          ]
        : current.dateOverrides.filter((item) => item.date !== dateValue),
    }));
  };

  const handleDayLongPress = (dateValue: string) => {
    const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
    const override =
      availabilitySettings.dateOverrides.find((item) => item.date === dateValue) ?? null;

    Alert.alert(
      formatDateLongLocalized(dateValue, appLanguage),
      availability.closed
        ? tApp(appLanguage, 'agenda_closed_day_body')
        : tApp(appLanguage, 'agenda_open_day_body'),
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        availability.closed
          ? {
              text: tApp(appLanguage, 'agenda_unlock_day'),
              onPress: () => upsertDateOverride(dateValue, { forceOpen: true }),
            }
          : {
              text: tApp(appLanguage, 'agenda_close_day'),
              onPress: () => upsertDateOverride(dateValue, { closed: true }),
            },
        ...(override
          ? [
              {
                text: tApp(appLanguage, 'agenda_restore_automatic'),
                onPress: () => upsertDateOverride(dateValue, null),
              },
            ]
          : []),
      ]
    );
  };

  const toggleWeeklyDayClosed = (weekday: number) => {
    setAvailabilitySettings((current) => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map((item) =>
        item.weekday === weekday ? { ...item, isClosed: !item.isClosed } : item
      ),
    }));
  };

  const updateWeeklyDayTime = (
    target: { scope: 'weekly' | 'lunch'; weekday?: number; field: 'startTime' | 'endTime' },
    value: string
  ) => {
    setAvailabilitySettings((current) => {
      if (target.scope === 'lunch') {
        const next = {
          ...current,
          [target.field === 'startTime' ? 'lunchBreakStart' : 'lunchBreakEnd']: value,
        };

        if (timeToMinutes(next.lunchBreakEnd) <= timeToMinutes(next.lunchBreakStart)) {
          if (target.field === 'startTime') {
            next.lunchBreakEnd = minutesToTime(timeToMinutes(value) + 30);
          } else {
            next.lunchBreakStart = minutesToTime(timeToMinutes(value) - 30);
          }
        }

        return next;
      }

      return {
        ...current,
        weeklySchedule: current.weeklySchedule.map((item) => {
          if (item.weekday !== target.weekday) return item;
          const nextItem = { ...item, [target.field]: value };

          if (timeToMinutes(nextItem.endTime) <= timeToMinutes(nextItem.startTime)) {
            if (target.field === 'startTime') {
              nextItem.endTime = minutesToTime(timeToMinutes(value) + 30);
            } else {
              const shiftedStart = timeToMinutes(value) - 30;
              nextItem.startTime = shiftedStart >= 0 ? minutesToTime(shiftedStart) : '00:00';
            }
          }

          return nextItem;
        }),
      };
    });
    setTimeConfigTarget(null);
  };

  const toggleSlotManualBlock = (slotTime: string) => {
    if (selectedDateAvailability.closed) return;
    if (!isTimeWithinDaySchedule(availabilitySettings, data, slotTime)) return;
    if (orariOccupati.has(slotTime)) return;

    Haptics.selectionAsync().catch(() => null);

    setAvailabilitySettings((current) => {
      const existing = current.slotOverrides.find(
        (item) => item.date === data && item.time === slotTime
      );

      return {
        ...current,
        slotOverrides: existing
          ? current.slotOverrides.filter(
              (item) => !(item.date === data && item.time === slotTime)
            )
          : [...current.slotOverrides, { date: data, time: slotTime, blocked: true }],
      };
    });
  };

  const aggiungiFerie = () => {
    if (!canAddVacationRange) return;
    const startDate = vacationStartInput.trim();
    const endDate = vacationEndInput.trim();
    const label = vacationLabelInput.trim();

    const impactedRequests = richiestePrenotazione.filter(
      (item) =>
        isDateInRange(item.data, startDate, endDate) &&
        item.stato !== 'Rifiutata' &&
        item.stato !== 'Annullata'
    );

    const applyVacationRange = () => {
      setAvailabilitySettings((current) => ({
        ...current,
        vacationRanges: [
          {
            id: `ferie-${Date.now()}`,
            startDate,
            endDate,
            label,
          },
          ...current.vacationRanges,
        ],
      }));

      if (impactedRequests.length > 0) {
        const impactedRequestIds = new Set(impactedRequests.map((item) => item.id));

        setRichiestePrenotazione((current) =>
          current.map((item) =>
            impactedRequestIds.has(item.id)
              ? {
                  ...item,
                  stato: 'Annullata',
                  viewedByCliente: false,
                  viewedBySalon: true,
                  note: [
                    item.note?.trim() || '',
                    `Annullata dal salone per ferie dal ${formatDateCompact(
                      startDate
                    )} al ${formatDateCompact(endDate)}.`,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                }
              : item
          )
        );

        setAppuntamenti((current) =>
          current.filter((entry) => {
            const appointmentDate = entry.data ?? todayDate;

            const matchingClientBooking = impactedRequests.find((request) => {
              const fullName = `${request.nome} ${request.cognome}`.trim().toLowerCase();

              return (
                request.data === appointmentDate &&
                request.ora === entry.ora &&
                request.servizio.trim().toLowerCase() === entry.servizio.trim().toLowerCase() &&
                fullName === entry.cliente.trim().toLowerCase()
              );
            });

            return !matchingClientBooking;
          })
        );
      }

      setVacationStartInput('');
      setVacationEndInput('');
      setVacationLabelInput('');
    };

    if (impactedRequests.length > 0) {
      Alert.alert(
        'Conferma ferie salone',
        `Sei sicuro di programmare queste ferie? Ci sono ${impactedRequests.length} appuntamenti o richieste cliente tra queste date. Se confermi, verranno annullati e il cliente riceverà subito l’avviso nell’app.`,
        [
          { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
          {
            text: 'Conferma ferie',
            style: 'destructive',
            onPress: applyVacationRange,
          },
        ]
      );
      return;
    }

    applyVacationRange();
  };

  const apriSelettoreFerie = (target: 'start' | 'end') => {
    setVacationPickerTarget(target);
  };

  const eliminaFerie = (id: string) => {
    setAvailabilitySettings((current) => ({
      ...current,
      vacationRanges: current.vacationRanges.filter((item) => item.id !== id),
    }));
  };

  const confermaSalvataggioAppuntamento = (forceOverlap = false) => {
    const valorePrezzo = Number(prezzo.replace(',', '.'));
    if (Number.isNaN(valorePrezzo)) {
      Alert.alert(
        tApp(appLanguage, 'agenda_invalid_price_title'),
        tApp(appLanguage, 'agenda_invalid_price_body')
      );
      return;
    }

    const hardConflict = findConflictingAppointment({
      appointmentDate: data,
      startTime: ora,
      serviceName: servizio.trim(),
      selectedOperatorId: serviceUsesOperatorScheduling ? operatoreId : null,
    });

    if (hardConflict && !forceOverlap) {
      Alert.alert(
        'Conferma sovrapposizione',
        `Questo appuntamento si accavalla con ${hardConflict.cliente} alle ${hardConflict.ora}.\n\nSe inizi alle ${ora}, ${servizio} finisce alle ${minutesToTime(
          timeToMinutes(ora) + getServiceDuration(servizio.trim())
        )}.\n\nVuoi inserirlo comunque in agenda?`,
        [
          { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
          {
            text: 'Sì, inserisci',
            style: 'destructive',
            onPress: () => confermaSalvataggioAppuntamento(true),
          },
        ]
      );
      return;
    }

    const nuovoAppuntamento: AppuntamentoItem = {
      id: Date.now().toString(),
      data,
      ora,
      cliente: cliente.trim(),
      servizio: servizio.trim(),
      prezzo: valorePrezzo,
      durataMinuti: getServiceDuration(servizio.trim()),
      operatoreId: operatoreId || undefined,
      operatoreNome: operatoreNome || undefined,
      incassato: false,
      completato: false,
    };

    setAppuntamenti([nuovoAppuntamento, ...appuntamenti]);

    const clienteRegistrato = clienti.find(
      (item) =>
        item.fonte === 'frontend' &&
        item.nome.trim().toLowerCase() === cliente.trim().toLowerCase() &&
        !!item.telefono.trim() &&
        !!(item.email ?? '').trim()
    );

    if (clienteRegistrato) {
      const [nomeParte = '', ...cognomeParti] = clienteRegistrato.nome.trim().split(' ');
      const cognomeParte = cognomeParti.join(' ');
      const esisteGiaNotifica = richiestePrenotazione.some(
        (item) =>
          item.origine === 'backoffice' &&
          item.email.trim().toLowerCase() ===
            (clienteRegistrato.email ?? '').trim().toLowerCase() &&
          item.telefono.trim() === clienteRegistrato.telefono.trim() &&
          item.data === data &&
          item.ora === ora &&
          item.servizio.trim().toLowerCase() === servizio.trim().toLowerCase()
      );

      if (!esisteGiaNotifica) {
        setRichiestePrenotazione([
          {
            id: `bo-${Date.now()}`,
            data,
            ora,
            servizio: servizio.trim(),
            prezzo: valorePrezzo,
            durataMinuti: getServiceDuration(servizio.trim()),
            nome: nomeParte,
            cognome: cognomeParte,
            email: clienteRegistrato.email ?? '',
            telefono: clienteRegistrato.telefono,
            instagram: clienteRegistrato.instagram ?? '',
            note: '',
            operatoreId: operatoreId || undefined,
            operatoreNome: operatoreNome || undefined,
            origine: 'backoffice',
            stato: 'Accettata',
            createdAt: new Date().toISOString(),
            viewedByCliente: false,
          },
          ...richiestePrenotazione,
        ]);
      }
    }

    setData(todayDate);
    setCalendarMonth(todayDate);
    setOra('');
    setCliente('');
    setServizio('');
    setPrezzo('');
    setOperatoreId('');
    setOperatoreNome('');
    setCampoAttivo(null);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  };

  const aggiungiAppuntamento = () => {
    if (!canAdd) return;

    if (isSelectedTimeInPast) {
      Alert.alert(
        'Orario non prenotabile',
        "Non puoi inserire un appuntamento in un orario già passato rispetto all'ora attuale."
      );
      return;
    }

    if (appuntamentoInConflitto) {
      confermaSalvataggioAppuntamento();
      return;
    }

    if (exceedsClosingTimeSelection) {
      const daySchedule = availabilitySettings.weeklySchedule.find(
        (item) => item.weekday === parseIsoDate(data).getDay()
      );

      Alert.alert(
        'Orario oltre chiusura',
        `Questo servizio supera l'orario di chiusura del salone${daySchedule ? `, fissato alle ${daySchedule.endTime}` : ''}. In agenda lo blocco automaticamente.`
      );
      return;
    }

    if (
      doesServiceOverlapLunchBreak({
        settings: availabilitySettings,
        startTime: ora,
        durationMinutes: getServiceDuration(servizio.trim()),
      })
    ) {
      Alert.alert(
        tApp(appLanguage, 'agenda_lunch_force_title'),
        tApp(appLanguage, 'agenda_lunch_force_body'),
        [
          {
            text: tApp(appLanguage, 'agenda_delete_cancel'),
            style: 'cancel',
          },
          {
            text: tApp(appLanguage, 'common_yes'),
            onPress: () => confermaSalvataggioAppuntamento(),
          },
        ]
      );
      return;
    }
    confermaSalvataggioAppuntamento();
  };

  const selezionaServizio = (nome: string, valorePrezzo: number) => {
    setServizio(nome);
    setPrezzo(valorePrezzo.toString());
    setOperatoreId('');
    setOperatoreNome('');
    if (
      ora &&
      findConflictingAppointment({
        appointmentDate: data,
        startTime: ora,
        serviceName: nome,
        selectedOperatorId: null,
      })
    ) {
      setOra('');
    }
    setCampoAttivo(null);
  };

  const resetQuickClientForm = useCallback(() => {
    setQuickClientNome('');
    setQuickClientTelefono('');
    setQuickClientEmail('');
    setQuickClientInstagram('');
    setQuickClientBirthday('');
  }, []);

  const resetQuickServiceForm = useCallback(() => {
    setQuickServiceNome('');
    setQuickServicePrezzo('');
    setQuickServicePrezzoOriginale('');
    setQuickServiceDurata('60');
    setQuickServiceMestiere('');
  }, []);

  const saveQuickClientFromAgenda = useCallback(() => {
    const nomeValue = quickClientNome.trim();
    const telefonoValue = quickClientTelefono.trim();
    const emailValue = quickClientEmail.trim();
    const instagramValue = quickClientInstagram.trim();
    const birthdayValue = quickClientBirthday.trim();

    if (!nomeValue || !telefonoValue) {
      Alert.alert('Campi obbligatori', 'Inserisci almeno nome e telefono.');
      return;
    }

    const duplicated = clienti.some(
      (item) =>
        item.nome.trim().toLowerCase() === nomeValue.toLowerCase() &&
        item.telefono.trim() === telefonoValue
    );

    if (duplicated) {
      Alert.alert('Cliente esistente', 'Questo cliente è già presente in rubrica.');
      setCliente(nomeValue);
      setCampoAttivo(null);
      setShowQuickClientModal(false);
      return;
    }

    const nextClient = {
      id: `cliente-${Date.now()}`,
      nome: nomeValue,
      telefono: telefonoValue,
      email: emailValue,
      instagram: instagramValue,
      birthday: birthdayValue,
      nota: '',
      fonte: 'salone' as const,
      viewedBySalon: true,
      annullamentiCount: 0,
      inibito: false,
    };

    setClienti((current) => [nextClient, ...current]);
    setCliente(nomeValue);
    setCampoAttivo(null);
    setShowQuickClientModal(false);
    resetQuickClientForm();
  }, [
    clienti,
    quickClientBirthday,
    quickClientEmail,
    quickClientInstagram,
    quickClientNome,
    quickClientTelefono,
    resetQuickClientForm,
    setClienti,
  ]);

  const saveQuickServiceFromAgenda = useCallback(() => {
    const nomeValue = quickServiceNome.trim();
    const prezzoValue = Number(quickServicePrezzo.replace(',', '.').trim());
    const prezzoOriginaleValue = quickServicePrezzoOriginale.trim()
      ? Number(quickServicePrezzoOriginale.replace(',', '.').trim())
      : null;
    const durataValue = Number(quickServiceDurata.replace(',', '.').trim());
    const mestiereValue = quickServiceMestiere.trim();

    if (!nomeValue || Number.isNaN(prezzoValue) || prezzoValue <= 0 || Number.isNaN(durataValue) || durataValue <= 0) {
      Alert.alert('Campi obbligatori', 'Inserisci nome servizio, prezzo valido e durata valida.');
      return;
    }

    const normalizedName = normalizeServiceName(nomeValue);
    const duplicate = servizi.some((item) => normalizeServiceName(item.nome) === normalizedName);

    if (duplicate) {
      Alert.alert('Servizio già presente', 'Esiste già un servizio con questo nome.');
      return;
    }

    const prezzoOriginaleFinale =
      prezzoOriginaleValue !== null && !Number.isNaN(prezzoOriginaleValue) && prezzoOriginaleValue > prezzoValue
        ? prezzoOriginaleValue
        : undefined;

    const durataMinuti = Math.max(15, Math.round(durataValue));

    setServizi((current) => [
      {
        id: `servizio-${Date.now()}`,
        nome: nomeValue,
        prezzo: prezzoValue,
        prezzoOriginale: prezzoOriginaleFinale,
        durataMinuti,
        mestiereRichiesto: mestiereValue,
      },
      ...current,
    ]);

    selezionaServizio(nomeValue, prezzoValue);
    setShowQuickServiceModal(false);
    resetQuickServiceForm();
    Keyboard.dismiss();
  }, [
    quickServiceDurata,
    quickServiceMestiere,
    quickServiceNome,
    quickServicePrezzo,
    quickServicePrezzoOriginale,
    resetQuickServiceForm,
    selezionaServizio,
    servizi,
    setServizi,
  ]);

  const completaAppuntamento = (id: string) => {
    const appuntamento = appuntamenti.find((item) => item.id === id);
    if (!appuntamento) return;
    const appointmentDate = appuntamento.data ?? todayDate;
    const isFutureDayAppointment = appointmentDate > todayDate;

    if (isFutureDayAppointment) {
      Alert.alert(
        tApp(appLanguage, 'agenda_too_early_title'),
        `Puoi segnare come completato questo appuntamento solo dal giorno ${formatDateCompact(
          appointmentDate
        )}.`
      );
      return;
    }

    const movimentoEsistente = movimenti.some((item) => item.id === `agenda-${appuntamento.id}`);

    if (!movimentoEsistente) {
      setMovimenti([
        {
          id: `agenda-${appuntamento.id}`,
          descrizione: `${appuntamento.servizio} - ${appuntamento.cliente}`,
          importo: appuntamento.prezzo,
          createdAt: `${appointmentDate}T${appuntamento.ora}:00`,
        },
        ...movimenti,
      ]);
    }

    setAppuntamenti(
      appuntamenti.map((item) =>
        item.id === id
          ? { ...item, completato: true, nonEffettuato: false, incassato: true }
          : item
      )
    );
  };

  const segnaNonEffettuato = (id: string) => {
    setAppuntamenti(
      appuntamenti.map((item) =>
        item.id === id
          ? { ...item, completato: false, nonEffettuato: true, incassato: false }
          : item
      )
    );
  };

  const eliminaAppuntamentoFuturo = (item: AppuntamentoItem) => {
    const appointmentDate = item.data ?? todayDate;

    if (!isAppointmentInFuture(item, todayDate)) {
      Alert.alert(
        tApp(appLanguage, 'agenda_delete_unavailable_title'),
        tApp(appLanguage, 'agenda_delete_unavailable_body')
      );
      return;
    }

    Alert.alert(
      tApp(appLanguage, 'agenda_delete_title'),
      `Vuoi eliminare l'appuntamento di ${item.cliente} del ${formatDateCompact(
        appointmentDate
      )} alle ${item.ora}?\n\nLo slot tornerà disponibile in agenda.`,
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'agenda_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            setAppuntamenti((current) => current.filter((entry) => entry.id !== item.id));
            setRichiestePrenotazione((current) =>
              current.filter((entry) => {
                const nomeCompleto = `${entry.nome} ${entry.cognome}`.trim().toLowerCase();
                const clienteCorrente = item.cliente.trim().toLowerCase();

                const isMatchingAcceptedBooking =
                  entry.stato === 'Accettata' &&
                  entry.data === appointmentDate &&
                  entry.ora === item.ora &&
                  entry.servizio.trim().toLowerCase() === item.servizio.trim().toLowerCase() &&
                  nomeCompleto === clienteCorrente;

                return !isMatchingAcceptedBooking;
              })
            );
          },
        },
      ]
    );
  };

  const spostaAppuntamento = (item: AppuntamentoItem) => {
    const appointmentDate = item.data ?? todayDate;

    if (!isAppointmentInFuture(item, todayDate)) {
      Alert.alert(
        'Spostamento non disponibile',
        'Puoi spostare solo appuntamenti futuri.'
      );
      return;
    }

    Alert.alert(
      'Sposta appuntamento',
      `Vuoi spostare l'appuntamento di ${item.cliente} del ${formatDateCompact(
        appointmentDate
      )} alle ${item.ora}?\n\nIl form verrà precompilato — scegli una nuova data e orario.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sposta',
          onPress: () => {
            setAppuntamenti((current) => current.filter((entry) => entry.id !== item.id));
            setRichiestePrenotazione((current) =>
              current.filter((entry) => {
                const nomeCompleto = `${entry.nome} ${entry.cognome}`.trim().toLowerCase();
                const clienteCorrente = item.cliente.trim().toLowerCase();
                const isMatchingAcceptedBooking =
                  entry.stato === 'Accettata' &&
                  entry.data === appointmentDate &&
                  entry.ora === item.ora &&
                  entry.servizio.trim().toLowerCase() === item.servizio.trim().toLowerCase() &&
                  nomeCompleto === clienteCorrente;
                return !isMatchingAcceptedBooking;
              })
            );
            setData(appointmentDate);
            setCalendarMonth(appointmentDate);
            setOra('');
            setCliente(item.cliente);
            setServizio(item.servizio);
            setPrezzo(String(item.prezzo));
            setOperatoreId(item.operatoreId ?? '');
            setOperatoreNome(item.operatoreNome ?? '');
            setShowWeeklyPlanner(false);
            setCampoAttivo(null);
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({ offset: 0, animated: true });
            });
          },
        },
      ]
    );
  };

  const renderAppuntamentoCard = (item: AppuntamentoItem, compact = false) => {
    const accent = getServiceAccentByMeta({ serviceName: item.servizio });
    const appointmentDate = item.data ?? todayDate;
    const isCompletatoDisabled =
      item.completato || item.nonEffettuato || appointmentDate > todayDate;
    const card = (
      <View
        key={item.id}
        style={[styles.timelineCard, compact && styles.timelineCardCompact]}
      >
        <View style={[styles.timelineTop, compact && styles.timelineTopCompact]}>
          <View style={styles.timelineHourPill}>
            <Text style={styles.timelineHourText}>{item.ora}</Text>
          </View>

          <View style={styles.timelineMain}>
            <View style={styles.timelineTitleRow}>
              <Text
                style={[styles.timelineClient, compact && styles.timelineClientCompact]}
                numberOfLines={1}
              >
                {item.cliente}
              </Text>
              <View
                style={[
                  styles.timelineServicePill,
                  { backgroundColor: accent.bg, borderColor: accent.border },
                ]}
              >
                <Text
                  style={[styles.timelineServicePillText, { color: accent.text }]}
                  numberOfLines={1}
                >
                  {item.servizio}
                </Text>
              </View>
            </View>

            <View style={styles.timelineMetaRow}>
              {item.operatoreNome ? (
                <Text
                  style={[styles.timelineOperator, compact && styles.timelineOperatorCompact]}
                  numberOfLines={1}
                >
                  Operatore: {item.operatoreNome}
                </Text>
              ) : null}
              <Text style={[styles.timelineMeta, compact && styles.timelineMetaCompact]}>
                {item.ora} - {getAppointmentEndTime(item)} · € {item.prezzo.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.statusRow, compact && styles.statusRowCompact]}>
          <View
            style={[
              styles.statusBadge,
              item.nonEffettuato
                ? styles.statusBadgeCancelled
                : item.completato
                  ? styles.statusBadgeDone
                  : styles.statusBadgePending,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                item.nonEffettuato
                  ? styles.statusBadgeTextCancelled
                  : item.completato
                    ? styles.statusBadgeTextDone
                    : styles.statusBadgeTextPending,
              ]}
            >
              {item.nonEffettuato
                ? tApp(appLanguage, 'agenda_status_not_done')
                : item.completato
                  ? tApp(appLanguage, 'agenda_status_completed')
                  : tApp(appLanguage, 'agenda_status_to_complete')}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              item.nonEffettuato ? styles.statusBadgePending : styles.statusBadgeDone,
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                item.nonEffettuato
                  ? styles.statusBadgeTextPending
                  : styles.statusBadgeTextDone,
              ]}
            >
              {item.nonEffettuato
                ? tApp(appLanguage, 'agenda_status_no_income')
                : tApp(appLanguage, 'agenda_status_in_cash')}
            </Text>
          </View>
        </View>

        <View style={[styles.actionsRow, compact && styles.actionsRowCompact]}>
          <TouchableOpacity
            style={[styles.darkButton, isCompletatoDisabled && styles.darkButtonDisabled]}
            onPress={() => completaAppuntamento(item.id)}
            activeOpacity={0.9}
            disabled={isCompletatoDisabled}
          >
            <Text
              style={[
                styles.darkButtonText,
                isCompletatoDisabled && styles.darkButtonTextDisabled,
              ]}
            >
              {tApp(appLanguage, 'agenda_status_completed')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              (item.completato || item.nonEffettuato) && styles.secondaryButtonDisabled,
            ]}
            onPress={() => segnaNonEffettuato(item.id)}
            activeOpacity={0.9}
            disabled={item.completato || item.nonEffettuato}
          >
            <Text
              style={[
                styles.secondaryButtonText,
                (item.completato || item.nonEffettuato) &&
                  styles.secondaryButtonTextDisabled,
              ]}
            >
              {tApp(appLanguage, 'agenda_status_not_done')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    return card;
  };

  const renderAgendaDaySection = (item: AgendaDaySection, compactCards = false) => {
    const expanded = giornoEspanso === item.date;

    return (
      <View
        key={`section-${item.date}`}
        style={[
          styles.daySectionCard,
          styles.daySectionCardShell,
          compactCards && styles.daySectionCardCompact,
          { maxWidth: responsive.contentMaxWidth },
        ]}
      >
        <TouchableOpacity
          style={styles.daySectionHeader}
          onPress={() => setGiornoEspanso((current) => (current === item.date ? '' : item.date))}
          activeOpacity={0.9}
        >
          <View style={styles.daySectionHeaderLeft}>
            <Text style={styles.daySectionTitle}>
              {formatDateLongLocalized(item.date, appLanguage)}
            </Text>
            <Text style={styles.daySectionSubtitle}>
              {item.items.length === 0
                ? tApp(appLanguage, 'agenda_no_appointments')
                : item.items.length === 1
                  ? tApp(appLanguage, 'agenda_one_appointment')
                  : tApp(appLanguage, 'agenda_many_appointments', {
                      count: item.items.length,
                    })}
            </Text>
          </View>

          <View style={styles.daySectionHeaderRight}>
            <View style={styles.daySectionCount}>
              <Text style={styles.daySectionCountText}>{item.items.length}</Text>
            </View>
            <View style={styles.sectionChevronBadge}>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#111111"
              />
            </View>
          </View>
        </TouchableOpacity>

        {expanded ? (
          <View style={styles.daySectionContent}>
            {item.items.length > 0 ? (
              item.items.map((appointment) => renderAppuntamentoCard(appointment, compactCards))
            ) : (
              <View style={styles.daySectionEmpty}>
                <Text style={styles.daySectionEmptyTitle}>
                  {tApp(appLanguage, 'agenda_free_day_title')}
                </Text>
                <Text style={styles.daySectionEmptyText}>
                  {tApp(appLanguage, 'agenda_free_day_text')}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  const renderWeeklyPlanner = () => {
    if (!showWeeklyPlanner) return null;

    return (
      <View style={styles.weeklyPlannerCard}>
        <View style={styles.weeklyPlannerHeader}>
          <Text style={styles.weeklyPlannerEyebrow}>Vista Settimanale Appuntamenti</Text>

          <View style={styles.weeklyPlannerNavRow}>
            <TouchableOpacity
              style={styles.weeklyPlannerNavButton}
              onPress={() => setWeeklyReferenceDate((current) => addDaysToIso(current, -7))}
              activeOpacity={0.9}
            >
              <Ionicons name="chevron-back" size={18} color="#111111" />
            </TouchableOpacity>

            <View style={styles.weeklyPlannerTitleWrap}>
              <Text style={styles.weeklyPlannerTitle}>{settimanaPlannerLabel}</Text>
              <Text style={styles.weeklyPlannerSubtitle}>
                Elenco appuntamenti per giorno, in ordine cronologico.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.weeklyPlannerNavButton}
              onPress={() => setWeeklyReferenceDate((current) => addDaysToIso(current, 7))}
              activeOpacity={0.9}
            >
              <Ionicons name="chevron-forward" size={18} color="#111111" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.weeklyPlannerList}>
          {settimanaPlanner.map((day) => (
            <View key={day.value} style={styles.weeklyPlannerDaySection}>
              <TouchableOpacity
                style={styles.weeklyPlannerDayHeader}
                onPress={() => {
                  setData(day.value);
                  setCalendarMonth(day.value);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.weeklyPlannerDayBadge}>
                  <Text style={styles.weeklyPlannerDayBadgeLabel}>{day.weekdayShort}</Text>
                  <Text style={styles.weeklyPlannerDayBadgeNumber}>{day.dayNumber}</Text>
                </View>

                <View style={styles.weeklyPlannerDayTextWrap}>
                  <Text style={styles.weeklyPlannerDayTitle}>{day.fullLabel}</Text>
                  <Text style={styles.weeklyPlannerDayMeta}>
                    {day.isClosed
                      ? tApp(appLanguage, 'agenda_closed')
                      : day.items.length === 0
                        ? ''
                        : day.items.length === 1
                          ? tApp(appLanguage, 'agenda_one_appointment')
                          : tApp(appLanguage, 'agenda_many_appointments', {
                              count: day.items.length,
                            })}
                  </Text>
                </View>
              </TouchableOpacity>

              {day.items.length > 0 ? (
                <View style={styles.weeklyPlannerBookingList}>
                  {day.items.map((appointment) => {
                    const isFuture = isAppointmentInFuture(appointment, todayDate);
                    const rowContent = (
                      <View style={styles.weeklyPlannerBookingRow}>
                        <Text style={styles.weeklyPlannerBookingTime}>{appointment.ora}</Text>
                        <View style={styles.weeklyPlannerBookingTextWrap}>
                          <Text style={styles.weeklyPlannerBookingClient} numberOfLines={2}>
                            {appointment.cliente}
                          </Text>
                          <Text style={styles.weeklyPlannerBookingService} numberOfLines={2}>
                            {appointment.servizio}
                            {appointment.operatoreNome ? ` · ${appointment.operatoreNome}` : ''}
                          </Text>
                          {isFuture ? (
                            <View style={styles.weeklyPlannerInlineActions}>
                              <TouchableOpacity
                                style={styles.weeklyPlannerMoveButton}
                                onPress={() => spostaAppuntamento(appointment)}
                                activeOpacity={0.9}
                              >
                                <Text style={styles.weeklyPlannerMoveButtonText}>Sposta</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.weeklyPlannerDeleteButton}
                                onPress={() => eliminaAppuntamentoFuturo(appointment)}
                                activeOpacity={0.9}
                              >
                                <Text style={styles.weeklyPlannerDeleteButtonText}>Elimina</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                    return <View key={appointment.id}>{rowContent}</View>;
                  })}
                </View>
              ) : (
                <View style={styles.weeklyPlannerDayEmpty} />
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={[]}
        keyExtractor={(item) => item.date}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          closeActiveSuggestions();
        }}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="agenda"
                title={tApp(appLanguage, 'tab_agenda')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                subtitle="Per prenotare un appuntamento segui i punti in ordine cronologico 1, 2, 3 ecc..."
              />
            </View>

            <TouchableOpacity
              style={[
                styles.weeklyPlannerToggle,
                showWeeklyPlanner && styles.weeklyPlannerToggleExpanded,
              ]}
              onPress={() => {
                setWeeklyReferenceDate(data);
                setShowWeeklyPlanner((current) => !current);
              }}
              activeOpacity={0.9}
            >
              <View style={styles.weeklyPlannerToggleIconSlot}>
                <Ionicons name="calendar-outline" size={18} color="#111111" />
              </View>
              <Text style={styles.weeklyPlannerToggleText}>Vista Settimanale Appuntamenti</Text>
              <View style={styles.weeklyPlannerToggleChevronSlot}>
                <Ionicons
                  name={showWeeklyPlanner ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#111111"
                />
              </View>
            </TouchableOpacity>

            {renderWeeklyPlanner()}

            <View style={[styles.bookingCard, styles.bookingCardPrimary]}>
                <View style={styles.bookingHeader}>
                  <View style={styles.bookingHeaderLeft}>
                    <View style={styles.bookingHeadingRow}>
                      <Text style={styles.bookingHeading} numberOfLines={2}>
                        Prenotazione appuntamento
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.sectionBlock}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.stepPill}>1</Text>
                    <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_client')}</Text>
                    <TouchableOpacity
                      style={styles.inlineAddClientButton}
                      onPress={() => setShowQuickClientModal(true)}
                      activeOpacity={0.9}
                    >
                      <Ionicons name="add" size={18} color="#0f172a" />
                    </TouchableOpacity>
                  </View>

                  <ClearableTextInput
                    ref={agendaClientInputRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'agenda_name_customer_placeholder')}
                    placeholderTextColor="#8f8f8f"
                    value={cliente}
                    onChangeText={setCliente}
                    onFocus={() => setCampoAttivo('cliente')}
                    editable={canChooseAgendaClient}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {campoAttivo === 'cliente' && suggerimentiCliente.length > 0 ? (
                    <View style={styles.suggestionBox}>
                      {suggerimentiCliente.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setCliente(item.nome);
                            setCampoAttivo(null);
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.suggestionText}>
                            {item.nome} · {item.telefono}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  {clienteOnlineDisattivato ? (
                    <View style={styles.warningInlineCard}>
                      <Text style={styles.warningInlineTitle}>{tApp(appLanguage, 'agenda_online_disabled_title')}</Text>
                      <Text style={styles.warningInlineText}>
                        {tApp(appLanguage, 'agenda_online_disabled_text')}
                      </Text>
                    </View>
                  ) : null}

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickClientsRow}
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={closeActiveSuggestions}
                  >
                    {clienti.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.quickClientChip}
                        onPress={() => {
                          setCliente(item.nome);
                          setCampoAttivo(null);
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.quickClientChipText}>{item.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.bookingSectionDivider} />

                <View
                  style={[
                    styles.sectionBlock,
                    styles.serviceSectionBlockCompact,
                    !canChooseAgendaService && styles.sectionBlockLocked,
                  ]}
                >
                  <View style={[styles.sectionTitleRow, styles.serviceSectionTitleRow]}>
                    <Text style={styles.stepPill}>2</Text>
                    <Text style={styles.sectionTitle}>Tipo di servizio</Text>
                    <TouchableOpacity
                      style={styles.inlineAddClientButton}
                      onPress={() => setShowQuickServiceModal(true)}
                      activeOpacity={0.9}
                      disabled={!canChooseAgendaClient}
                    >
                      <Ionicons
                        name="add"
                        size={18}
                        color={canChooseAgendaClient ? '#0f172a' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                  </View>

                  {!canChooseAgendaService ? (
                    <Text style={styles.lockedSectionText}>
                      Seleziona prima il cliente per scegliere il servizio.
                    </Text>
                  ) : null}

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={[styles.serviceRow, styles.serviceRowCompact]}
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={closeActiveSuggestions}
                  >
                    {servizi.map((item) => {
                      const selected = item.nome === servizio;
                      const accent = getServiceAccentByMeta({
                        serviceName: item.nome,
                        roleName: item.mestiereRichiesto,
                      });

                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[
                            styles.serviceCard,
                            styles.serviceCardCompact,
                            {
                              backgroundColor: selected ? '#ffffff' : accent.bg,
                              borderColor: selected ? accent.text : accent.border,
                            },
                            selected && styles.serviceCardActive,
                          ]}
                          onPress={() => selezionaServizio(item.nome, item.prezzo)}
                          activeOpacity={canChooseAgendaService ? 0.9 : 1}
                          disabled={!canChooseAgendaService}
                        >
                          <Text style={[styles.serviceCardTitle, styles.serviceCardTitleCompact, { color: accent.text }]}>
                            {item.nome}
                          </Text>
                          <Text style={[styles.serviceCardPrice, styles.serviceCardPriceCompact, { color: accent.text }]}>
                            € {item.prezzo.toFixed(2)}
                          </Text>
                          <Text
                            style={[
                              styles.serviceCardDuration,
                              styles.serviceCardDurationCompact,
                              { color: accent.text },
                            ]}
                          >
                            {(item.durataMinuti ?? 60) === 30
                              ? '30 min'
                              : (item.durataMinuti ?? 60) === 60
                                ? '1 ora'
                                : (item.durataMinuti ?? 60) === 90
                                  ? '1 ora e 30'
                                  : `${item.durataMinuti ?? 60} min`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.bookingSectionDivider} />

                <View
                  style={[
                    serviceUsesOperatorScheduling ? styles.sectionBlock : styles.sectionBlockLast,
                    styles.daySectionBlockCompact,
                  ]}
                >
                  <View style={styles.dayPickerHeaderBlock}>
                    <View style={styles.dayPickerHeaderMain}>
                      <Text style={styles.stepPill}>3</Text>
                      <Text style={[styles.sectionTitle, styles.dayPickerHeaderTitle]}>
                        {tApp(appLanguage, 'agenda_day_of_month')}
                      </Text>
                      <TouchableOpacity
                        style={[styles.bookingBadge, styles.dayPickerBadge]}
                        onPress={() => {
                          setCalendarMonth(data);
                          setShowCalendarModal(true);
                        }}
                        activeOpacity={0.9}
                      >
                        <View style={[styles.bookingBadgeContent, styles.bookingBadgeContentInline]}>
                          <Ionicons name="grid-outline" size={13} color="#64748b" />
                          <Text style={[styles.bookingBadgeText, styles.dayPickerBadgeText]}>
                            Apri griglia
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View
                    style={styles.dayPickerWrap}
                    onLayout={(event) => setDayPickerWidth(event.nativeEvent.layout.width)}
                  >
                    <ScrollView
                      ref={dayPickerRef}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.dayPickerRow}
                      keyboardDismissMode="on-drag"
                      onScrollBeginDrag={closeActiveSuggestions}
                    >
                      {giorniDisponibili.map((day) => {
                      const selected = day.value === data;
                      const availability = getDateAvailabilityInfo(availabilitySettings, day.value);
                      const disabled = availability.closed;
                      const footerLabel = selected
                        ? tApp(appLanguage, 'agenda_selected_short')
                        : disabled
                          ? tApp(appLanguage, 'agenda_unavailable_short')
                          : tApp(appLanguage, 'agenda_available_short');
                        const statusLabel =
                        availability.reason === 'holiday'
                          ? tApp(appLanguage, 'agenda_holiday')
                          : availability.reason === 'vacation'
                            ? tApp(appLanguage, 'agenda_vacation')
                            : availability.reason === 'weekly'
                              ? tApp(appLanguage, 'agenda_closed')
                              : availability.reason === 'manual'
                                ? tApp(appLanguage, 'agenda_blocked')
                                : null;
                      const animatedStyle = selected
                        ? {
                            transform: [
                              {
                                scale: selectedDayAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [1, 1.06],
                                }),
                              },
                              {
                                translateY: selectedDayAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0, -2],
                                }),
                              },
                            ],
                          }
                        : undefined;

                      return (
                        <Animated.View key={day.value} style={[styles.dayCardWrap, animatedStyle]}>
                          <TouchableOpacity
                            style={[
                              styles.dayCard,
                              selected && styles.dayCardActive,
                              disabled && styles.dayCardClosed,
                              selected && !disabled && styles.dayCardActiveShadow,
                            ]}
                            onPress={() => handleSelectDate(day.value)}
                            onLongPress={() => handleDayLongPress(day.value)}
                            activeOpacity={0.9}
                          >
                            <View style={styles.dayCardHeader}>
                              <Text
                                style={[
                                  styles.dayWeek,
                                  selected && styles.dayCardTextActive,
                                  disabled && styles.dayCardTextClosed,
                                ]}
                              >
                                {day.weekdayShort}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.dayNumber,
                                selected && styles.dayCardTextActive,
                                disabled && styles.dayCardTextClosed,
                              ]}
                            >
                              {day.dayNumber}
                            </Text>
                            {statusLabel ? (
                              <View
                                style={[
                                  styles.dayStatusBadge,
                                  styles.dayStatusBadgeClosed,
                                  availability.reason === 'holiday' &&
                                    styles.dayStatusBadgeHoliday,
                                ]}
                              >
                                <Text style={styles.dayStatusBadgeText}>{statusLabel}</Text>
                              </View>
                            ) : (
                              <View style={styles.dayStatusBadgeSpacer} />
                            )}
                            <Text
                              style={[
                                styles.dayMonth,
                                selected && styles.dayCardTextActive,
                                disabled && styles.dayCardTextClosed,
                              ]}
                            >
                              {day.monthShort}
                            </Text>

                            <View
                              style={[
                                styles.dayCardFooter,
                                selected && styles.dayCardFooterActive,
                                disabled && styles.dayCardFooterClosed,
                                !selected && !disabled && styles.dayCardFooterAvailable,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.dayCardFooterText,
                                  selected && styles.dayCardFooterTextActive,
                                  disabled && styles.dayCardFooterTextClosed,
                                  !selected && !disabled && styles.dayCardFooterTextAvailable,
                                ]}
                              >
                                {footerLabel}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                    </ScrollView>
                  </View>

                  <Text style={[styles.sectionHint, styles.daySectionHintCompact]}>
                    {formatDateLongLocalized(data, appLanguage)}
                    {selectedDateAvailability.closed ? ` · ${tApp(appLanguage, 'agenda_closed_day')}` : ''}
                  </Text>
                </View>

                {serviceUsesOperatorScheduling ? (
                  <>
                    <View style={styles.bookingSectionDivider} />

                    <View
                      style={[
                        styles.sectionBlockLast,
                        styles.operatorSectionBlockCompact,
                        !canChooseAgendaService && styles.sectionBlockLocked,
                      ]}
                    >
                    <View style={[styles.sectionTitleRow, styles.operatorSectionTitleRow]}>
                      <Text style={styles.stepPill}>4</Text>
                      <Text style={styles.sectionTitle}>Operatore</Text>
                    </View>

                    {!canChooseAgendaService ? (
                      <Text style={styles.lockedSectionText}>
                        Seleziona prima cliente e servizio.
                      </Text>
                    ) : null}

                    {canChooseAgendaService && operatoriCompatibili.length === 0 ? (
                      <Text style={styles.lockedSectionText}>
                        Nessun operatore disponibile per questo mestiere nella data selezionata.
                      </Text>
                    ) : null}

                    {operatorSelectionRequired ? (
                      <View style={[styles.operatorSelectionRow, styles.operatorSelectionRowCompact]}>
                        {operatoriCompatibili.map((item) => {
                          const selected = item.id === operatoreId;

                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={[
                                styles.operatorSelectionCard,
                                styles.operatorSelectionCardCompact,
                                selected && styles.operatorSelectionCardActive,
                              ]}
                              onPress={() => {
                                setOperatoreId(item.id);
                                setOperatoreNome(item.nome);
                                setOra('');
                              }}
                              activeOpacity={0.9}
                              disabled={!servizio.trim()}
                            >
                              <Text
                                style={[
                                  styles.operatorSelectionName,
                                  styles.operatorSelectionNameCompact,
                                  selected && styles.operatorSelectionNameActive,
                                ]}
                              >
                                {item.nome}
                              </Text>
                              <Text
                                style={[
                                  styles.operatorSelectionRole,
                                  styles.operatorSelectionRoleCompact,
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
                  </>
                ) : null}
            </View>

            <View style={[styles.bookingCard, styles.bookingCardSchedule]}>
              <View
                style={[
                  styles.sectionBlock,
                  styles.timeSectionBlockCompact,
                  !canChooseAgendaTime && styles.sectionBlockLocked,
                ]}
              >
                <View style={[styles.sectionTitleRow, styles.timeSectionTitleRow]}>
                  <Text style={styles.stepPill}>
                    {operatorSelectionRequired ? '5' : '4'}
                  </Text>
                  <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_time')}</Text>
                </View>

                {!canChooseAgendaTime ? (
                  <Text style={styles.lockedSectionText}>
                    {!canChooseAgendaService
                      ? 'Seleziona prima cliente e servizio.'
                      : tApp(appLanguage, 'agenda_unlock_time_after_client')}
                  </Text>
                ) : null}
                <View style={[styles.timeGrid, styles.timeGridCompact]}>
                  {displayTimeSlots.map((item) => {
                    const selected = selectedTimeRange.has(item);
                    const locked = !canChooseAgendaTime;
                    const bookedCount = getSlotBookedCount(data, item);
                    const slotAvailableCount = servizio.trim()
                      ? getSlotAvailableCount({
                          dateValue: data,
                          startTime: item,
                          serviceName: servizio,
                          selectedOperatorId: operatoreId || null,
                        })
                      : 0;
                    const occupied =
                      canChooseAgendaTime &&
                      bookedCount > 0 &&
                      servizio.trim() !== '' &&
                      slotAvailableCount === 0;
                    const outsideHours =
                      canChooseAgendaTime &&
                      !selectedDateAvailability.closed &&
                      !isTimeWithinDaySchedule(availabilitySettings, data, item);
                    const lunchBadge =
                      canChooseAgendaTime && isTimeBlockedByLunchBreak(availabilitySettings, item);
                    const lunchOverlapCandidate =
                      canChooseAgendaTime &&
                      servizio.trim() &&
                      doesServiceOverlapLunchBreak({
                        settings: availabilitySettings,
                        startTime: item,
                        durationMinutes: selectedServiceDuration,
                      });
                    const manuallyBlocked =
                      canChooseAgendaTime && orariBloccatiManuali.has(item);
                    const previewItems = bookedCount > 0 ? getAppuntamentiPerSlot(item) : [];
                    const previewItem = previewItems[0] ?? null;
                    const showPreview = slotPreviewTime === item && previewItems.length > 0;
                    const unavailableDark =
                      selectedDateAvailability.closed || outsideHours || manuallyBlocked;
                    const pastTime =
                      canChooseAgendaTime &&
                      isSelectedDateToday &&
                      timeToMinutes(item) < currentTimeMinutes;
                    const unavailableByService =
                      canChooseAgendaTime && orariNonDisponibiliAgenda.has(item);
                    const slotCounterText = showOperatorAvailabilityCounters
                      ? slotAvailableCount > 0
                        ? `${slotAvailableCount} disp.`
                        : bookedCount > 0
                          ? `${bookedCount} pren.`
                          : 'Pieno'
                      : null;
                    const slotCounterAvailable =
                      showOperatorAvailabilityCounters &&
                      slotAvailableCount > 0 &&
                      !unavailableDark;

                    return (
                      <TouchableOpacity
                        key={item}
                        style={[
                          styles.timeChip,
                          styles.timeChipCompact,
                          { width: `${100 / responsive.timeGridColumns - 3}%` },
                          selected && styles.timeChipActive,
                          occupied && !selected && styles.timeChipDisabled,
                          lunchOverlapCandidate &&
                            !selected &&
                            !occupied &&
                            !unavailableDark &&
                            styles.timeChipWarning,
                          pastTime && !selected && styles.timeChipDisabled,
                          unavailableDark && !selected && styles.timeChipUnavailable,
                          unavailableByService &&
                            !selected &&
                            !occupied &&
                            !lunchOverlapCandidate &&
                            !unavailableDark &&
                            styles.timeChipDisabled,
                          locked && styles.timeChipLocked,
                          showPreview && styles.timeChipPreviewActive,
                        ]}
                        onPress={() => {
                          if (
                            occupied ||
                            locked ||
                            unavailableDark ||
                            unavailableByService ||
                            pastTime
                          ) {
                            return;
                          }
                          setOra(item);
                          setCampoAttivo(null);
                        }}
                        onLongPress={() => {
                          if (locked || occupied) return;
                          toggleSlotManualBlock(item);
                        }}
                        onPressIn={() => {
                          if (!previewItem) return;
                          Haptics.selectionAsync().catch(() => null);
                          setSlotPreviewTime(item);
                        }}
                        onPressOut={() => {
                          if (slotPreviewTime === item) {
                            setSlotPreviewTime(null);
                          }
                        }}
                        activeOpacity={occupied || locked || pastTime ? 1 : 0.9}
                      >
                        {lunchBadge ? (
                          <View style={[styles.slotMiniBadge, styles.slotMiniBadgeCompact]}>
                            <Text style={styles.slotMiniBadgeText}>
                              {tApp(appLanguage, 'agenda_pause_badge')}
                            </Text>
                          </View>
                        ) : slotCounterText ? (
                          <View
                            style={[
                              styles.slotMiniBadge,
                              styles.slotMiniBadgeCompact,
                              slotCounterAvailable
                                ? styles.slotMiniBadgeAvailable
                                : styles.slotMiniBadgeBusy,
                            ]}
                          >
                            <Text
                              style={[
                                styles.slotMiniBadgeText,
                                slotCounterAvailable
                                  ? styles.slotMiniBadgeTextAvailable
                                  : styles.slotMiniBadgeTextBusy,
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.75}
                            >
                              {slotCounterText}
                            </Text>
                          </View>
                        ) : null}
                        {showPreview ? (
                          <View pointerEvents="none" style={styles.slotPreviewBubble}>
                            {previewItems.map((preview, index) => (
                              <View
                                key={`${preview.id}-${index}`}
                                style={[
                                  styles.slotPreviewItem,
                                  index > 0 && styles.slotPreviewItemDivider,
                                ]}
                              >
                                <Text style={styles.slotPreviewTitle}>{preview.cliente}</Text>
                                <Text style={styles.slotPreviewText}>{preview.servizio}</Text>
                                {preview.operatoreNome ? (
                                  <Text style={styles.slotPreviewText}>
                                    Operatore: {preview.operatoreNome}
                                  </Text>
                                ) : null}
                                <Text style={styles.slotPreviewText}>
                                  {preview.ora} - {getAppointmentEndTime(preview)} · €{' '}
                                  {preview.prezzo.toFixed(2)}
                                </Text>
                              </View>
                            ))}
                            <View style={styles.slotPreviewArrow} />
                          </View>
                        ) : null}
                        <Text
                          style={[
                            styles.timeChipText,
                            styles.timeChipTextCompact,
                            selected && styles.timeChipTextActive,
                            lunchOverlapCandidate &&
                              !selected &&
                              !occupied &&
                              !unavailableDark &&
                              styles.timeChipTextWarning,
                            (occupied || unavailableByService) &&
                              !selected &&
                              styles.timeChipTextDisabled,
                            unavailableDark && !selected && styles.timeChipTextUnavailable,
                            locked && styles.timeChipTextLocked,
                          ]}
                        >
                          {item}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedDateAvailability.closed ? (
                  <Text style={styles.errorText}>
                    {tApp(appLanguage, 'agenda_day_closed_manual_hint')}
                  </Text>
                ) : overlapsLunchBreakSelection ? (
                  <Text style={styles.errorText}>
                    {tApp(appLanguage, 'agenda_lunch_overlap_hint')}
                  </Text>
                ) : availabilitySettings.lunchBreakEnabled ? (
                  <Text style={styles.sectionHint}>
                    {tApp(appLanguage, 'agenda_lunch_break_active_hint', {
                      startTime: availabilitySettings.lunchBreakStart,
                      endTime: availabilitySettings.lunchBreakEnd,
                    })}
                  </Text>
                ) : null}

              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>{tApp(appLanguage, 'agenda_summary')}</Text>
                <Text style={styles.summaryText}>
                  {tApp(appLanguage, 'agenda_summary_date')}: {formatDateCompact(data)}
                </Text>
                <Text style={styles.summaryText}>
                  {tApp(appLanguage, 'agenda_summary_time')}: {ora || '—'}
                </Text>
                <Text style={styles.summaryText}>
                  {tApp(appLanguage, 'agenda_summary_end')}:{' '}
                  {ora && servizio ? getAppointmentEndTime({ ora, servizio }) : '—'}
                </Text>
                <Text style={styles.summaryText}>{tApp(appLanguage, 'agenda_appointment_label')}: {servizio || '—'}</Text>
                {operatorSelectionRequired ? (
                  <Text style={styles.summaryText}>Operatore: {operatoreNome || '—'}</Text>
                ) : null}
                <Text style={styles.summaryText}>
                  {tApp(appLanguage, 'agenda_summary_customer')}: {cliente || '—'}
                </Text>
                {clienteOnlineDisattivato ? (
                <Text style={styles.summaryWarningText}>{tApp(appLanguage, 'agenda_online_disabled_title')}</Text>
                ) : null}
                <Text style={styles.summaryText}>
                  {tApp(appLanguage, 'agenda_summary_price')}: {prezzo ? `€ ${prezzo}` : '—'}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, !canAdd && styles.primaryButtonDisabled]}
                onPress={aggiungiAppuntamento}
                activeOpacity={0.9}
                disabled={!canAdd}
              >
                <Text style={styles.primaryButtonText}>{tApp(appLanguage, 'agenda_confirm_button')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchCard}>
              <TouchableOpacity
                style={[styles.sectionToggleButton, styles.utilityToggleButton]}
                onPress={() => setShowCustomizeHoursExpanded((current) => !current)}
                activeOpacity={0.9}
              >
                <View style={styles.sectionToggleTextWrap}>
                  <Text style={styles.searchTitle}>{tApp(appLanguage, 'agenda_customize_hours')}</Text>
                  <Text style={styles.sectionHint}>
                    {tApp(appLanguage, 'agenda_customize_hint')}
                  </Text>
                </View>
                <View style={styles.sectionChevronBadge}>
                  <Ionicons
                    name={showCustomizeHoursExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#111111"
                  />
                </View>
              </TouchableOpacity>

              {showCustomizeHoursExpanded ? (
                <>
                  <View style={styles.lunchBreakCard}>
                    <View style={styles.scheduleRow}>
                      <View style={styles.scheduleDayInfo}>
                        <Text style={styles.scheduleDayLabel}>
                          {tApp(appLanguage, 'agenda_slot_interval_title')}
                        </Text>
                        <Text style={styles.scheduleDayMeta}>
                          {tApp(appLanguage, 'agenda_slot_interval_current', {
                            slotInterval: formatSlotInterval(availabilitySettings.slotIntervalMinutes),
                          })}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      style={styles.slotIntervalField}
                      onPress={() => setShowSlotIntervalPicker(true)}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.slotIntervalFieldText}>
                        Slot {formatSlotInterval(availabilitySettings.slotIntervalMinutes)}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#334155" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.scheduleSubsectionTitle}>Programmazione Pausa Pranzo:</Text>
                  <View style={styles.lunchBreakCard}>
                    <View style={styles.lunchBreakCompactRow}>
                      <TouchableOpacity
                        style={[
                          styles.scheduleToggleChip,
                          availabilitySettings.lunchBreakEnabled
                            ? styles.scheduleToggleChipOpen
                            : styles.scheduleToggleChipClosed,
                        ]}
                        onPress={() =>
                          setAvailabilitySettings((current) => ({
                            ...current,
                            lunchBreakEnabled: !current.lunchBreakEnabled,
                          }))
                        }
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[
                            styles.scheduleToggleText,
                            availabilitySettings.lunchBreakEnabled
                              ? styles.scheduleToggleTextOpen
                              : styles.scheduleToggleTextClosed,
                          ]}
                        >
                          {availabilitySettings.lunchBreakEnabled ? 'Attiva' : 'Disattivata'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.scheduleTimeChip}
                        onPress={() =>
                          availabilitySettings.lunchBreakEnabled &&
                          setTimeConfigTarget({ scope: 'lunch', field: 'startTime' })
                        }
                        activeOpacity={availabilitySettings.lunchBreakEnabled ? 0.9 : 1}
                      >
                        <Text style={styles.scheduleTimeChipText}>
                          {availabilitySettings.lunchBreakStart}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.scheduleTimeChip}
                        onPress={() =>
                          availabilitySettings.lunchBreakEnabled &&
                          setTimeConfigTarget({ scope: 'lunch', field: 'endTime' })
                        }
                        activeOpacity={availabilitySettings.lunchBreakEnabled ? 0.9 : 1}
                      >
                        <Text style={styles.scheduleTimeChipText}>
                          {availabilitySettings.lunchBreakEnd}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {availabilitySettings.weeklySchedule.map((item) => (
                    <View key={`weekday-${item.weekday}`} style={styles.scheduleRow}>
                      <View style={styles.scheduleDayInfo}>
                        <Text
                          style={styles.scheduleDayLabel}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {weekdayLabels[item.weekday]}
                          </Text>
                          <Text
                            style={styles.scheduleDayMeta}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.82}
                          >
                            {item.isClosed
                              ? tApp(appLanguage, 'agenda_schedule_closed')
                              : tApp(appLanguage, 'agenda_schedule_hours', {
                                  startTime: item.startTime,
                                  endTime: item.endTime,
                                })}
                          </Text>
                        </View>

                        <View style={styles.scheduleControlsRow}>
                          <TouchableOpacity
                            style={[
                              styles.scheduleToggleChip,
                              item.isClosed
                                ? styles.scheduleToggleChipClosed
                                : styles.scheduleToggleChipOpen,
                            ]}
                            onPress={() => toggleWeeklyDayClosed(item.weekday)}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.scheduleToggleText,
                                item.isClosed
                                  ? styles.scheduleToggleTextClosed
                                  : styles.scheduleToggleTextOpen,
                              ]}
                            >
                              {item.isClosed
                                ? tApp(appLanguage, 'agenda_schedule_closed')
                                : 'Aperto'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.scheduleTimeChip}
                            onPress={() =>
                              !item.isClosed &&
                              setTimeConfigTarget({
                                scope: 'weekly',
                                weekday: item.weekday,
                                field: 'startTime',
                              })
                            }
                            activeOpacity={item.isClosed ? 1 : 0.9}
                            disabled={item.isClosed}
                          >
                            <Text style={styles.scheduleTimeChipText}>{item.startTime}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.scheduleTimeChip}
                            onPress={() =>
                              !item.isClosed &&
                              setTimeConfigTarget({
                                scope: 'weekly',
                                weekday: item.weekday,
                                field: 'endTime',
                              })
                            }
                            activeOpacity={item.isClosed ? 1 : 0.9}
                            disabled={item.isClosed}
                          >
                            <Text style={styles.scheduleTimeChipText}>{item.endTime}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}

                    <View style={styles.vacationForm}>
                      <View style={styles.vacationFormHeader}>
                        <Text style={styles.scheduleDayLabel}>
                          {tApp(appLanguage, 'agenda_vacation_range_title')}
                        </Text>
                        <Text style={styles.scheduleDayMeta}>
                          {tApp(appLanguage, 'agenda_vacation_range_hint')}
                        </Text>
                      </View>

                      <View style={styles.vacationFieldRow}>
                        <View style={styles.vacationFieldWrap}>
                          <Text style={styles.vacationFieldLabel}>
                            {tApp(appLanguage, 'agenda_vacation_start_label')}
                          </Text>
                          <TouchableOpacity
                            style={styles.vacationDateButton}
                            onPress={() => apriSelettoreFerie('start')}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.vacationDateButtonText,
                                !vacationStartInput && styles.vacationDateButtonPlaceholder,
                              ]}
                            >
                              {vacationStartInput
                                ? formatPickerButtonLabel(vacationStartInput)
                                : tApp(appLanguage, 'agenda_select_date')}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.vacationFieldWrap}>
                          <Text style={styles.vacationFieldLabel}>
                            {tApp(appLanguage, 'agenda_vacation_end_label')}
                          </Text>
                          <TouchableOpacity
                            style={styles.vacationDateButton}
                            onPress={() => apriSelettoreFerie('end')}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.vacationDateButtonText,
                                !vacationEndInput && styles.vacationDateButtonPlaceholder,
                              ]}
                            >
                              {vacationEndInput
                                ? formatPickerButtonLabel(vacationEndInput)
                                : tApp(appLanguage, 'agenda_select_date')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <ClearableTextInput
                        ref={vacationLabelInputRef}
                        style={styles.input}
                        placeholder={tApp(appLanguage, 'agenda_vacation_label_placeholder')}
                        placeholderTextColor="#8f8f8f"
                        value={vacationLabelInput}
                        onChangeText={setVacationLabelInput}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      <TouchableOpacity
                        style={[
                          styles.secondaryButtonWide,
                          !canAddVacationRange && styles.primaryButtonDisabled,
                        ]}
                        onPress={aggiungiFerie}
                        activeOpacity={0.9}
                        disabled={!canAddVacationRange}
                      >
                        <Text style={styles.secondaryButtonWideText}>
                          {tApp(appLanguage, 'agenda_add_vacation')}
                        </Text>
                      </TouchableOpacity>
                    </View>

                  {availabilitySettings.vacationRanges.map((item) => (
                    <View key={item.id} style={styles.vacationRow}>
                      <View style={styles.vacationInfo}>
                        <Text style={styles.vacationTitle}>
                          {item.label?.trim() || tApp(appLanguage, 'agenda_salon_vacation')}
                        </Text>
                        <Text style={styles.vacationMeta}>
                          {formatDateCompact(item.startDate)} - {formatDateCompact(item.endDate)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.vacationDeleteChip}
                        onPress={() => eliminaFerie(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.vacationDeleteText}>
                          {tApp(appLanguage, 'common_delete')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              ) : null}
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.searchTitle}>{tApp(appLanguage, 'agenda_search_title')}</Text>
              <Text style={styles.searchSubtitle}>Filtra per ora, cliente o servizio senza scorrere tutta l&apos;agenda.</Text>

              <ClearableTextInput
                ref={agendaSearchInputRef}
                style={[styles.input, styles.centeredInput]}
                placeholder={tApp(appLanguage, 'agenda_search_placeholder')}
                placeholderTextColor="#8f8f8f"
                value={ricerca}
                onChangeText={setRicerca}
                onFocus={() => setCampoAttivo('ricerca')}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {campoAttivo === 'ricerca' && suggerimentiRicerca.length > 0 ? (
                <View style={styles.suggestionBox}>
                  {suggerimentiRicerca.map((item) => (
                    <TouchableOpacity
                      key={`ricerca-${item.id}`}
                      style={styles.suggestionItem}
                      onPress={() => {
                        setRicerca(item.cliente);
                        setCampoAttivo(null);
                      }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.suggestionText}>
                        {item.ora} · {item.cliente} · {item.servizio}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.agendaExplorerCard}>
              <View style={styles.agendaExplorerHeader}>
                <Text style={styles.agendaExplorerEyebrow}>Elenco agenda</Text>
                <Text style={styles.agendaExplorerTitle}>Vista rapida per giorno</Text>
                <Text style={styles.agendaExplorerText}>
                  Oggi, poi i prossimi giorni in ordine data. Tocca una riga per aprire subito
                  la giornata.
                </Text>
              </View>

              <View style={styles.agendaQuickList}>
                {agendaQuickRows.map((row) => {
                  const selected = agendaView === row.view && giornoEspanso === row.date;
                  const rowSections =
                    row.view === 'today'
                      ? sezioniAgendaOggi
                      : row.view === 'upcoming'
                        ? sezioniAgendaProssime
                        : sezioniAgendaRecenti;
                  const rowItems = rowSections.find((section) => section.date === row.date)?.items ?? [];

                  return (
                    <View key={row.key} style={styles.agendaQuickRowBlock}>
                      <TouchableOpacity
                        style={[
                          styles.agendaQuickRow,
                          selected && styles.agendaQuickRowActive,
                        ]}
                        onPress={() => {
                          setAgendaView(row.view);
                          setGiornoEspanso((current) =>
                            current === row.date && agendaView === row.view ? '' : row.date
                          );
                        }}
                        activeOpacity={0.9}
                      >
                        <View style={styles.agendaQuickRowTextWrap}>
                          <Text
                            style={[
                              styles.agendaQuickRowTitle,
                              selected && styles.agendaQuickRowTitleActive,
                            ]}
                          >
                            {row.title}
                          </Text>
                          <Text
                            style={[
                              styles.agendaQuickRowMeta,
                              selected && styles.agendaQuickRowMetaActive,
                            ]}
                            numberOfLines={1}
                          >
                            {row.note}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.agendaQuickRowArrow,
                            selected && styles.agendaQuickRowTitleActive,
                          ]}
                        >
                          {selected ? '⌃' : '⌄'}
                        </Text>
                      </TouchableOpacity>

                      {selected ? (
                        <View style={styles.agendaQuickExpandPanel}>
                          {rowItems.length > 0 ? (
                            rowItems.map((appointment) => (
                              <View key={appointment.id} style={styles.agendaQuickAppointmentRow}>
                                <Text style={styles.agendaQuickAppointmentTime}>{appointment.ora}</Text>
                                <View style={styles.agendaQuickAppointmentTextWrap}>
                                  <Text
                                    style={styles.agendaQuickAppointmentClient}
                                    numberOfLines={1}
                                  >
                                    {appointment.cliente}
                                  </Text>
                                  <Text
                                    style={styles.agendaQuickAppointmentService}
                                    numberOfLines={1}
                                  >
                                    {appointment.servizio}
                                    {appointment.operatoreNome
                                      ? ` · ${appointment.operatoreNome}`
                                      : ''}
                                  </Text>
                                </View>
                                <View style={styles.agendaQuickAppointmentSideInfo}>
                                  <Text style={styles.agendaQuickAppointmentSideTop}>
                                    {getAppointmentEndTime(appointment)}
                                  </Text>
                                  <Text style={styles.agendaQuickAppointmentSideBottom}>
                                    € {appointment.prezzo.toFixed(0)}
                                  </Text>
                                </View>
                              </View>
                            ))
                          ) : (
                            <Text style={styles.agendaQuickEmptyText}>Nessun appuntamento per questo giorno</Text>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        }
        renderItem={() => null}
      />

      <Modal
        visible={showCalendarModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalendarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModalCard}>
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={[
                  styles.calendarNavButton,
                  !canGoToPreviousMonth && styles.calendarNavButtonDisabled,
                ]}
                onPress={() => {
                  if (!canGoToPreviousMonth) return;
                  setCalendarMonth(addMonthsToIso(calendarMonth, -1));
                }}
                activeOpacity={0.9}
                disabled={!canGoToPreviousMonth}
              >
                <Text
                  style={[
                    styles.calendarNavButtonText,
                    !canGoToPreviousMonth && styles.calendarNavButtonTextDisabled,
                  ]}
                >
                  ‹
                </Text>
              </TouchableOpacity>

              <Text style={styles.calendarTitle}>{meseCalendarioLabel}</Text>

              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth(addMonthsToIso(calendarMonth, 1))}
                activeOpacity={0.9}
              >
                <Text style={styles.calendarNavButtonText}>›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {getLocalizedShortWeekdays(appLanguage).map((day) => (
                <Text key={day} style={styles.calendarWeekLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarioMese.map((day) => {
                const selected = day.value === data;
                const metrics = day.value ? getCalendarDayMetrics(day.value) : null;
                const closed = metrics?.isClosed ?? false;
                const fullyBooked = metrics?.fullyBooked ?? false;
                const hasLunchBreak = metrics?.hasLunchBreak ?? false;
                const occupied = (metrics?.appointmentsCount ?? 0) > 0;
                const available = (metrics?.availableSlots ?? 0) > 0;

                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.calendarDayCell,
                      selected && styles.calendarDayCellActive,
                      day.isDisabled && styles.calendarDayCellDisabled,
                      closed && !selected && styles.calendarDayCellClosed,
                      occupied && !selected && !closed && !fullyBooked && styles.calendarDayCellOccupied,
                      available && !selected && !closed && !occupied && styles.calendarDayCellAvailable,
                      hasLunchBreak && !selected && !closed && styles.calendarDayCellLunch,
                      fullyBooked && !selected && styles.calendarDayCellFull,
                      !day.isCurrentMonth && styles.calendarDayCellGhost,
                    ]}
                    onPress={() => {
                      if (!day.value || day.isDisabled || closed || fullyBooked) return;
                      handleSelectDate(day.value);
                      setShowCalendarModal(false);
                    }}
                    onLongPress={() => {
                      if (!day.value || day.isDisabled) return;
                      showCalendarDayDetails(day.value);
                    }}
                    activeOpacity={day.value && !day.isDisabled ? 0.9 : 1}
                    disabled={!day.value || day.isDisabled}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        selected && styles.calendarDayTextActive,
                        day.isDisabled && styles.calendarDayTextDisabled,
                        closed && !selected && styles.calendarDayTextClosed,
                        occupied && !selected && !closed && !fullyBooked && styles.calendarDayTextOccupied,
                        available && !selected && !closed && !occupied && styles.calendarDayTextAvailable,
                        hasLunchBreak && !selected && !closed && styles.calendarDayTextLunch,
                        fullyBooked && !selected && styles.calendarDayTextFull,
                      ]}
                    >
                      {day.label}
                    </Text>

                    {hasLunchBreak && !selected && !closed ? <View style={styles.calendarDayLunchDot} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.calendarFooterText}>
              {tApp(appLanguage, 'agenda_calendar_hint')} {'\n'}Tieni premuto un giorno per vedere i dettagli.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={() => setShowCalendarModal(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.modalSecondaryButtonText}>
                  {tApp(appLanguage, 'common_close')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalPrimaryButton}
                onPress={() => {
                  setCalendarMonth(todayDate);
                  handleSelectDate(todayDate);
                  setShowCalendarModal(false);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.modalPrimaryButtonText}>{tApp(appLanguage, 'common_today')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSlotIntervalPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSlotIntervalPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.timeConfigModalCard}>
            <View style={styles.timeConfigHeaderRow}>
              <Text style={styles.calendarTitle}>{tApp(appLanguage, 'agenda_slot_interval_title')}</Text>
              <TouchableOpacity
                style={styles.timeConfigCloseButton}
                onPress={() => setShowSlotIntervalPicker(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.timeConfigCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHelperText}>
              Ogni cambio aggiorna automaticamente gli orari disponibili in agenda e frontend.
            </Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.timeConfigList}
            >
              {SLOT_INTERVAL_OPTIONS.map((option) => {
                const selected = availabilitySettings.slotIntervalMinutes === option;

                return (
                  <TouchableOpacity
                    key={`slot-interval-option-${option}`}
                    style={[
                      styles.timeConfigOption,
                      selected && styles.timeConfigOptionActive,
                    ]}
                    onPress={() => {
                      if (selected) {
                        setShowSlotIntervalPicker(false);
                        return;
                      }
                      applySlotIntervalChange(option);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.timeConfigOptionText,
                        selected && styles.timeConfigOptionTextActive,
                      ]}
                    >
                      {formatSlotInterval(option)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <NativeTimePickerModal
        visible={!!timeConfigTarget}
        title={
          timeConfigTarget?.field === 'startTime'
            ? tApp(appLanguage, 'agenda_time_config_open')
            : tApp(appLanguage, 'agenda_time_config_close')
        }
        initialValue={
          timeConfigTarget
            ? timeConfigTarget.scope === 'lunch'
              ? timeConfigTarget.field === 'startTime'
                ? availabilitySettings.lunchBreakStart
                : availabilitySettings.lunchBreakEnd
              : availabilitySettings.weeklySchedule.find(
                  (item) => item.weekday === timeConfigTarget.weekday
                )?.[timeConfigTarget.field]
            : undefined
        }
        onClose={() => setTimeConfigTarget(null)}
        onConfirm={(value) => {
          if (!timeConfigTarget) return;
          updateWeeklyDayTime(timeConfigTarget, value);
        }}
        minuteStep={15}
        gridMinuteStep={1}
      />

      <NativeDatePickerModal
        visible={!!vacationPickerTarget}
        title={
          vacationPickerTarget === 'start'
            ? tApp(appLanguage, 'agenda_vacation_picker_start')
            : tApp(appLanguage, 'agenda_vacation_picker_end')
        }
        initialValue={
          vacationPickerTarget === 'start'
            ? vacationStartInput || todayDate
            : vacationEndInput || vacationStartInput || todayDate
        }
        onClose={() => setVacationPickerTarget(null)}
        onConfirm={(value) => {
          if (vacationPickerTarget === 'start') {
            setVacationStartInput(value);
            if (vacationEndInput && vacationEndInput < value) {
              setVacationEndInput(value);
            }
          } else if (vacationPickerTarget === 'end') {
            setVacationEndInput(value);
            if (vacationStartInput && vacationStartInput > value) {
              setVacationStartInput(value);
            }
          }
          setVacationPickerTarget(null);
        }}
      />

      <NumberPickerModal
        visible={showSlotIntervalPicker}
        title={tApp(appLanguage, 'agenda_slot_interval_title')}
        initialValue={availabilitySettings.slotIntervalMinutes}
        onClose={() => setShowSlotIntervalPicker(false)}
        onConfirm={(value) => applySlotIntervalChange(Number(value))}
        min={15}
        max={300}
        step={15}
        gridStep={1}
        suffix=" min"
        presets={SLOT_INTERVAL_OPTIONS}
      />

      <Modal
        visible={showQuickClientModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowQuickClientModal(false);
          resetQuickClientForm();
        }}
      >
        <View
          style={[
            styles.quickClientModalOverlay,
            {
              paddingTop: isQuickServiceKeyboardOpen
                ? Math.max(insets.top + 8, 20)
                : Math.max(insets.top + 18, 72),
              paddingBottom: Math.max(insets.bottom + 10, 16),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => {
              setShowQuickClientModal(false);
              resetQuickClientForm();
              Keyboard.dismiss();
            }}
          />
          <KeyboardAvoidingView
            style={styles.quickClientModalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Math.max(insets.bottom, 8)}
          >
            <View
              style={[
                styles.quickClientModalCard,
                isQuickServiceKeyboardOpen && styles.quickServiceModalCardExpanded,
              ]}
            >
              <View style={styles.quickClientModalHandle} />

              <View style={styles.quickClientModalHeader}>
                <View style={styles.quickClientModalTitleWrap}>
                  <Text style={styles.calendarTitle}>Nuovo cliente</Text>
                  <Text style={styles.modalHelperText}>
                    Inserisci gli stessi dati della schermata Clienti. Il contatto sarà salvato in rubrica.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.timeConfigCloseButton}
                  onPress={() => {
                    setShowQuickClientModal(false);
                    resetQuickClientForm();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.timeConfigCloseButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.quickClientModalScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.quickClientForm}
                keyboardDismissMode="none"
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  ref={quickClientNameInputRef}
                  style={styles.input}
                  placeholder="Nome e cognome*"
                  placeholderTextColor="#8f8f8f"
                  value={quickClientNome}
                  onChangeText={setQuickClientNome}
                  returnKeyType="next"
                  onSubmitEditing={() => quickClientPhoneInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickClientPhoneInputRef}
                  style={styles.input}
                  placeholder="Telefono*"
                  placeholderTextColor="#8f8f8f"
                  value={quickClientTelefono}
                  onChangeText={setQuickClientTelefono}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => quickClientEmailInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickClientEmailInputRef}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="#8f8f8f"
                  value={quickClientEmail}
                  onChangeText={setQuickClientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => quickClientInstagramInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickClientInstagramInputRef}
                  style={styles.input}
                  placeholder="Instagram"
                  placeholderTextColor="#8f8f8f"
                  value={quickClientInstagram}
                  onChangeText={setQuickClientInstagram}
                  autoCapitalize="none"
                  returnKeyType="next"
                  onSubmitEditing={() => quickClientBirthdayInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickClientBirthdayInputRef}
                  style={styles.input}
                  placeholder="Compleanno"
                  placeholderTextColor="#8f8f8f"
                  value={quickClientBirthday}
                  onChangeText={setQuickClientBirthday}
                  returnKeyType="next"
                  onSubmitEditing={() => quickClientBirthdayInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </ScrollView>

              <View style={styles.quickClientModalFooter}>
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.modalSecondaryButton}
                    onPress={() => {
                      setShowQuickClientModal(false);
                      resetQuickClientForm();
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalSecondaryButtonText}>{tApp(appLanguage, 'common_cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPrimaryButton}
                    onPress={saveQuickClientFromAgenda}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalPrimaryButtonText}>Salva cliente</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={showQuickServiceModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowQuickServiceModal(false);
          resetQuickServiceForm();
        }}
      >
        <View
          style={[
            styles.quickClientModalOverlay,
            {
              paddingTop: isQuickServiceKeyboardOpen
                ? Math.max(insets.top + 8, 20)
                : Math.max(insets.top + 18, 72),
              paddingBottom: Math.max(insets.bottom + 10, 16),
            },
          ]}
        >
          <TouchableOpacity
            style={styles.modalDismissArea}
            activeOpacity={1}
            onPress={() => {
              setShowQuickServiceModal(false);
              resetQuickServiceForm();
              Keyboard.dismiss();
            }}
          />
          <KeyboardAvoidingView
            style={styles.quickClientModalKeyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Math.max(insets.bottom, 8)}
          >
            <View
              style={[
                styles.quickClientModalCard,
                isQuickServiceKeyboardOpen && styles.quickServiceModalCardExpanded,
              ]}
            >
              <View style={styles.quickClientModalHandle} />

              <View style={styles.quickClientModalHeader}>
                <View style={styles.quickClientModalTitleWrap}>
                  <Text style={styles.calendarTitle}>Nuovo servizio</Text>
                  <Text style={styles.modalHelperText}>
                    Inserisci gli stessi moduli della scheda Servizi. Il servizio sarà subito disponibile in agenda.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.timeConfigCloseButton}
                  onPress={() => {
                    setShowQuickServiceModal(false);
                    resetQuickServiceForm();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.timeConfigCloseButtonText}>×</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.quickClientModalScroll}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.quickClientForm}
                keyboardDismissMode="none"
                keyboardShouldPersistTaps="handled"
              >
                <TextInput
                  ref={quickServiceNameInputRef}
                  style={styles.input}
                  placeholder="Nome servizio*"
                  placeholderTextColor="#8f8f8f"
                  value={quickServiceNome}
                  onChangeText={setQuickServiceNome}
                  returnKeyType="next"
                  onSubmitEditing={() => quickServicePriceInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickServicePriceInputRef}
                  style={styles.input}
                  placeholder="Prezzo*"
                  placeholderTextColor="#8f8f8f"
                  value={quickServicePrezzo}
                  onChangeText={setQuickServicePrezzo}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => quickServiceOriginalPriceInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickServiceOriginalPriceInputRef}
                  style={styles.input}
                  placeholder="Prezzo pieno"
                  placeholderTextColor="#8f8f8f"
                  value={quickServicePrezzoOriginale}
                  onChangeText={setQuickServicePrezzoOriginale}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => quickServiceDurationInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickServiceDurationInputRef}
                  style={styles.input}
                  placeholder="Durata min*"
                  placeholderTextColor="#8f8f8f"
                  value={quickServiceDurata}
                  onChangeText={setQuickServiceDurata}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => quickServiceRoleInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
                <TextInput
                  ref={quickServiceRoleInputRef}
                  style={styles.input}
                  placeholder="Mestiere richiesto"
                  placeholderTextColor="#8f8f8f"
                  value={quickServiceMestiere}
                  onChangeText={setQuickServiceMestiere}
                  returnKeyType="done"
                  onSubmitEditing={() => quickServiceRoleInputRef.current?.focus()}
                  blurOnSubmit={false}
                />

                {quickServiceRoleOptions.length > 0 ? (
                  <View style={styles.quickServiceRolesWrap}>
                    {quickServiceRoleOptions.map((role) => {
                      const selected = role.toLowerCase() === quickServiceMestiere.trim().toLowerCase();
                      return (
                        <TouchableOpacity
                          key={`agenda-quick-service-role-${role}`}
                          style={[styles.quickServiceRoleChip, selected && styles.quickServiceRoleChipActive]}
                          onPress={() => setQuickServiceMestiere(role)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.quickServiceRoleChipText,
                              selected && styles.quickServiceRoleChipTextActive,
                            ]}
                          >
                            {role}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.quickClientModalFooter}>
                <View style={styles.modalActionsRow}>
                  <TouchableOpacity
                    style={styles.modalSecondaryButton}
                    onPress={() => {
                      setShowQuickServiceModal(false);
                      resetQuickServiceForm();
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalSecondaryButtonText}>{tApp(appLanguage, 'common_cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalPrimaryButton}
                    onPress={saveQuickServiceFromAgenda}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.modalPrimaryButtonText}>Salva servizio</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 140,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8a8a8a',
    marginBottom: 8,
  },
  heroCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 0,
    paddingBottom: 10,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  screenHeaderRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
    gap: 4,
  },
  screenBrandChip: {
    maxWidth: '88%',
    marginTop: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  screenBrandChipText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#52627a',
    textAlign: 'center',
  },
  heroSubtitle: {
    maxWidth: 320,
    fontSize: 13,
    color: '#6f7b8d',
    lineHeight: 19,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center',
  },
  bookingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: '#edf2f7',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  bookingCardPrimary: {
    marginBottom: 12,
  },
  bookingCardSchedule: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    rowGap: 8,
    marginBottom: 12,
  },
  bookingHeaderLeft: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 220,
    marginRight: 0,
  },
  bookingHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  bookingHeading: {
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -0.3,
  },
  bookingSectionDivider: {
    height: 1,
    marginHorizontal: 10,
    marginTop: -2,
    marginBottom: 10,
    backgroundColor: '#e7edf4',
  },
  bookingBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  bookingBadgeContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookingBadgeInline: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bookingBadgeContentInline: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  monthTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bookingBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    color: '#4b5563',
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  bookingBadgeTextInline: {
    fontSize: 11,
    lineHeight: 13,
    textAlign: 'left',
  },
  sectionBlock: {
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionBlockLast: {
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  daySectionBlockCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  dayPickerHeaderBlock: {
    marginBottom: 10,
  },
  serviceSectionBlockCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  operatorSectionBlockCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  timeSectionBlockCompact: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  sectionBlockLocked: {
    opacity: 0.82,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  daySectionTitleRow: {
    marginBottom: 10,
  },
  dayPickerHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
  },
  dayPickerHeaderTitle: {
    flexShrink: 1,
  },
  dayPickerBadge: {
    marginLeft: 'auto',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderColor: '#e7edf4',
  },
  dayPickerBadgeText: {
    fontSize: 9,
    lineHeight: 11,
    color: '#64748b',
    textAlign: 'left',
  },
  serviceSectionTitleRow: {
    marginBottom: 10,
  },
  operatorSectionTitleRow: {
    marginBottom: 10,
  },
  timeSectionTitleRow: {
    marginBottom: 10,
  },
  inlineAddClientButton: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#ffffff',
    marginRight: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  inlineAddClientButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  inlineAddClientButtonTextDisabled: {
    color: '#94a3b8',
  },
  stepPill: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    color: '#ffffff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 13,
    fontWeight: '800',
    overflow: 'hidden',
    marginRight: 10,
    paddingTop: 5,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  sectionHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'capitalize',
    textAlign: 'left',
  },
  daySectionHintCompact: {
    marginTop: 8,
    fontSize: 14,
    color: '#111111',
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'center',
    letterSpacing: -0.2,
  },
  lockedSectionText: {
    fontSize: 12,
    color: '#7a8597',
    fontWeight: '700',
    lineHeight: 18,
    marginBottom: 10,
    textAlign: 'left',
  },
  dayPickerRow: {
    paddingRight: 2,
  },
  dayPickerWrap: {
    width: '100%',
  },
  dayCardWrap: {
    marginRight: 6,
  },
  dayCard: {
    width: 68,
    minHeight: 88,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingVertical: 7,
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
    color: '#6b7280',
    textAlign: 'center',
  },
  dayStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 44,
    maxWidth: 44,
    alignItems: 'center',
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
    fontSize: 7,
    fontWeight: '800',
    color: '#be123c',
    letterSpacing: 0.1,
    textAlign: 'center',
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
    color: '#6b7280',
    textTransform: 'capitalize',
    marginBottom: 6,
    textAlign: 'center',
  },
  dayCardTextActive: {
    color: '#ffffff',
  },
  dayCardTextClosed: {
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
    color: '#475569',
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
    overflow: 'visible',
  },
  timeGridCompact: {
    marginHorizontal: -3,
  },
  timeChip: {
    width: '22%',
    marginHorizontal: '1.5%',
    marginBottom: 10,
    backgroundColor: '#f5f5f4',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ececec',
    position: 'relative',
    overflow: 'visible',
  },
  timeChipCompact: {
    marginBottom: 8,
    borderRadius: 14,
    paddingVertical: 10,
  },
  timeChipActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  timeChipDisabled: {
    backgroundColor: '#fde7e7',
    borderColor: '#f58b8b',
  },
  timeChipWarning: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
  },
  timeChipUnavailable: {
    backgroundColor: '#374151',
    borderColor: '#374151',
  },
  timeChipLocked: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  timeChipPreviewActive: {
    zIndex: 30,
    elevation: 12,
  },
  slotMiniBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.24)',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 42,
    maxWidth: 48,
    alignItems: 'center',
  },
  slotMiniBadgeCompact: {
    top: 4,
    right: 4,
    minWidth: 38,
    maxWidth: 44,
  },
  slotMiniBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#1d4ed8',
    letterSpacing: 0.1,
  },
  slotMiniBadgeAvailable: {
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    borderColor: 'rgba(16, 185, 129, 0.24)',
  },
  slotMiniBadgeBusy: {
    backgroundColor: 'rgba(71, 85, 105, 0.12)',
    borderColor: 'rgba(100, 116, 139, 0.22)',
  },
  slotMiniBadgeTextAvailable: {
    color: '#047857',
  },
  slotMiniBadgeTextBusy: {
    color: '#475569',
  },
  timeChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
  },
  timeChipTextCompact: {
    fontSize: 13,
  },
  timeChipTextActive: {
    color: '#166534',
  },
  timeChipTextDisabled: {
    color: '#b42318',
  },
  timeChipTextWarning: {
    color: '#a16207',
  },
  timeChipTextUnavailable: {
    color: '#f9fafb',
  },
  timeChipTextLocked: {
    color: '#9ca3af',
  },
  slotPreviewBubble: {
    position: 'absolute',
    left: '50%',
    bottom: '100%',
    transform: [{ translateX: -80 }],
    width: 160,
    backgroundColor: '#1f2937',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 40,
    marginBottom: 30,
  },
  slotPreviewItem: {
    width: '100%',
  },
  slotPreviewItemDivider: {
    marginTop: 7,
    paddingTop: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.18)',
  },
  slotPreviewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#f9fafb',
    marginBottom: 4,
  },
  slotPreviewText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d1d5db',
    lineHeight: 17,
  },
  slotPreviewArrow: {
    position: 'absolute',
    bottom: -12,
    left: '50%',
    marginLeft: -10,
    width: 20,
    height: 20,
    backgroundColor: '#1f2937',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#374151',
    transform: [{ rotate: '45deg' }],
  },
  errorText: {
    fontSize: 13,
    color: '#a16207',
    fontWeight: '700',
    marginTop: 4,
  },
  serviceRow: {
    paddingRight: 6,
  },
  serviceRowCompact: {
    paddingRight: 2,
  },
  operatorSelectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -4,
  },
  operatorSelectionRowCompact: {
    marginHorizontal: -3,
  },
  operatorSelectionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 4,
    marginBottom: 8,
    minWidth: 122,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorSelectionCardCompact: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 3,
    marginBottom: 6,
    minWidth: 114,
  },
  operatorSelectionCardActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  operatorSelectionName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  operatorSelectionNameCompact: {
    fontSize: 13,
    marginBottom: 3,
  },
  operatorSelectionNameActive: {
    color: '#ffffff',
  },
  operatorSelectionRole: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  operatorSelectionRoleCompact: {
    fontSize: 11,
  },
  operatorSelectionRoleActive: {
    color: '#dbe4ec',
  },
  serviceCard: {
    width: 126,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 12,
    marginRight: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceCardCompact: {
    width: 118,
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 10,
    marginRight: 6,
  },
  serviceCardActive: {
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  serviceCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  serviceCardTitleCompact: {
    fontSize: 12,
    marginBottom: 4,
  },
  serviceCardPrice: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  serviceCardPriceCompact: {
    fontSize: 12,
    marginBottom: 3,
  },
  serviceCardDuration: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  serviceCardDurationCompact: {
    fontSize: 10,
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111111',
  },
  centeredInput: {
    textAlign: 'center',
  },
  suggestionBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 18,
    marginTop: 8,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
  },
  suggestionText: {
    fontSize: 14,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  quickClientsRow: {
    paddingTop: 10,
    paddingRight: 6,
  },
  quickClientChip: {
    backgroundColor: '#f1f0ec',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  quickClientChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
  },
  warningInlineCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warningInlineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#9a3412',
    marginBottom: 4,
    textAlign: 'center',
  },
  warningInlineText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#9a3412',
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#f5f5f4',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 14,
    color: '#555555',
    lineHeight: 21,
    textAlign: 'center',
  },
  summaryWarningText: {
    fontSize: 13,
    color: '#9a3412',
    lineHeight: 19,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  searchCard: {
    backgroundColor: '#f7fbff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    alignItems: 'stretch',
  },
  searchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'left',
  },
  searchSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'left',
  },
  agendaExplorerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  agendaExplorerHeader: {
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  agendaExplorerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.3,
    textAlign: 'left',
    marginBottom: 3,
  },
  agendaExplorerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'left',
    marginBottom: 4,
  },
  agendaExplorerText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'left',
  },
  agendaQuickList: {
    gap: 7,
  },
  agendaQuickRowBlock: {
    gap: 6,
  },
  agendaQuickRow: {
    backgroundColor: '#f8fbff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  agendaQuickRowActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  agendaQuickRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  agendaQuickRowTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 2,
  },
  agendaQuickRowTitleActive: {
    color: '#ffffff',
  },
  agendaQuickRowMeta: {
    fontSize: 12,
    lineHeight: 16,
    color: '#475569',
    fontWeight: '600',
  },
  agendaQuickRowMetaActive: {
    color: '#e2e8f0',
  },
  agendaQuickRowArrow: {
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '900',
    color: '#94a3b8',
  },
  agendaQuickExpandPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  agendaQuickAppointmentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#e5edf5',
  },
  agendaQuickAppointmentTime: {
    width: 40,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  agendaQuickAppointmentTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  agendaQuickAppointmentSideInfo: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 54,
    paddingLeft: 4,
  },
  agendaQuickAppointmentSideTop: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 1,
  },
  agendaQuickAppointmentSideBottom: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  agendaQuickAppointmentClient: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 1,
  },
  agendaQuickAppointmentService: {
    fontSize: 10,
    lineHeight: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  agendaQuickEmptyText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  weeklyPlannerToggle: {
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  weeklyPlannerToggleExpanded: {
    marginBottom: 8,
  },
  weeklyPlannerToggleIconSlot: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    flexShrink: 0,
  },
  weeklyPlannerToggleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  weeklyPlannerToggleChevronSlot: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    flexShrink: 0,
  },
  weeklyPlannerCard: {
    marginTop: 4,
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  weeklyPlannerHeader: {
    marginBottom: 6,
  },
  weeklyPlannerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
  },
  weeklyPlannerNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weeklyPlannerNavButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyPlannerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  weeklyPlannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 2,
  },
  weeklyPlannerSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  weeklyPlannerList: {
    gap: 0,
  },
  weeklyPlannerDaySection: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 1,
    paddingVertical: 6,
  },
  weeklyPlannerDayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  weeklyPlannerDayBadge: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    width: 42,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  weeklyPlannerDayBadgeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
  },
  weeklyPlannerDayBadgeNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    lineHeight: 18,
  },
  weeklyPlannerDayTextWrap: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  weeklyPlannerDayTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 1,
  },
  weeklyPlannerDayMeta: {
    fontSize: 10,
    lineHeight: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  weeklyPlannerBookingList: {
    marginTop: 4,
    marginLeft: 50,
  },
  weeklyPlannerBookingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  weeklyPlannerBookingTime: {
    width: 36,
    fontSize: 11,
    fontWeight: '800',
    color: '#111111',
    lineHeight: 15,
  },
  weeklyPlannerBookingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  weeklyPlannerBookingClient: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 2,
    flex: 1,
    minWidth: 0,
  },
  weeklyPlannerInlineActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 5,
    width: '100%',
  },
  weeklyPlannerMoveButton: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 84,
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
  },
  weeklyPlannerMoveButtonText: {
    color: '#1e3a8a',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  weeklyPlannerDeleteButton: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 84,
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
  },
  weeklyPlannerDeleteButtonText: {
    color: '#b91c1c',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  weeklyPlannerBookingService: {
    fontSize: 10,
    lineHeight: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  weeklyPlannerDayEmpty: {
    minHeight: 8,
    marginLeft: 50,
    marginTop: 3,
  },
  weekOverviewCard: {
    marginTop: 14,
    backgroundColor: '#f8fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  weekOverviewHeader: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  weekOverviewEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'left',
    marginBottom: 4,
  },
  weekOverviewTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'left',
    marginBottom: 4,
  },
  weekOverviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'left',
  },
  weekOverviewSummary: {
    marginTop: 4,
  },
  weekOverviewSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  weekOverviewSummaryText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
  },
  weekListSection: {
    width: '100%',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
  },
  weekListSectionActive: {
    backgroundColor: '#fcfdff',
  },
  weekListHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  weekListDayBadge: {
    width: 56,
    minHeight: 68,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  weekListDayBadgeActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  weekListDayName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'capitalize',
    marginBottom: 4,
  },
  weekListDayNameActive: {
    color: '#cbd5e1',
  },
  weekListDayNumber: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 1,
  },
  weekListDayNumberActive: {
    color: '#ffffff',
  },
  weekListHeaderTextWrap: {
    flex: 1,
  },
  weekListTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  weekListSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    fontWeight: '700',
  },
  weekListContent: {
    gap: 8,
  },
  weekListBookingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  weekListBookingTime: {
    width: 48,
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    lineHeight: 20,
  },
  weekListBookingTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  weekListBookingClient: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 2,
  },
  weekListBookingService: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
    fontWeight: '600',
  },
  weekListEmpty: {
    paddingVertical: 8,
    paddingLeft: 66,
  },
  weekListEmptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontWeight: '700',
  },
  weekListDivider: {
    height: 1,
    backgroundColor: '#dbe4ec',
    marginTop: 10,
  },
  sectionToggleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  sectionToggleTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingRight: 12,
  },
  utilityToggleButton: {
    alignItems: 'center',
  },
  sectionChevronBadge: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  dayHeader: {
    marginBottom: 10,
  },
  dayHeaderLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  dayHeaderEyebrow: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '800',
    marginBottom: 3,
    textAlign: 'left',
    letterSpacing: 0.3,
  },
  dayHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
    textAlign: 'left',
  },
  dayHeaderCount: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
  dayHeaderCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  daySectionCardCompact: {
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  daySectionToggleButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
  },
  agendaSectionHeroButton: {
    backgroundColor: '#f7fbff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  daySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  daySectionHeaderLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingRight: 12,
  },
  daySectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    right: 'auto',
    top: 'auto',
  },
  daySectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    textTransform: 'capitalize',
    marginBottom: 4,
    textAlign: 'left',
  },
  daySectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'left',
  },
  daySectionCount: {
    minWidth: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  daySectionCountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
  },
  daySectionChevron: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginLeft: 10,
    lineHeight: 20,
  },
  daySectionContent: {
    marginTop: 10,
  },
  daySectionEmpty: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  daySectionEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  daySectionEmptyText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    textAlign: 'center',
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  timelineCardCompact: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  timelineTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  timelineTopCompact: {
    marginBottom: 7,
  },
  timelineHourPill: {
    backgroundColor: '#111111',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    marginRight: 10,
  },
  timelineHourText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  timelineMain: {
    flex: 1,
  },
  timelineTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  timelineServicePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    maxWidth: '46%',
    alignSelf: 'flex-start',
  },
  timelineServicePillText: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  timelineClient: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
  },
  timelineClientCompact: {
    fontSize: 16,
  },
  timelineMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  timelineOperator: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'left',
  },
  timelineOperatorCompact: {
    fontSize: 11,
  },
  timelineMeta: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'left',
  },
  timelineMetaCompact: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    justifyContent: 'flex-start',
    gap: 6,
  },
  statusRowCompact: {
    marginBottom: 7,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginRight: 0,
    marginBottom: 0,
  },
  statusBadgePending: {
    backgroundColor: '#f1f1f1',
  },
  statusBadgeDone: {
    backgroundColor: '#e3e3e3',
  },
  statusBadgeCancelled: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  statusBadgeTextPending: {
    color: '#444444',
  },
  statusBadgeTextDone: {
    color: '#666666',
  },
  statusBadgeTextCancelled: {
    color: '#991b1b',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionsRowCompact: {
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#ececec',
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 0,
  },
  secondaryButtonDisabled: {
    backgroundColor: '#dddddd',
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButtonTextDisabled: {
    color: '#666666',
  },
  secondaryButtonWide: {
    backgroundColor: '#ececec',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonWideText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  darkButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 0,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  darkButtonDisabled: {
    backgroundColor: '#dddddd',
  },
  darkButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  darkButtonTextDisabled: {
    color: '#666666',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 21,
    textAlign: 'center',
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  bookingCardWide: {
    maxWidth: 980,
    alignSelf: 'center',
  },
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  desktopTopGridStack: {
    flexDirection: 'column',
    marginBottom: 0,
  },
  desktopBookingPane: {
    flex: 1.2,
    marginRight: 16,
    marginBottom: 0,
  },
  desktopSideColumn: {
    flex: 0.72,
  },
  desktopSideColumnStack: {
    flex: undefined,
    width: '100%',
  },
  searchCardWide: {
    maxWidth: undefined,
    alignSelf: 'stretch',
  },
  daySectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  daySectionCardShell: {
    width: '100%',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  scheduleDayInfo: {
    flex: 1,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  scheduleDayLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'left',
  },
  scheduleDayMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'left',
  },
  scheduleControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  scheduleToggleChip: {
    minWidth: 92,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleToggleChipOpen: {
    backgroundColor: '#dcfce7',
  },
  scheduleToggleChipClosed: {
    backgroundColor: '#fee2e2',
  },
  scheduleToggleText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  scheduleToggleTextOpen: {
    color: '#166534',
  },
  scheduleToggleTextClosed: {
    color: '#b91c1c',
  },
  scheduleTimeChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleTimeChipText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  scheduleSubsectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
    marginTop: 6,
    marginBottom: 8,
  },
  slotIntervalField: {
    marginTop: 10,
    width: '100%',
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  slotIntervalFieldText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  vacationForm: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  vacationFormHeader: {
    marginBottom: 12,
    alignItems: 'center',
  },
  vacationFieldRow: {
    flexDirection: 'row',
    marginHorizontal: -4,
    marginBottom: 10,
  },
  vacationFieldWrap: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  vacationFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 6,
    textAlign: 'center',
  },
  vacationDateButton: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    width: '100%',
    alignItems: 'center',
  },
  vacationDateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111111',
    textAlign: 'center',
  },
  vacationDateButtonPlaceholder: {
    color: '#8f8f8f',
  },
  lunchBreakCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 0,
    marginBottom: 12,
  },
  lunchBreakCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 8,
  },
  pastAppointmentsSection: {
    marginTop: 10,
    paddingBottom: 8,
  },
  emptyAgendaState: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 24,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    marginTop: 4,
  },
  emptyAgendaStateTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  emptyAgendaStateText: {
    fontSize: 11,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  vacationRow: {
    minHeight: 10,
    marginTop: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  vacationInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: 'center',
  },
  vacationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  vacationMeta: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '700',
    textAlign: 'center',
  },
  vacationDeleteChip: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  vacationDeleteText: {
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '800',
  },
  vacationPickerHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 12,
  },
  calendarModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
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
    marginTop: -4,
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
    marginBottom: 10,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#8a8a8a',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  calendarDayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    marginBottom: 6,
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
  calendarDayCellFull: {
    backgroundColor: '#374151',
    borderWidth: 1,
    borderColor: '#374151',
  },
  calendarDayCellOccupied: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  calendarDayCellAvailable: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  calendarDayCellLunch: {
    borderWidth: 1,
    borderColor: '#c4b5fd',
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
  calendarDayTextFull: {
    color: '#f9fafb',
  },
  calendarDayTextOccupied: {
    color: '#be123c',
  },
  calendarDayTextAvailable: {
    color: '#166534',
  },
  calendarDayTextLunch: {
    color: '#7c3aed',
  },
  calendarDayLunchDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 999,
    right: 6,
    top: 6,
    backgroundColor: '#7c3aed',
  },
  calendarFooterText: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 20,
    marginBottom: 16,
    fontWeight: '600',
  },
  timeConfigModalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
  },
  timeConfigHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timeConfigCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeConfigCloseButtonText: {
    fontSize: 24,
    lineHeight: 24,
    fontWeight: '500',
    color: '#374151',
    marginTop: -2,
  },
  timeConfigList: {
    paddingVertical: 8,
  },
  modalHelperText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'left',
    marginBottom: 6,
  },
  timeConfigOption: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  timeConfigOptionActive: {
    backgroundColor: '#111827',
  },
  timeConfigOptionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  timeConfigOptionTextActive: {
    color: '#ffffff',
  },
  modalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalSecondaryButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#2f2f2f',
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  modalDismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  quickClientModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 17, 0.35)',
    justifyContent: 'flex-end',
    paddingHorizontal: 8,
  },
  quickClientModalKeyboard: {
    justifyContent: 'flex-end',
  },
  quickClientModalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
    overflow: 'hidden',
  },
  quickServiceModalCardExpanded: {
    maxHeight: '96%',
  },
  quickClientModalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#d7dee7',
    marginBottom: 12,
  },
  quickClientModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  quickClientModalTitleWrap: {
    flex: 1,
    paddingTop: 2,
  },
  quickClientModalScroll: {
    flexGrow: 0,
  },
  quickClientForm: {
    gap: 6,
    paddingBottom: 16,
  },
  quickServiceRolesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  quickServiceRoleChip: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickServiceRoleChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  quickServiceRoleChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1f2937',
  },
  quickServiceRoleChipTextActive: {
    color: '#ffffff',
  },
  quickClientModalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#edf2f7',
    paddingTop: 12,
    paddingBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 17, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
