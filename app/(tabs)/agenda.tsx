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
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { NativeTimePickerModal } from '../../components/ui/native-time-picker-modal';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import {
    buildDisplayTimeSlots,
    buildTimeSlots,
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
const WEEK_PLANNER_ROW_HEIGHT = 54;
const WEEK_PLANNER_DAY_WIDTH = 122;
const WEEK_PLANNER_ROW_GAP = 8;

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

type AgendaView = 'today' | 'upcoming' | 'recent' | 'week';

type QuickSlotDraft = {
  date: string;
  time: string;
};

type WeekPlannerCellState = 'available' | 'occupied' | 'blocked' | 'outside';

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

const getStartOfWeekIso = (value: string) => {
  const date = parseIsoDate(value);
  const weekday = date.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + diff);
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

const buildWeekDates = (weekStart: string, appLanguage: AppLanguage): GiornoPicker[] =>
  Array.from({ length: 7 }, (_, index) => {
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
  const {
    appuntamenti,
    setAppuntamenti,
    clienti,
    setClienti,
    servizi,
    operatori,
    macchinari,
    setMacchinari,
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
  const [giornoEspanso, setGiornoEspanso] = useState(getTodayDateString());
  const [showCustomizeHoursExpanded, setShowCustomizeHoursExpanded] = useState(false);
  const [agendaView, setAgendaView] = useState<AgendaView>('today');
  const [slotPreviewTime, setSlotPreviewTime] = useState<string | null>(null);
  const [showOperatorListExpanded, setShowOperatorListExpanded] = useState(false);
  const [showMachineryListExpanded, setShowMachineryListExpanded] = useState(false);
  const [machineryNameInput, setMachineryNameInput] = useState('');
  const [machineryCategoryInput, setMachineryCategoryInput] = useState('');
  const [machineryNotesInput, setMachineryNotesInput] = useState('');
  const [quickSlotDraft, setQuickSlotDraft] = useState<QuickSlotDraft | null>(null);
  const [quickBookingServiceId, setQuickBookingServiceId] = useState('');
  const [quickBookingCustomerId, setQuickBookingCustomerId] = useState('');
  const [quickBookingOperatorId, setQuickBookingOperatorId] = useState('');
  const [showQuickCustomerComposer, setShowQuickCustomerComposer] = useState(false);
  const [quickCustomerNameInput, setQuickCustomerNameInput] = useState('');
  const [quickCustomerPhoneInput, setQuickCustomerPhoneInput] = useState('');
  const [quickCustomerEmailInput, setQuickCustomerEmailInput] = useState('');
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
  const vacationLabelInputRef = useRef<TextInput | null>(null);
  const agendaSearchInputRef = useRef<TextInput | null>(null);
  const dayPickerRef = useRef<ScrollView | null>(null);
  const [dayPickerWidth, setDayPickerWidth] = useState(0);
  const selectedDayAnim = useRef(new Animated.Value(0)).current;
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const todayDate = useMemo(() => getTodayDateString(), []);
  const displayTimeSlots = useMemo(
    () => buildDisplayTimeSlots(availabilitySettings, data),
    [availabilitySettings, data]
  );

  const closeAllSwipeables = useCallback(() => {
    Object.values(swipeableRefs.current).forEach((ref) => ref?.close());
  }, []);

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
        setShowOperatorListExpanded(false);
        setShowMachineryListExpanded(false);
        setQuickSlotDraft(null);
        setShowQuickCustomerComposer(false);
        setAgendaView('today');
        setSlotPreviewTime(null);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        dayPickerRef.current?.scrollTo({ x: 0, animated: false });
        closeAllSwipeables();
      };
    }, [closeActiveSuggestions, closeAllSwipeables])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setShowCustomizeHoursExpanded(false);
        setAgendaView('today');
      }
    });

    return () => subscription.remove();
  }, []);

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

  const weekStart = useMemo(() => getStartOfWeekIso(data), [data]);
  const weekDates = useMemo(() => buildWeekDates(weekStart, appLanguage), [appLanguage, weekStart]);
  const weekBaseSlotInterval = Math.max(15, availabilitySettings.slotIntervalMinutes || 30);
  const weekOpenDays = useMemo(
    () => availabilitySettings.weeklySchedule.filter((item) => !item.isClosed),
    [availabilitySettings.weeklySchedule]
  );
  const weekStartMinutes = useMemo(() => {
    if (weekOpenDays.length === 0) return timeToMinutes('09:00');
    return Math.min(...weekOpenDays.map((item) => timeToMinutes(item.startTime)));
  }, [weekOpenDays]);
  const weekEndMinutes = useMemo(() => {
    if (weekOpenDays.length === 0) return timeToMinutes('19:00');
    return Math.max(...weekOpenDays.map((item) => timeToMinutes(item.endTime)));
  }, [weekOpenDays]);
  const weekTimeSlots = useMemo(
    () => buildTimeSlots(minutesToTime(weekStartMinutes), minutesToTime(weekEndMinutes - weekBaseSlotInterval), weekBaseSlotInterval),
    [weekBaseSlotInterval, weekEndMinutes, weekStartMinutes]
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

  const getWeekAppointmentStartingAt = useCallback(
    (dateValue: string, slotTime: string) =>
      (appointmentsByDate[dateValue] ?? [])
        .slice()
        .sort((first, second) => first.ora.localeCompare(second.ora))
        .find((item) => item.ora === slotTime) ?? null,
    [appointmentsByDate]
  );

  const getWeekAppointmentBlockHeight = useCallback(
    (item: AppuntamentoItem) => {
      const durationMinutes =
        typeof item.durataMinuti === 'number' ? item.durataMinuti : getServiceDuration(item.servizio);
      const interval = Math.max(15, getSlotIntervalForDate(availabilitySettings, item.data ?? data));
      const span = Math.max(1, Math.ceil(durationMinutes / interval));

      return WEEK_PLANNER_ROW_HEIGHT * span + WEEK_PLANNER_ROW_GAP * Math.max(0, span - 1);
    },
    [availabilitySettings, data, getServiceDuration]
  );

  const weekRangeLabel =
    weekDates.length === 7
      ? `${weekDates[0]?.weekdayShort} ${weekDates[0]?.dayNumber} ${weekDates[0]?.monthShort} - ${weekDates[6]?.weekdayShort} ${weekDates[6]?.dayNumber} ${weekDates[6]?.monthShort}`
      : '';

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

  const prossimoAppuntamentoOggi = useMemo(
    () =>
      appuntamentiOggiFiltrati.find(
        (item) => getAppointmentDateTime(item.data ?? todayDate, item.ora).getTime() > Date.now()
      ) ?? null,
    [appuntamentiOggiFiltrati, todayDate]
  );

  const ultimoAppuntamentoArchiviato = useMemo(
    () => appuntamentiPassatiFiltrati[0] ?? null,
    [appuntamentiPassatiFiltrati]
  );

  const weekAppointmentsCount = useMemo(
    () => weekDates.reduce((total, day) => total + (appointmentsByDate[day.value] ?? []).length, 0),
    [appointmentsByDate, weekDates]
  );

  const weekAvailableSlotsCount = useMemo(
    () =>
      weekDates.reduce((total, day) => {
        const availability = getDateAvailabilityInfo(availabilitySettings, day.value);
        if (availability.closed) return total;

        const availableSlotsForDay = weekTimeSlots.filter((slotTime) => {
          if (!isTimeWithinDaySchedule(availabilitySettings, day.value, slotTime)) return false;
          if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return false;
          if (isSlotBlockedByOverride(availabilitySettings, day.value, slotTime)) return false;

          return !(appointmentsByDate[day.value] ?? []).some((item) =>
            doesAppointmentOccupySlot(item, slotTime)
          );
        }).length;

        return total + availableSlotsForDay;
      }, 0),
    [
      appointmentsByDate,
      availabilitySettings,
      doesAppointmentOccupySlot,
      weekDates,
      weekTimeSlots,
    ]
  );

  const agendaViewCards = useMemo(
    () => [
      {
        key: 'today' as const,
        eyebrow: 'In corso',
        title: 'Oggi',
        count: appuntamentiOggiFiltrati.length,
        note: prossimoAppuntamentoOggi
          ? `${prossimoAppuntamentoOggi.ora} · ${prossimoAppuntamentoOggi.cliente}`
          : appuntamentiOggiFiltrati.length > 0
            ? 'Giornata gia avviata'
            : 'Nessun appuntamento per oggi',
      },
      {
        key: 'upcoming' as const,
        eyebrow: 'Da preparare',
        title: 'Prossimi',
        count: appuntamentiProssimiFiltrati.length,
        note:
          sezioniAgendaProssime[0]?.date
            ? formatDateLongLocalized(sezioniAgendaProssime[0].date, appLanguage)
            : 'Nessun appuntamento in arrivo',
      },
      {
        key: 'recent' as const,
        eyebrow: 'Gia conclusi',
        title: 'Archivio recente',
        count: appuntamentiPassatiFiltrati.length,
        note: ultimoAppuntamentoArchiviato
          ? `${formatDateCompact(ultimoAppuntamentoArchiviato.data ?? todayDate)} · ${ultimoAppuntamentoArchiviato.cliente}`
          : 'Ancora nessuno storico',
      },
      {
        key: 'week' as const,
        eyebrow: 'Planner',
        title: 'Settimana',
        count: weekAppointmentsCount,
        note:
          weekDates.length === 7
            ? `${weekDates[0]?.dayNumber} ${weekDates[0]?.monthShort} - ${weekDates[6]?.dayNumber} ${weekDates[6]?.monthShort} · ${weekAvailableSlotsCount} slot liberi`
            : 'Vista settimanale',
      },
    ],
    [
      appuntamentiOggiFiltrati.length,
      prossimoAppuntamentoOggi,
      appuntamentiProssimiFiltrati.length,
      sezioniAgendaProssime,
      appLanguage,
      appuntamentiPassatiFiltrati.length,
      ultimoAppuntamentoArchiviato,
      todayDate,
      weekAppointmentsCount,
      weekAvailableSlotsCount,
      weekDates,
    ]
  );

  const selectedAgendaSections = useMemo(() => {
    if (agendaView === 'today') return sezioniAgendaOggi;
    if (agendaView === 'upcoming') return sezioniAgendaProssime;
    if (agendaView === 'week') return [];
    return sezioniAgendaRecenti;
  }, [agendaView, sezioniAgendaOggi, sezioniAgendaProssime, sezioniAgendaRecenti]);

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

  const getWeekCellState = useCallback(
    (dateValue: string, slotTime: string): WeekPlannerCellState => {
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return 'outside';
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, slotTime)) return 'outside';
      if (isTimeBlockedByLunchBreak(availabilitySettings, slotTime)) return 'blocked';
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, slotTime)) return 'blocked';
      if (getSlotBookedCount(dateValue, slotTime) > 0) return 'occupied';
      return 'available';
    },
    [availabilitySettings, getSlotBookedCount]
  );

  const canScheduleServiceAtSlot = useCallback(
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
      if (!serviceName.trim()) return false;
      const availability = getDateAvailabilityInfo(availabilitySettings, dateValue);
      if (availability.closed) return false;
      if (!isTimeWithinDaySchedule(availabilitySettings, dateValue, startTime)) return false;
      if (
        !doesServiceFitWithinDaySchedule({
          settings: availabilitySettings,
          dateValue,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return false;
      }
      if (
        doesServiceOverlapLunchBreak({
          settings: availabilitySettings,
          startTime,
          durationMinutes: getServiceDuration(serviceName),
        })
      ) {
        return false;
      }
      if (isSlotBlockedByOverride(availabilitySettings, dateValue, startTime)) return false;

      const now = new Date();
      const todayIso = getTodayDateString();
      if (dateValue === todayIso && timeToMinutes(startTime) < now.getHours() * 60 + now.getMinutes()) {
        return false;
      }

      return (
        getSlotAvailableCount({
          dateValue,
          startTime,
          serviceName,
          selectedOperatorId: selectedOperatorId ?? null,
        }) > 0
      );
    },
    [availabilitySettings, getServiceDuration, getSlotAvailableCount]
  );

  const selectedQuickService = useMemo(
    () => servizi.find((item) => item.id === quickBookingServiceId) ?? null,
    [quickBookingServiceId, servizi]
  );

  const quickBookingCustomerOptions = useMemo(() => clienti.slice(0, 40), [clienti]);

  const selectedQuickCustomer = useMemo(
    () => clienti.find((item) => item.id === quickBookingCustomerId) ?? null,
    [clienti, quickBookingCustomerId]
  );

  const quickBookingCompatibleOperators = useMemo(() => {
    if (!quickSlotDraft || !selectedQuickService) return [];

    return getEligibleOperatorsForService({
      serviceName: selectedQuickService.nome,
      services: servizi,
      operators: operatori,
      appointmentDate: quickSlotDraft.date,
      settings: availabilitySettings,
    });
  }, [availabilitySettings, operatori, quickSlotDraft, selectedQuickService, servizi]);

  const quickBookingUsesOperators =
    !!selectedQuickService &&
    operatori.length > 0 &&
    doesServiceUseOperators(selectedQuickService.nome, servizi) &&
    quickBookingCompatibleOperators.length > 0;

  const quickBookingOperatorSelectionRequired =
    quickBookingUsesOperators && quickBookingCompatibleOperators.length > 1;

  const openQuickSlotModal = useCallback(
    (dateValue: string, slotTime: string) => {
      if (getWeekCellState(dateValue, slotTime) !== 'available') return;

      setQuickSlotDraft({ date: dateValue, time: slotTime });
      setQuickBookingServiceId('');
      setQuickBookingCustomerId('');
      setQuickBookingOperatorId('');
      setShowQuickCustomerComposer(false);
      setQuickCustomerNameInput('');
      setQuickCustomerPhoneInput('');
      setQuickCustomerEmailInput('');
    },
    [getWeekCellState]
  );

  const closeQuickSlotModal = useCallback(() => {
    setQuickSlotDraft(null);
    setQuickBookingServiceId('');
    setQuickBookingCustomerId('');
    setQuickBookingOperatorId('');
    setShowQuickCustomerComposer(false);
    setQuickCustomerNameInput('');
    setQuickCustomerPhoneInput('');
    setQuickCustomerEmailInput('');
  }, []);

  const commitAppointmentRecord = useCallback(
    ({
      dateValue,
      timeValue,
      customerName,
      serviceName,
      priceValue,
      operatorIdValue,
      operatorNameValue,
    }: {
      dateValue: string;
      timeValue: string;
      customerName: string;
      serviceName: string;
      priceValue: number;
      operatorIdValue?: string;
      operatorNameValue?: string;
    }) => {
      const nuovoAppuntamento: AppuntamentoItem = {
        id: Date.now().toString(),
        data: dateValue,
        ora: timeValue,
        cliente: customerName.trim(),
        servizio: serviceName.trim(),
        prezzo: priceValue,
        durataMinuti: getServiceDuration(serviceName.trim()),
        operatoreId: operatorIdValue || undefined,
        operatoreNome: operatorNameValue || undefined,
        incassato: false,
        completato: false,
      };

      setAppuntamenti((current) => [nuovoAppuntamento, ...current]);

      const clienteRegistrato = clienti.find(
        (item) =>
          item.fonte === 'frontend' &&
          item.nome.trim().toLowerCase() === customerName.trim().toLowerCase() &&
          !!item.telefono.trim() &&
          !!(item.email ?? '').trim()
      );

      if (clienteRegistrato) {
        const [nomeParte = '', ...cognomeParti] = clienteRegistrato.nome.trim().split(' ');
        const cognomeParte = cognomeParti.join(' ');

        setRichiestePrenotazione((current) => {
          const esisteGiaNotifica = current.some(
            (item) =>
              item.origine === 'backoffice' &&
              item.email.trim().toLowerCase() ===
                (clienteRegistrato.email ?? '').trim().toLowerCase() &&
              item.telefono.trim() === clienteRegistrato.telefono.trim() &&
              item.data === dateValue &&
              item.ora === timeValue &&
              item.servizio.trim().toLowerCase() === serviceName.trim().toLowerCase()
          );

          if (esisteGiaNotifica) return current;

          return [
            {
              id: `bo-${Date.now()}`,
              data: dateValue,
              ora: timeValue,
              servizio: serviceName.trim(),
              prezzo: priceValue,
              durataMinuti: getServiceDuration(serviceName.trim()),
              nome: nomeParte,
              cognome: cognomeParte,
              email: clienteRegistrato.email ?? '',
              telefono: clienteRegistrato.telefono,
              instagram: clienteRegistrato.instagram ?? '',
              note: '',
              operatoreId: operatorIdValue || undefined,
              operatoreNome: operatorNameValue || undefined,
              origine: 'backoffice',
              stato: 'Accettata',
              createdAt: new Date().toISOString(),
              viewedByCliente: false,
            },
            ...current,
          ];
        });
      }
    },
    [clienti, getServiceDuration, setAppuntamenti, setRichiestePrenotazione]
  );

  const addCustomerFromQuickBooking = useCallback(() => {
    if (!quickCustomerNameInput.trim() || !quickCustomerPhoneInput.trim()) {
      Alert.alert('Dati mancanti', 'Inserisci almeno nome cliente e telefono.');
      return;
    }

    const nextId = `cliente-${Date.now()}`;
    setClienti((current) => [
      {
        id: nextId,
        nome: quickCustomerNameInput.trim(),
        telefono: quickCustomerPhoneInput.trim(),
        email: quickCustomerEmailInput.trim(),
        instagram: '',
        birthday: '',
        nota: '',
        fonte: 'salone',
        viewedBySalon: true,
        annullamentiCount: 0,
        inibito: false,
      },
      ...current,
    ]);
    setQuickBookingCustomerId(nextId);
    setShowQuickCustomerComposer(false);
    setQuickCustomerNameInput('');
    setQuickCustomerPhoneInput('');
    setQuickCustomerEmailInput('');
  }, [quickCustomerEmailInput, quickCustomerNameInput, quickCustomerPhoneInput, setClienti]);

  const confirmQuickSlotBooking = useCallback(() => {
    if (!quickSlotDraft || !selectedQuickService || !selectedQuickCustomer) {
      return;
    }

    const selectedOperator =
      quickBookingCompatibleOperators.find((item) => item.id === quickBookingOperatorId) ??
      (quickBookingCompatibleOperators.length === 1
        ? quickBookingCompatibleOperators[0]
        : undefined);

    if (
      quickBookingOperatorSelectionRequired &&
      (!selectedOperator || !quickBookingOperatorId.trim())
    ) {
      Alert.alert('Operatore richiesto', 'Seleziona un operatore per completare la prenotazione.');
      return;
    }

    if (
      !canScheduleServiceAtSlot({
        dateValue: quickSlotDraft.date,
        startTime: quickSlotDraft.time,
        serviceName: selectedQuickService.nome,
        selectedOperatorId: selectedOperator?.id ?? null,
      })
    ) {
      Alert.alert(
        'Slot non disponibile',
        'Questo servizio non entra piu nello slot selezionato. Scegli un altro orario o un altro operatore.'
      );
      return;
    }

    commitAppointmentRecord({
      dateValue: quickSlotDraft.date,
      timeValue: quickSlotDraft.time,
      customerName: selectedQuickCustomer.nome,
      serviceName: selectedQuickService.nome,
      priceValue: selectedQuickService.prezzo,
      operatorIdValue: selectedOperator?.id,
      operatorNameValue: selectedOperator?.nome,
    });

    setData(quickSlotDraft.date);
    setCalendarMonth(quickSlotDraft.date);
    setAgendaView('week');
    closeQuickSlotModal();
  }, [
    canScheduleServiceAtSlot,
    closeQuickSlotModal,
    commitAppointmentRecord,
    quickBookingCompatibleOperators,
    quickBookingOperatorId,
    quickBookingOperatorSelectionRequired,
    quickSlotDraft,
    selectedQuickCustomer,
    selectedQuickService,
  ]);

  const addMacchinario = useCallback(() => {
    if (!machineryNameInput.trim()) {
      Alert.alert('Nome richiesto', 'Inserisci almeno il nome del macchinario.');
      return;
    }

    setMacchinari((current) => [
      {
        id: `macchinario-${Date.now()}`,
        nome: machineryNameInput.trim(),
        categoria: machineryCategoryInput.trim(),
        note: machineryNotesInput.trim(),
        attivo: true,
      },
      ...current,
    ]);
    setMachineryNameInput('');
    setMachineryCategoryInput('');
    setMachineryNotesInput('');
    setShowMachineryListExpanded(true);
  }, [
    machineryCategoryInput,
    machineryNameInput,
    machineryNotesInput,
    setMacchinari,
  ]);

  const toggleMacchinarioAttivo = useCallback(
    (machineryId: string) => {
      setMacchinari((current) =>
        current.map((item) =>
          item.id === machineryId ? { ...item, attivo: item.attivo === false } : item
        )
      );
    },
    [setMacchinari]
  );

  const removeMacchinario = useCallback(
    (machineryId: string) => {
      setMacchinari((current) => current.filter((item) => item.id !== machineryId));
    },
    [setMacchinari]
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
  const canChooseAgendaClient = data.trim() !== '' && !selectedDateAvailability.closed;
  const canChooseAgendaService =
    canChooseAgendaClient &&
    cliente.trim() !== '' &&
    !selectedDateAvailability.closed;
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

  const meseCorrenteLabel = useMemo(
    () => formatMonthYearLabelLocalized(data, appLanguage),
    [appLanguage, data]
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

    commitAppointmentRecord({
      dateValue: data,
      timeValue: ora,
      customerName: cliente.trim(),
      serviceName: servizio.trim(),
      priceValue: valorePrezzo,
      operatorIdValue: operatoreId || undefined,
      operatorNameValue: operatoreNome || undefined,
    });

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

  const renderAppuntamentoCard = (item: AppuntamentoItem, compact = false) => {
    const accent = getServiceAccentByMeta({ serviceName: item.servizio });
    const isFutureAppointment = isAppointmentInFuture(item, todayDate);
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

    if (!isFutureAppointment) {
      return card;
    }

    return (
      <Swipeable
        key={item.id}
        ref={(ref) => {
          swipeableRefs.current[item.id] = ref;
        }}
        renderRightActions={() => (
          <TouchableOpacity
            style={styles.deleteSwipeAction}
            onPress={() => eliminaAppuntamentoFuturo(item)}
            activeOpacity={0.9}
          >
            <Text style={styles.deleteSwipeText}>{tApp(appLanguage, 'common_delete')}</Text>
          </TouchableOpacity>
        )}
        overshootRight={false}
        rightThreshold={32}
      >
        {card}
      </Swipeable>
    );
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

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={selectedAgendaSections}
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
          closeAllSwipeables();
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

            <View style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <View style={styles.bookingHeaderLeft}>
                    <View style={styles.bookingHeadingRow}>
                      <Text
                        style={styles.bookingHeading}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.86}
                      >
                        Prenotazione appuntamento
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.bookingBadge}
                    onPress={() => {
                      setCalendarMonth(data);
                      setShowCalendarModal(true);
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.bookingBadgeText}>{meseCorrenteLabel}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sectionBlock}>
                  <View style={styles.sectionTitleRow}>
                    <Text style={styles.stepPill}>1</Text>
                    <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_day_of_month')}</Text>
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

                  <Text style={styles.sectionHint}>
                    {formatDateLongLocalized(data, appLanguage)}
                    {selectedDateAvailability.closed ? ` · ${tApp(appLanguage, 'agenda_closed_day')}` : ''}
                  </Text>
                </View>
            </View>

            <View style={styles.bookingCard}>
              <View
                style={[
                  styles.sectionBlock,
                  !canChooseAgendaClient && styles.sectionBlockLocked,
                ]}
              >
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.stepPill}>2</Text>
                  <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_client')}</Text>
                </View>

                {!canChooseAgendaClient ? (
                  <Text style={styles.lockedSectionText}>
                    {tApp(appLanguage, 'agenda_choose_day_first')}
                  </Text>
                ) : null}

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

                {canChooseAgendaClient &&
                campoAttivo === 'cliente' &&
                suggerimentiCliente.length > 0 ? (
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
                        if (!canChooseAgendaClient) return;
                        setCliente(item.nome);
                        setCampoAttivo(null);
                      }}
                      activeOpacity={canChooseAgendaClient ? 0.9 : 1}
                      disabled={!canChooseAgendaClient}
                    >
                      <Text style={styles.quickClientChipText}>{item.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View
                style={[
                  styles.sectionBlockLast,
                  !canChooseAgendaService && styles.sectionBlockLocked,
                ]}
              >
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.stepPill}>3</Text>
                  <Text style={styles.sectionTitle}>{tApp(appLanguage, 'agenda_service_type')}</Text>
                </View>

                {!canChooseAgendaService ? (
                  <Text style={styles.lockedSectionText}>
                    {!canChooseAgendaClient
                      ? tApp(appLanguage, 'agenda_choose_day_first')
                      : 'Seleziona prima il cliente per scegliere il servizio.'}
                  </Text>
                ) : null}

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.serviceRow}
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
                        <Text style={[styles.serviceCardTitle, { color: accent.text }]}>
                          {item.nome}
                        </Text>
                        <Text style={[styles.serviceCardPrice, { color: accent.text }]}>
                          € {item.prezzo.toFixed(2)}
                        </Text>
                        <Text style={[styles.serviceCardDuration, { color: accent.text }]}>
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

              {serviceUsesOperatorScheduling ? (
                <View
                  style={[
                    styles.sectionBlock,
                    !canChooseAgendaService && styles.sectionBlockLocked,
                  ]}
                >
                  <View style={styles.sectionTitleRow}>
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
                    <View style={styles.operatorSelectionRow}>
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

              <View
                style={[styles.sectionBlock, !canChooseAgendaTime && styles.sectionBlockLocked]}
              >
                <View style={styles.sectionTitleRow}>
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
                <View style={styles.timeGrid}>
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
                          <View style={styles.slotMiniBadge}>
                            <Text style={styles.slotMiniBadgeText}>
                              {tApp(appLanguage, 'agenda_pause_badge')}
                            </Text>
                          </View>
                        ) : slotCounterText ? (
                          <View
                            style={[
                              styles.slotMiniBadge,
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
                <Text style={styles.agendaExplorerEyebrow}>Panoramica agenda</Text>
                <Text style={styles.agendaExplorerTitle}>Capisci subito dove intervenire</Text>
                <Text style={styles.agendaExplorerText}>
                  Oggi per il lavoro in corso, Prossimi per prepararti, Archivio recente per
                  controllare cosa e gia successo.
                </Text>
              </View>

              <View style={styles.agendaViewGrid}>
                {agendaViewCards.map((card) => {
                  const selected = agendaView === card.key;

                  return (
                    <TouchableOpacity
                      key={card.key}
                      style={[
                        styles.agendaViewCard,
                        selected && styles.agendaViewCardActive,
                      ]}
                      onPress={() => {
                        setAgendaView(card.key);
                        setGiornoEspanso(
                          (card.key === 'today'
                            ? sezioniAgendaOggi[0]?.date
                            : card.key === 'upcoming'
                              ? sezioniAgendaProssime[0]?.date
                              : card.key === 'week'
                                ? ''
                              : sezioniAgendaRecenti[0]?.date) ?? ''
                        );
                      }}
                      activeOpacity={0.92}
                    >
                      <Text
                        style={[
                          styles.agendaViewEyebrow,
                          selected && styles.agendaViewEyebrowActive,
                        ]}
                      >
                        {card.eyebrow}
                      </Text>
                      <Text
                        style={[
                          styles.agendaViewTitle,
                          selected && styles.agendaViewTitleActive,
                        ]}
                      >
                        {card.title}
                      </Text>
                      <View
                        style={[
                          styles.agendaViewCountBadge,
                          selected && styles.agendaViewCountBadgeActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.agendaViewCountText,
                            selected && styles.agendaViewCountTextActive,
                          ]}
                        >
                          {card.count}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.agendaViewNote,
                          selected && styles.agendaViewNoteActive,
                        ]}
                        numberOfLines={2}
                      >
                        {card.note}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.agendaFocusStrip}>
                <Text style={styles.agendaFocusStripEyebrow}>
                  {agendaView === 'today'
                    ? 'Vista attuale'
                    : agendaView === 'upcoming'
                      ? 'Vista futuri'
                      : agendaView === 'week'
                        ? 'Planner settimanale'
                        : 'Vista archivio'}
                </Text>
                <Text style={styles.agendaFocusStripTitle}>
                  {agendaView === 'today'
                    ? 'Appuntamenti di oggi'
                    : agendaView === 'upcoming'
                      ? 'Prossimi giorni da gestire'
                      : agendaView === 'week'
                        ? 'Settimana completa, slot leggibili'
                        : 'Storico appuntamenti recenti'}
                </Text>
                <Text style={styles.agendaFocusStripText}>
                  {agendaView === 'today'
                    ? 'Qui trovi solo la giornata corrente, cosi capisci al volo cosa resta da fare.'
                    : agendaView === 'upcoming'
                      ? 'Questa vista mostra i giorni successivi per preparare carico, operatori e disponibilita.'
                      : agendaView === 'week'
                        ? 'Ogni colonna mostra disponibilita reale, blocchi occupati e prenotazione diretta da slot libero.'
                        : 'Qui rivedi rapidamente gli appuntamenti gia passati, ordinati dai piu recenti.'}
                </Text>
              </View>

              {agendaView === 'week' ? (
                <View style={styles.weekPlannerCard}>
                  <View style={styles.weekPlannerHeader}>
                    <View style={styles.weekPlannerHeaderTextWrap}>
                      <Text style={styles.weekPlannerEyebrow}>Settimana operativa</Text>
                      <Text style={styles.weekPlannerTitle}>{weekRangeLabel}</Text>
                      <Text style={styles.weekPlannerSubtitle}>
                        Tocca uno slot libero per prenotare subito. I blocchi mostrano durata reale e operatore assegnato.
                      </Text>
                    </View>
                    <View style={styles.weekPlannerLegendRow}>
                      <View style={styles.weekLegendItem}>
                        <View style={[styles.weekLegendDot, styles.weekLegendDotAvailable]} />
                        <Text style={styles.weekLegendText}>Libero</Text>
                      </View>
                      <View style={styles.weekLegendItem}>
                        <View style={[styles.weekLegendDot, styles.weekLegendDotBooked]} />
                        <Text style={styles.weekLegendText}>Prenotato</Text>
                      </View>
                      <View style={styles.weekLegendItem}>
                        <View style={[styles.weekLegendDot, styles.weekLegendDotBlocked]} />
                        <Text style={styles.weekLegendText}>Bloccato</Text>
                      </View>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.weekPlannerGridShell}>
                      <View style={styles.weekPlannerTimeColumn}>
                        <View style={styles.weekPlannerCornerCell} />
                        {weekTimeSlots.map((slotTime) => (
                          <View
                            key={`week-time-${slotTime}`}
                            style={styles.weekPlannerTimeCell}
                          >
                            <Text style={styles.weekPlannerTimeText}>{slotTime}</Text>
                          </View>
                        ))}
                      </View>

                      {weekDates.map((day) => {
                        const appointmentsForDay = (appointmentsByDate[day.value] ?? []).length;
                        const availableForDay = weekTimeSlots.filter(
                          (slotTime) => getWeekCellState(day.value, slotTime) === 'available'
                        ).length;
                        const isSelectedDay = day.value === data;

                        return (
                          <View
                            key={`week-day-column-${day.value}`}
                            style={styles.weekPlannerDayColumn}
                          >
                            <TouchableOpacity
                              style={[
                                styles.weekPlannerDayHeader,
                                isSelectedDay && styles.weekPlannerDayHeaderActive,
                              ]}
                              onPress={() => handleSelectDate(day.value)}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  styles.weekPlannerDayLabel,
                                  isSelectedDay && styles.weekPlannerDayLabelActive,
                                ]}
                              >
                                {day.weekdayShort}
                              </Text>
                              <Text
                                style={[
                                  styles.weekPlannerDayNumber,
                                  isSelectedDay && styles.weekPlannerDayNumberActive,
                                ]}
                              >
                                {day.dayNumber}
                              </Text>
                              <Text
                                style={[
                                  styles.weekPlannerDayMeta,
                                  isSelectedDay && styles.weekPlannerDayMetaActive,
                                ]}
                              >
                                {appointmentsForDay} pren. · {availableForDay} liberi
                              </Text>
                            </TouchableOpacity>

                            {weekTimeSlots.map((slotTime) => {
                              const cellState = getWeekCellState(day.value, slotTime);
                              const appointmentStart = getWeekAppointmentStartingAt(day.value, slotTime);
                              const isContinuation =
                                cellState === 'occupied' && appointmentStart === null;

                              return (
                                <View
                                  key={`week-cell-${day.value}-${slotTime}`}
                                  style={styles.weekPlannerCellWrap}
                                >
                                  {isContinuation ? (
                                    <View style={styles.weekPlannerCellContinuation} />
                                  ) : appointmentStart ? (
                                    <View style={styles.weekPlannerBookedCell}>
                                      <View
                                        style={[
                                          styles.weekAppointmentBlock,
                                          {
                                            minHeight: getWeekAppointmentBlockHeight(appointmentStart),
                                            backgroundColor: getServiceAccentByMeta({
                                              serviceName: appointmentStart.servizio,
                                            }).bg,
                                            borderColor: getServiceAccentByMeta({
                                              serviceName: appointmentStart.servizio,
                                            }).border,
                                          },
                                        ]}
                                      >
                                        <Text style={styles.weekAppointmentTime}>
                                          {appointmentStart.ora} - {getAppointmentEndTime(appointmentStart)}
                                        </Text>
                                        <Text style={styles.weekAppointmentClient} numberOfLines={2}>
                                          {appointmentStart.cliente}
                                        </Text>
                                        <Text style={styles.weekAppointmentService} numberOfLines={2}>
                                          {appointmentStart.servizio}
                                        </Text>
                                        {appointmentStart.operatoreNome ? (
                                          <Text style={styles.weekAppointmentOperator} numberOfLines={1}>
                                            {appointmentStart.operatoreNome}
                                          </Text>
                                        ) : null}
                                      </View>
                                    </View>
                                  ) : (
                                    <TouchableOpacity
                                      style={[
                                        styles.weekPlannerCell,
                                        cellState === 'available' && styles.weekPlannerCellAvailable,
                                        cellState === 'blocked' && styles.weekPlannerCellBlocked,
                                        cellState === 'outside' && styles.weekPlannerCellOutside,
                                      ]}
                                      onPress={() => openQuickSlotModal(day.value, slotTime)}
                                      activeOpacity={cellState === 'available' ? 0.9 : 1}
                                      disabled={cellState !== 'available'}
                                    >
                                      <Text
                                        style={[
                                          styles.weekPlannerCellText,
                                          cellState === 'blocked' && styles.weekPlannerCellTextMuted,
                                          cellState === 'outside' && styles.weekPlannerCellTextMuted,
                                        ]}
                                      >
                                        {cellState === 'available'
                                          ? 'Prenota'
                                          : cellState === 'blocked'
                                            ? 'Bloccato'
                                            : 'Fuori orario'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              ) : null}
            </View>

            <View style={styles.searchCard}>
              <TouchableOpacity
                style={[styles.sectionToggleButton, styles.utilityToggleButton]}
                onPress={() => setShowOperatorListExpanded((current) => !current)}
                activeOpacity={0.9}
              >
                <View style={styles.sectionToggleTextWrap}>
                  <Text style={styles.searchTitle}>Operatori</Text>
                  <Text style={styles.searchSubtitle}>
                    Blocco compatto per vedere chi copre i mestieri attivi senza invadere l&apos;agenda.
                  </Text>
                </View>
                <View style={styles.sectionChevronBadge}>
                  <Ionicons
                    name={showOperatorListExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#111111"
                  />
                </View>
              </TouchableOpacity>

              {showOperatorListExpanded ? (
                operatori.length > 0 ? (
                  <View style={styles.operationalList}>
                    {operatori.map((item) => (
                      <View key={`operatore-${item.id}`} style={styles.operationalCard}>
                        <View style={styles.operationalCardMain}>
                          <Text style={styles.operationalTitle}>{item.nome}</Text>
                          <Text style={styles.operationalMeta}>{item.mestiere}</Text>
                          <Text style={styles.operationalSubmeta}>
                            Disponibile {item.availability?.enabledWeekdays?.length ?? 0} giorni a settimana
                          </Text>
                        </View>
                        <View style={styles.operationalBadge}>
                          <Text style={styles.operationalBadgeText}>
                            {item.availability?.dateRanges?.length ?? 0} blocchi
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.sectionHint}>
                    Nessun operatore configurato: la prenotazione continua a funzionare senza assegnazione.
                  </Text>
                )
              ) : null}
            </View>

            <View style={styles.searchCard}>
              <TouchableOpacity
                style={[styles.sectionToggleButton, styles.utilityToggleButton]}
                onPress={() => setShowMachineryListExpanded((current) => !current)}
                activeOpacity={0.9}
              >
                <View style={styles.sectionToggleTextWrap}>
                  <Text style={styles.searchTitle}>Macchinari</Text>
                  <Text style={styles.searchSubtitle}>
                    Elenco interno compatto per tenere visibili attrezzature attive, categoria e note rapide.
                  </Text>
                </View>
                <View style={styles.sectionChevronBadge}>
                  <Ionicons
                    name={showMachineryListExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#111111"
                  />
                </View>
              </TouchableOpacity>

              {showMachineryListExpanded ? (
                <>
                  <ClearableTextInput
                    style={[styles.input, styles.compactTopInput]}
                    placeholder="Nome macchinario"
                    placeholderTextColor="#8f8f8f"
                    value={machineryNameInput}
                    onChangeText={setMachineryNameInput}
                    returnKeyType="next"
                  />
                  <ClearableTextInput
                    style={styles.input}
                    placeholder="Categoria o utilizzo"
                    placeholderTextColor="#8f8f8f"
                    value={machineryCategoryInput}
                    onChangeText={setMachineryCategoryInput}
                    returnKeyType="next"
                  />
                  <ClearableTextInput
                    style={styles.input}
                    placeholder="Note rapide facoltative"
                    placeholderTextColor="#8f8f8f"
                    value={machineryNotesInput}
                    onChangeText={setMachineryNotesInput}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <TouchableOpacity
                    style={styles.secondaryButtonWide}
                    onPress={addMacchinario}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.secondaryButtonWideText}>Aggiungi macchinario</Text>
                  </TouchableOpacity>

                  {macchinari.length > 0 ? (
                    <View style={styles.operationalList}>
                      {macchinari.map((item) => (
                        <View key={`macchinario-${item.id}`} style={styles.operationalCard}>
                          <View style={styles.operationalCardMain}>
                            <Text style={styles.operationalTitle}>{item.nome}</Text>
                            <Text style={styles.operationalMeta}>
                              {item.categoria || 'Categoria non specificata'}
                            </Text>
                            {item.note ? (
                              <Text style={styles.operationalSubmeta}>{item.note}</Text>
                            ) : null}
                          </View>

                          <View style={styles.operationalActionsColumn}>
                            <TouchableOpacity
                              style={[
                                styles.operationalStatusButton,
                                item.attivo === false
                                  ? styles.operationalStatusButtonInactive
                                  : styles.operationalStatusButtonActive,
                              ]}
                              onPress={() => toggleMacchinarioAttivo(item.id)}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  styles.operationalStatusButtonText,
                                  item.attivo === false
                                    ? styles.operationalStatusButtonTextInactive
                                    : styles.operationalStatusButtonTextActive,
                                ]}
                              >
                                {item.attivo === false ? 'Disattivo' : 'Attivo'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.operationalDeleteButton}
                              onPress={() => removeMacchinario(item.id)}
                              activeOpacity={0.9}
                            >
                              <Text style={styles.operationalDeleteButtonText}>Elimina</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.sectionHint}>
                      Nessun macchinario salvato. Inseriscili qui per avere un riferimento rapido durante la settimana.
                    </Text>
                  )}
                </>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => renderAgendaDaySection(item, true)}
        ListEmptyComponent={
          agendaView === 'week' ? null : (
            <View style={styles.emptyAgendaState}>
              <Text style={styles.emptyAgendaStateTitle}>
                {agendaView === 'today'
                  ? 'Nessun appuntamento per oggi'
                  : agendaView === 'upcoming'
                    ? 'Nessun appuntamento in arrivo'
                    : 'Archivio ancora vuoto'}
              </Text>
              <Text style={styles.emptyAgendaStateText}>
                {agendaView === 'today'
                  ? 'Puoi usare la parte alta della schermata per prenotare subito il prossimo cliente.'
                  : agendaView === 'upcoming'
                    ? 'Quando inserirai nuovi appuntamenti nei prossimi giorni li troverai qui, ordinati per data.'
                    : 'Appena completi le prime giornate di lavoro, qui comparira lo storico recente.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <View style={styles.pastAppointmentsSection} />
        }
      />

      <Modal
        visible={!!quickSlotDraft}
        transparent
        animationType="fade"
        onRequestClose={closeQuickSlotModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.quickBookingModalCard}>
            <View style={styles.quickBookingHeaderRow}>
              <View style={styles.quickBookingHeaderTextWrap}>
                <Text style={styles.calendarTitle}>Prenota slot</Text>
                <Text style={styles.modalHelperText}>
                  {quickSlotDraft
                    ? `${formatDateLongLocalized(quickSlotDraft.date, appLanguage)} · ${quickSlotDraft.time}`
                    : ''}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.timeConfigCloseButton}
                onPress={closeQuickSlotModal}
                activeOpacity={0.9}
              >
                <Text style={styles.timeConfigCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.quickBookingContent}
            >
              <Text style={styles.quickBookingSectionTitle}>Servizio</Text>
              <View style={styles.quickBookingChipWrap}>
                {servizi.map((item) => {
                  const selected = item.id === quickBookingServiceId;
                  const selectable =
                    !quickSlotDraft ||
                    canScheduleServiceAtSlot({
                      dateValue: quickSlotDraft.date,
                      startTime: quickSlotDraft.time,
                      serviceName: item.nome,
                      selectedOperatorId: null,
                    });

                  return (
                    <TouchableOpacity
                      key={`quick-service-${item.id}`}
                      style={[
                        styles.quickBookingChip,
                        selected && styles.quickBookingChipActive,
                        !selectable && styles.quickBookingChipDisabled,
                      ]}
                      onPress={() => {
                        if (!selectable) return;
                        setQuickBookingServiceId(item.id);
                        setQuickBookingOperatorId('');
                      }}
                      activeOpacity={selectable ? 0.9 : 1}
                      disabled={!selectable}
                    >
                      <Text
                        style={[
                          styles.quickBookingChipTitle,
                          selected && styles.quickBookingChipTitleActive,
                        ]}
                      >
                        {item.nome}
                      </Text>
                      <Text
                        style={[
                          styles.quickBookingChipMeta,
                          selected && styles.quickBookingChipMetaActive,
                        ]}
                      >
                        € {item.prezzo.toFixed(2)} · {item.durataMinuti ?? 60} min
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.quickBookingSectionTitle}>Cliente</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.quickBookingInlineRow}>
                  {quickBookingCustomerOptions.map((item) => {
                    const selected = item.id === quickBookingCustomerId;

                    return (
                      <TouchableOpacity
                        key={`quick-customer-${item.id}`}
                        style={[
                          styles.quickCustomerChip,
                          selected && styles.quickCustomerChipActive,
                        ]}
                        onPress={() => setQuickBookingCustomerId(item.id)}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[
                            styles.quickCustomerChipText,
                            selected && styles.quickCustomerChipTextActive,
                          ]}
                        >
                          {item.nome}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity
                    style={styles.quickCustomerAddChip}
                    onPress={() => setShowQuickCustomerComposer((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.quickCustomerAddChipText}>
                      {showQuickCustomerComposer ? 'Chiudi nuovo cliente' : '+ Nuovo cliente'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              {showQuickCustomerComposer ? (
                <View style={styles.quickCustomerComposer}>
                  <ClearableTextInput
                    style={[styles.input, styles.compactTopInput]}
                    placeholder="Nome cliente"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerNameInput}
                    onChangeText={setQuickCustomerNameInput}
                  />
                  <ClearableTextInput
                    style={styles.input}
                    placeholder="Telefono"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerPhoneInput}
                    onChangeText={setQuickCustomerPhoneInput}
                    keyboardType="phone-pad"
                  />
                  <ClearableTextInput
                    style={styles.input}
                    placeholder="Email facoltativa"
                    placeholderTextColor="#8f8f8f"
                    value={quickCustomerEmailInput}
                    onChangeText={setQuickCustomerEmailInput}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />

                  <TouchableOpacity
                    style={styles.secondaryButtonWide}
                    onPress={addCustomerFromQuickBooking}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.secondaryButtonWideText}>Salva cliente rapido</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {quickBookingUsesOperators ? (
                <>
                  <Text style={styles.quickBookingSectionTitle}>Operatore</Text>
                  <View style={styles.quickBookingChipWrap}>
                    {quickBookingCompatibleOperators.map((item) => {
                      const selected = item.id === quickBookingOperatorId;

                      return (
                        <TouchableOpacity
                          key={`quick-operator-${item.id}`}
                          style={[
                            styles.quickBookingChip,
                            selected && styles.quickBookingChipActive,
                          ]}
                          onPress={() => setQuickBookingOperatorId(item.id)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.quickBookingChipTitle,
                              selected && styles.quickBookingChipTitleActive,
                            ]}
                          >
                            {item.nome}
                          </Text>
                          <Text
                            style={[
                              styles.quickBookingChipMeta,
                              selected && styles.quickBookingChipMetaActive,
                            ]}
                          >
                            {item.mestiere}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <View style={styles.quickBookingSummaryCard}>
                <Text style={styles.summaryTitle}>Riepilogo rapido</Text>
                <Text style={styles.summaryText}>
                  Servizio: {selectedQuickService?.nome || '—'}
                </Text>
                <Text style={styles.summaryText}>
                  Cliente: {selectedQuickCustomer?.nome || '—'}
                </Text>
                <Text style={styles.summaryText}>
                  Operatore:{' '}
                  {quickBookingOperatorSelectionRequired
                    ? quickBookingCompatibleOperators.find((item) => item.id === quickBookingOperatorId)
                        ?.nome || '—'
                    : quickBookingCompatibleOperators[0]?.nome || 'Assegnazione non richiesta'}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalSecondaryButton}
                onPress={closeQuickSlotModal}
                activeOpacity={0.9}
              >
                <Text style={styles.modalSecondaryButtonText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalPrimaryButton,
                  (!selectedQuickService ||
                    !selectedQuickCustomer ||
                    (quickBookingOperatorSelectionRequired && !quickBookingOperatorId)) &&
                    styles.primaryButtonDisabled,
                ]}
                onPress={confirmQuickSlotBooking}
                activeOpacity={0.9}
                disabled={
                  !selectedQuickService ||
                  !selectedQuickCustomer ||
                  (quickBookingOperatorSelectionRequired && !quickBookingOperatorId)
                }
              >
                <Text style={styles.modalPrimaryButtonText}>Conferma slot</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
                const closed = day.value
                  ? getDateAvailabilityInfo(availabilitySettings, day.value).closed
                  : false;
                const fullyBooked = day.value && !closed ? isDateFullyBooked(day.value) : false;

                return (
                  <TouchableOpacity
                    key={day.key}
                    style={[
                      styles.calendarDayCell,
                      selected && styles.calendarDayCellActive,
                      day.isDisabled && styles.calendarDayCellDisabled,
                      closed && !selected && styles.calendarDayCellClosed,
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
                      handleDayLongPress(day.value);
                    }}
                    activeOpacity={day.value && !day.isDisabled && !closed ? 0.9 : 1}
                    disabled={!day.value || day.isDisabled}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        selected && styles.calendarDayTextActive,
                        day.isDisabled && styles.calendarDayTextDisabled,
                        closed && !selected && styles.calendarDayTextClosed,
                        fullyBooked && !selected && styles.calendarDayTextFull,
                      ]}
                    >
                      {day.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.calendarFooterText}>
              {tApp(appLanguage, 'agenda_calendar_hint')}
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

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  listContent: {
    paddingHorizontal: 18,
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
    paddingBottom: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  screenHeaderRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
    gap: 3,
  },
  screenBrandChip: {
    maxWidth: '88%',
    marginTop: 2,
    marginBottom: 4,
    alignItems: 'center',
  },
  screenBrandChipText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#52627a',
    textAlign: 'center',
  },
  heroSubtitle: {
    maxWidth: 320,
    fontSize: 12,
    color: '#6f7b8d',
    lineHeight: 18,
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
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  bookingHeaderLeft: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  bookingHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  bookingHeading: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -0.3,
  },
  bookingBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flexShrink: 0,
  },
  monthTrigger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5563',
    textTransform: 'capitalize',
  },
  sectionBlock: {
    marginBottom: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionBlockLast: {
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionBlockLocked: {
    opacity: 0.82,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  stepPill: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#0f172a',
    color: '#ffffff',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    marginRight: 9,
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
    letterSpacing: -0.2,
  },
  sectionHint: {
    marginTop: 8,
    fontSize: 11,
    color: '#667085',
    fontWeight: '600',
    textTransform: 'capitalize',
    textAlign: 'left',
  },
  lockedSectionText: {
    fontSize: 11,
    color: '#7a8597',
    fontWeight: '700',
    lineHeight: 17,
    marginBottom: 8,
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
    paddingHorizontal: 6,
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
    marginBottom: 6,
  },
  dayWeek: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6b7280',
    textAlign: 'center',
  },
  dayStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 2,
    minWidth: 40,
    maxWidth: 40,
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 5,
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
    height: 16,
    marginBottom: 5,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 2,
    textAlign: 'center',
    lineHeight: 22,
  },
  dayMonth: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'capitalize',
    marginBottom: 4,
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
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 46,
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
  timeChip: {
    width: '22%',
    marginHorizontal: '1.5%',
    marginBottom: 8,
    backgroundColor: '#f5f5f4',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ececec',
    position: 'relative',
    overflow: 'visible',
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
    top: 4,
    right: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.24)',
    borderRadius: 999,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 38,
    maxWidth: 44,
    alignItems: 'center',
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
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
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
    width: 150,
    backgroundColor: '#1f2937',
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
    zIndex: 40,
    marginBottom: 24,
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
    fontSize: 12,
    color: '#a16207',
    fontWeight: '700',
    marginTop: 4,
  },
  serviceRow: {
    paddingRight: 6,
  },
  operatorSelectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginHorizontal: -4,
  },
  operatorSelectionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginBottom: 8,
    minWidth: 116,
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorSelectionCardActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  operatorSelectionName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  operatorSelectionNameActive: {
    color: '#ffffff',
  },
  operatorSelectionRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  operatorSelectionRoleActive: {
    color: '#dbe4ec',
  },
  serviceCard: {
    width: 118,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginRight: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  serviceCardPrice: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  serviceCardDuration: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111111',
  },
  centeredInput: {
    textAlign: 'center',
  },
  suggestionBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    marginTop: 6,
    overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ececec',
  },
  suggestionText: {
    fontSize: 13,
    color: '#111111',
    fontWeight: '600',
    textAlign: 'center',
  },
  quickClientsRow: {
    paddingTop: 8,
    paddingRight: 6,
  },
  quickClientChip: {
    backgroundColor: '#f1f0ec',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  quickClientChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111111',
  },
  warningInlineCard: {
    backgroundColor: '#fff7ed',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
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
    fontSize: 12,
    lineHeight: 18,
    color: '#9a3412',
    fontWeight: '600',
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#f5f5f4',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 13,
    color: '#555555',
    lineHeight: 19,
    textAlign: 'center',
  },
  summaryWarningText: {
    fontSize: 12,
    color: '#9a3412',
    lineHeight: 18,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 14,
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
    fontSize: 14,
    fontWeight: '800',
  },
  searchCard: {
    backgroundColor: '#f7fbff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'left',
  },
  searchSubtitle: {
    fontSize: 11,
    lineHeight: 17,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'left',
  },
  agendaExplorerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  agendaExplorerHeader: {
    marginBottom: 12,
    alignItems: 'center',
  },
  agendaExplorerEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.4,
    textAlign: 'center',
    marginBottom: 4,
  },
  agendaExplorerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  agendaExplorerText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  agendaViewGrid: {
    gap: 8,
  },
  agendaViewCard: {
    backgroundColor: '#f8fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 154,
    justifyContent: 'center',
  },
  agendaViewCardActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  agendaViewEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  agendaViewEyebrowActive: {
    color: '#cbd5e1',
  },
  agendaViewTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  agendaViewTitleActive: {
    color: '#ffffff',
  },
  agendaViewCountBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  agendaViewCountBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  agendaViewCountText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
  },
  agendaViewCountTextActive: {
    color: '#ffffff',
  },
  agendaViewNote: {
    fontSize: 12,
    lineHeight: 17,
    color: '#475569',
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 220,
  },
  agendaViewNoteActive: {
    color: '#e2e8f0',
  },
  agendaFocusStrip: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  agendaFocusStripEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  agendaFocusStripTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  agendaFocusStripText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  weekPlannerCard: {
    marginTop: 12,
    backgroundColor: '#f8fbff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    padding: 12,
  },
  weekPlannerHeader: {
    marginBottom: 10,
  },
  weekPlannerHeaderTextWrap: {
    marginBottom: 8,
  },
  weekPlannerEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
  },
  weekPlannerTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 6,
  },
  weekPlannerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    fontWeight: '600',
  },
  weekPlannerLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  weekLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  weekLegendDotAvailable: {
    backgroundColor: '#34d399',
  },
  weekLegendDotBooked: {
    backgroundColor: '#111827',
  },
  weekLegendDotBlocked: {
    backgroundColor: '#f59e0b',
  },
  weekLegendText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  weekPlannerGridShell: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  weekPlannerTimeColumn: {
    width: 58,
    marginRight: 8,
  },
  weekPlannerCornerCell: {
    height: 76,
  },
  weekPlannerTimeCell: {
    height: WEEK_PLANNER_ROW_HEIGHT,
    marginBottom: WEEK_PLANNER_ROW_GAP,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  weekPlannerTimeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  weekPlannerDayColumn: {
    width: WEEK_PLANNER_DAY_WIDTH,
    marginRight: 8,
  },
  weekPlannerDayHeader: {
    minHeight: 68,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  weekPlannerDayHeaderActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  weekPlannerDayLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 3,
  },
  weekPlannerDayLabelActive: {
    color: '#cbd5e1',
  },
  weekPlannerDayNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  weekPlannerDayNumberActive: {
    color: '#ffffff',
  },
  weekPlannerDayMeta: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
  },
  weekPlannerDayMetaActive: {
    color: '#e2e8f0',
  },
  weekPlannerCellWrap: {
    height: WEEK_PLANNER_ROW_HEIGHT,
    marginBottom: WEEK_PLANNER_ROW_GAP,
  },
  weekPlannerCell: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  weekPlannerCellAvailable: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  weekPlannerCellBlocked: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  weekPlannerCellOutside: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  weekPlannerCellContinuation: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: '#eef2f7',
    opacity: 0.35,
  },
  weekPlannerCellText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    textAlign: 'center',
  },
  weekPlannerCellTextMuted: {
    color: '#94a3b8',
  },
  weekPlannerBookedCell: {
    flex: 1,
  },
  weekAppointmentBlock: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  weekAppointmentTime: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
  },
  weekAppointmentClient: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 3,
  },
  weekAppointmentService: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  weekAppointmentOperator: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  operationalList: {
    marginTop: 12,
    gap: 10,
  },
  operationalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  operationalCardMain: {
    flex: 1,
  },
  operationalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  operationalMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 2,
  },
  operationalSubmeta: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    fontWeight: '600',
  },
  operationalBadge: {
    minWidth: 78,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
  },
  operationalBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  operationalActionsColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  operationalStatusButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  operationalStatusButtonActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  operationalStatusButtonInactive: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  operationalStatusButtonText: {
    fontSize: 11,
    fontWeight: '800',
  },
  operationalStatusButtonTextActive: {
    color: '#166534',
  },
  operationalStatusButtonTextInactive: {
    color: '#475569',
  },
  operationalDeleteButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fee2e2',
  },
  operationalDeleteButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b91c1c',
  },
  compactTopInput: {
    marginTop: 12,
  },
  quickBookingModalCard: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '88%',
    backgroundColor: '#ffffff',
    borderRadius: 30,
    padding: 20,
  },
  quickBookingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  quickBookingHeaderTextWrap: {
    flex: 1,
  },
  quickBookingContent: {
    paddingBottom: 8,
  },
  quickBookingSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginTop: 8,
    marginBottom: 8,
  },
  quickBookingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickBookingChip: {
    minWidth: '48%',
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  quickBookingChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  quickBookingChipDisabled: {
    opacity: 0.42,
  },
  quickBookingChipTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  quickBookingChipTitleActive: {
    color: '#ffffff',
  },
  quickBookingChipMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  quickBookingChipMetaActive: {
    color: '#cbd5e1',
  },
  quickBookingInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  quickCustomerChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  quickCustomerChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  quickCustomerChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  quickCustomerChipTextActive: {
    color: '#ffffff',
  },
  quickCustomerAddChip: {
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quickCustomerAddChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9a3412',
  },
  quickCustomerComposer: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  quickBookingSummaryCard: {
    marginTop: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
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
    top: 4,
  },
  dayHeaderCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  daySectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
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
  deleteSwipeAction: {
    width: 110,
    backgroundColor: '#dc2626',
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteSwipeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
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
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyAgendaStateText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    textAlign: 'center',
  },
  vacationRow: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 14,
    marginTop: 10,
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
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
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
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
  },
  modalPrimaryButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 14,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 17, 17, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});
