import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
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
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { getTodayDateString, normalizeRoleName } from '../../src/lib/booking';
import { AppLanguage, tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { getServiceAccentByMeta } from '../../src/lib/service-accents';

type ServizioItem = {
  id: string;
  nome: string;
  prezzo: number;
  prezzoOriginale?: number;
  durataMinuti?: number;
  mestiereRichiesto?: string;
};

type OperatoreItem = {
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
};

const normalizeServiceName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const normalizeOperatorName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const PRESET_ROLE_OPTIONS = [
  'Barber',
  'Hair Stylist',
  'Colorista',
  'Nails',
  'Estetica',
  'Skincare',
  'Epilazione',
  'Brows',
  'Lashes',
  'Make-up',
  'Massaggi',
  'Spa',
  'Tattoo',
  'Piercing',
  'PMU',
  'Tricologia',
  'Wellness',
];

const WEEKDAY_OPTIONS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Gio' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sab' },
  { value: 0, label: 'Dom' },
];

const ALL_WEEKDAY_VALUES = WEEKDAY_OPTIONS.map((item) => item.value);

const isIsoDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

const formatWeekdaySummary = (enabledWeekdays: number[]) => {
  const normalized = [...enabledWeekdays].sort((first, second) => first - second);

  if (normalized.length === ALL_WEEKDAY_VALUES.length) {
    return 'Tutti i giorni';
  }

  return WEEKDAY_OPTIONS.filter((item) => normalized.includes(item.value))
    .map((item) => item.label)
    .join(' · ');
};

const formatAvailabilitySummary = (operator: OperatoreItem) => {
  const enabledWeekdays = operator.availability?.enabledWeekdays ?? ALL_WEEKDAY_VALUES;
  const ranges = operator.availability?.dateRanges ?? [];
  const weekdaySummary = formatWeekdaySummary(enabledWeekdays);

  if (ranges.length === 0) {
    return weekdaySummary;
  }

  if (ranges.length === 1) {
    const [range] = ranges;
    return `${weekdaySummary} · ${range.startDate} → ${range.endDate}`;
  }

  return `${weekdaySummary} · ${ranges.length} periodi`;
};

const formatPickerButtonLabel = (prefix: string, value: string) => {
  const [year, month, day] = value.split('-');
  const monthNumber = Number(month);
  const monthLabels = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${prefix} ${day} ${monthLabels[(monthNumber || 1) - 1] ?? month} ${year}`;
};

const formatNumericFieldLabel = (label: string, value: string, suffix = '') =>
  value.trim() !== '' ? `${label} ${value}${suffix}` : label;

const parseDurataInput = (value: string) => {
  const testo = value.trim().toLowerCase().replace(/\s+/g, '');

  if (!testo) return null;

  if (testo.includes(':')) {
    const [oreRaw, minutiRaw] = testo.split(':');
    const ore = Number(oreRaw);
    const minuti = Number(minutiRaw);
    if (Number.isNaN(ore) || Number.isNaN(minuti)) return null;
    return ore * 60 + minuti;
  }

  if (testo.includes('h')) {
    const [oreRaw, minutiRaw = '0'] = testo.split('h');
    const ore = Number(oreRaw.replace(',', '.'));
    const minuti = Number(minutiRaw);
    if (Number.isNaN(ore) || Number.isNaN(minuti)) return null;
    return Math.round(ore * 60) + minuti;
  }

  if (testo.includes(',') || testo.includes('.')) {
    const ore = Number(testo.replace(',', '.'));
    if (Number.isNaN(ore)) return null;
    return Math.round(ore * 60);
  }

  const valore = Number(testo);
  if (Number.isNaN(valore)) return null;

  return valore;
};

const formatDurata = (durataMinuti: number, appLanguage: AppLanguage) => {
  if (durataMinuti === 30) return '30 min';
  if (durataMinuti === 60) return appLanguage === 'it' ? '1 ora' : '1 h';
  if (durataMinuti === 90) return appLanguage === 'it' ? '1 ora e 30' : '1 h 30';

  const ore = Math.floor(durataMinuti / 60);
  const minuti = durataMinuti % 60;

  if (ore > 0 && minuti > 0) return `${ore}h ${minuti}m`;
  if (ore > 0) {
    if (appLanguage === 'it') {
      return ore === 1 ? '1 ora' : `${ore} ore`;
    }
    return ore === 1 ? '1 h' : `${ore} h`;
  }
  return `${durataMinuti} min`;
};

export default function ServiziScreen() {
  const responsive = useResponsiveLayout();
  const {
    servizi,
    setServizi,
    appuntamenti,
    richiestePrenotazione,
    operatori,
    setOperatori,
    salonWorkspace,
    appLanguage,
  } =
    useAppContext();

  const [nome, setNome] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [prezzoOriginale, setPrezzoOriginale] = useState('');
  const [durata, setDurata] = useState('');
  const [mestiereRichiesto, setMestiereRichiesto] = useState('');
  const [serviceRolePickerOpen, setServiceRolePickerOpen] = useState(false);
  const [serviceCustomRoleOpen, setServiceCustomRoleOpen] = useState(false);
  const [servizioInModifica, setServizioInModifica] = useState<string | null>(null);
  const [nomeOperatore, setNomeOperatore] = useState('');
  const [mestiereOperatore, setMestiereOperatore] = useState('');
  const [operatorRolePickerOpen, setOperatorRolePickerOpen] = useState(false);
  const [operatorCustomRoleOpen, setOperatorCustomRoleOpen] = useState(false);
  const [operatoreInModifica, setOperatoreInModifica] = useState<string | null>(null);
  const [operatorEnabledWeekdays, setOperatorEnabledWeekdays] = useState<number[]>(
    ALL_WEEKDAY_VALUES
  );
  const [operatorAvailabilityRanges, setOperatorAvailabilityRanges] = useState<
    { id: string; startDate: string; endDate: string; label?: string }[]
  >([]);
  const [availabilityStartDate, setAvailabilityStartDate] = useState('');
  const [availabilityEndDate, setAvailabilityEndDate] = useState('');
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);
  const [serviceNumberPickerTarget, setServiceNumberPickerTarget] = useState<
    'price' | 'originalPrice' | 'duration' | null
  >(null);
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const listRef = useRef<FlatList<ServizioItem> | null>(null);
  const serviceFormOffsetRef = useRef(0);
  const operatorFormOffsetRef = useRef(0);
  const serviceNameRef = useRef<TextInput | null>(null);
  const serviceCustomRoleRef = useRef<TextInput | null>(null);
  const operatorNameRef = useRef<TextInput | null>(null);
  const operatorCustomRoleRef = useRef<TextInput | null>(null);

  const closeAllSwipeables = useCallback(() => {
    Object.values(swipeableRefs.current).forEach((ref) => ref?.close());
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        closeAllSwipeables();
      };
    }, [closeAllSwipeables])
  );

  const canSubmit = useMemo(() => {
    return (
      nome.trim() !== '' &&
      prezzo.trim() !== '' &&
      durata.trim() !== '' &&
      mestiereRichiesto.trim() !== ''
    );
  }, [durata, mestiereRichiesto, nome, prezzo]);

  const canSubmitOperatore = useMemo(
    () => nomeOperatore.trim() !== '' && mestiereOperatore.trim() !== '',
    [mestiereOperatore, nomeOperatore]
  );
  const canAddAvailabilityRange = useMemo(
    () =>
      isIsoDateInput(availabilityStartDate) &&
      isIsoDateInput(availabilityEndDate) &&
      availabilityStartDate.trim() <= availabilityEndDate.trim(),
    [availabilityEndDate, availabilityStartDate]
  );

  const roleOptions = useMemo(() => {
    const merged = [
      ...PRESET_ROLE_OPTIONS,
      ...servizi.map((item) => item.mestiereRichiesto ?? ''),
      ...operatori.map((item) => item.mestiere),
    ];

    return merged
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item, index, array) => array.findIndex((entry) => normalizeRoleName(entry) === normalizeRoleName(item)) === index);
  }, [operatori, servizi]);

  const hasMatchingServiceTarget = useCallback(
    (roleName: string) => {
      const normalizedRole = normalizeRoleName(roleName);
      if (!normalizedRole) return true;

      return servizi.some(
        (item) => normalizeRoleName(item.mestiereRichiesto ?? '') === normalizedRole
      );
    },
    [servizi]
  );

  const resetForm = () => {
    setNome('');
    setPrezzo('');
    setPrezzoOriginale('');
    setDurata('');
    setMestiereRichiesto('');
    setServiceRolePickerOpen(false);
    setServiceCustomRoleOpen(false);
    setServizioInModifica(null);
  };

  const resetOperatoreForm = () => {
    setNomeOperatore('');
    setMestiereOperatore('');
    setOperatorRolePickerOpen(false);
    setOperatorCustomRoleOpen(false);
    setOperatoreInModifica(null);
    setOperatorEnabledWeekdays(ALL_WEEKDAY_VALUES);
    setOperatorAvailabilityRanges([]);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
    setDatePickerTarget(null);
    setServiceNumberPickerTarget(null);
  };

  const salvaServizio = () => {
    if (!canSubmit) return;

    const valorePrezzo = Number(prezzo.replace(',', '.'));
    const valorePrezzoOriginale = prezzoOriginale.trim()
      ? Number(prezzoOriginale.replace(',', '.'))
      : null;
    const durataMinuti = parseDurataInput(durata);
    const nomeNormalizzato = normalizeServiceName(nome);

    if (
      Number.isNaN(valorePrezzo) ||
      (valorePrezzoOriginale !== null && Number.isNaN(valorePrezzoOriginale)) ||
      durataMinuti === null ||
      Number.isNaN(durataMinuti) ||
      durataMinuti <= 0
    ) {
      return;
    }

    const duplicato = servizi.some(
      (item) =>
        item.id !== servizioInModifica &&
        normalizeServiceName(item.nome) === nomeNormalizzato
    );

    if (duplicato) {
      Alert.alert(
        tApp(appLanguage, 'services_duplicate_title'),
        tApp(appLanguage, 'services_duplicate_body')
      );
      return;
    }

    const nextPrezzoOriginale =
      valorePrezzoOriginale !== null && valorePrezzoOriginale > valorePrezzo
        ? valorePrezzoOriginale
        : undefined;
    const nextMestiereRichiesto = mestiereRichiesto.trim();

    if (!nextMestiereRichiesto) {
      Alert.alert(
        'Mestiere obbligatorio',
        'Per salvare il servizio devi selezionare o scrivere il mestiere richiesto.'
      );
      return;
    }

    if (servizioInModifica) {
      setServizi(
        servizi.map((item) =>
          item.id === servizioInModifica
            ? {
                ...item,
                nome: nome.trim(),
                prezzo: valorePrezzo,
                prezzoOriginale: nextPrezzoOriginale,
                durataMinuti,
                mestiereRichiesto: nextMestiereRichiesto,
              }
            : item
        )
      );
    } else {
      setServizi([
        {
          id: Date.now().toString(),
          nome: nome.trim(),
          prezzo: valorePrezzo,
          prezzoOriginale: nextPrezzoOriginale,
          durataMinuti,
          mestiereRichiesto: nextMestiereRichiesto,
        },
        ...servizi,
      ]);
    }

    resetForm();
  };

  const avviaModifica = (item: ServizioItem) => {
    closeAllSwipeables();
    Keyboard.dismiss();
    setServizioInModifica(item.id);
    setNome(item.nome);
    setPrezzo(item.prezzo.toString());
    setPrezzoOriginale(item.prezzoOriginale ? item.prezzoOriginale.toString() : '');
    setDurata(String(item.durataMinuti ?? 60));
    setMestiereRichiesto(item.mestiereRichiesto ?? '');
    setServiceCustomRoleOpen(!!item.mestiereRichiesto);
    setServiceRolePickerOpen(false);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 220);
    });
    setTimeout(() => {
      serviceNameRef.current?.focus();
    }, 320);
  };

  const salvaOperatore = () => {
    if (!canSubmitOperatore) return;

    const normalizedOperatorName = normalizeOperatorName(nomeOperatore);
    const duplicateOperator = operatori.some(
      (item) =>
        item.id !== operatoreInModifica &&
        normalizeOperatorName(item.nome) === normalizedOperatorName
    );

    if (duplicateOperator) {
      Alert.alert(
        tApp(appLanguage, 'services_operator_duplicate_title'),
        tApp(appLanguage, 'services_operator_duplicate_body')
      );
      return;
    }

    if (!hasMatchingServiceTarget(mestiereOperatore.trim())) {
      Alert.alert(
        'Target servizio mancante',
        'Puoi salvare questo operatore solo se esiste già almeno un servizio con lo stesso target/mestiere scritto in modo identico.'
      );
      return;
    }

    if (operatoreInModifica) {
      setOperatori((current) =>
        current.map((item) =>
          item.id === operatoreInModifica
            ? {
                ...item,
                nome: nomeOperatore.trim(),
                mestiere: mestiereOperatore.trim(),
                availability: {
                  enabledWeekdays: [...operatorEnabledWeekdays].sort(
                    (first, second) => first - second
                  ),
                  dateRanges: operatorAvailabilityRanges,
                },
              }
            : item
        )
      );
    } else {
      setOperatori((current) => [
        {
          id: `operatore-${Date.now()}`,
          nome: nomeOperatore.trim(),
          mestiere: mestiereOperatore.trim(),
          availability: {
            enabledWeekdays: [...operatorEnabledWeekdays].sort(
              (first, second) => first - second
            ),
            dateRanges: operatorAvailabilityRanges,
          },
        },
        ...current,
      ]);
    }

    resetOperatoreForm();
  };

  const avviaModificaOperatore = (item: OperatoreItem) => {
    closeAllSwipeables();
    Keyboard.dismiss();
    setOperatoreInModifica(item.id);
    setNomeOperatore(item.nome);
    setMestiereOperatore(item.mestiere);
    setOperatorCustomRoleOpen(true);
    setOperatorRolePickerOpen(false);
    setOperatorEnabledWeekdays(item.availability?.enabledWeekdays ?? ALL_WEEKDAY_VALUES);
    setOperatorAvailabilityRanges(item.availability?.dateRanges ?? []);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
    setDatePickerTarget(null);
    listRef.current?.scrollToOffset({
      offset: Math.max(0, operatorFormOffsetRef.current - 28),
      animated: true,
    });
    setTimeout(() => {
      operatorNameRef.current?.focus();
    }, 250);
  };

  const toggleOperatorWeekday = (weekday: number) => {
    setOperatorEnabledWeekdays((current) => {
      const exists = current.includes(weekday);
      if (exists && current.length === 1) {
        return current;
      }

      return exists
        ? current.filter((item) => item !== weekday)
        : [...current, weekday].sort((first, second) => first - second);
    });
  };

  const addOperatorAvailabilityRange = () => {
    if (!canAddAvailabilityRange) return;

    setOperatorAvailabilityRanges((current) => [
      ...current,
      {
        id: `range-${Date.now()}`,
        startDate: availabilityStartDate.trim(),
        endDate: availabilityEndDate.trim(),
      },
    ]);
    setAvailabilityStartDate('');
    setAvailabilityEndDate('');
  };

  const removeOperatorAvailabilityRange = (id: string) => {
    setOperatorAvailabilityRanges((current) => current.filter((item) => item.id !== id));
  };

  const selectServiceRole = (role: string) => {
    setMestiereRichiesto(role);
    setServiceRolePickerOpen(false);
    setServiceCustomRoleOpen(false);
  };

  const selectOperatorRole = (role: string) => {
    setMestiereOperatore(role);
    setOperatorRolePickerOpen(false);
    setOperatorCustomRoleOpen(false);
  };

  const eliminaOperatore = (id: string) => {
    const operatoreDaEliminare = operatori.find((item) => item.id === id);
    if (!operatoreDaEliminare) return;

    const normalizedOperatorName = normalizeOperatorName(operatoreDaEliminare.nome);
    const today = getTodayDateString();
    const appuntamentiCollegati = appuntamenti.filter(
      (item) =>
        item.operatoreId === id ||
        normalizeOperatorName(item.operatoreNome ?? '') === normalizedOperatorName
    );
    const appuntamentiFuturiCollegati = appuntamentiCollegati.filter(
      (item) => (item.data ?? today) >= today
    );
    const richiesteCollegate = richiestePrenotazione.filter(
      (item) =>
        item.stato !== 'Rifiutata' &&
        (item.operatoreId === id ||
          normalizeOperatorName(item.operatoreNome ?? '') === normalizedOperatorName)
    );
    const richiesteAccettateFutureCollegate = richiesteCollegate.filter(
      (item) => item.stato === 'Accettata' && (item.data ?? today) >= today
    );
    const hasProtectedFutureEntries =
      appuntamentiFuturiCollegati.length > 0 || richiesteAccettateFutureCollegate.length > 0;
    const hasLinkedEntries =
      appuntamentiCollegati.length > 0 || richiesteCollegate.length > 0;

    if (hasProtectedFutureEntries) {
      Alert.alert(
        'Eliminazione bloccata',
        `${operatoreDaEliminare.nome} ha ancora appuntamenti futuri o richieste accettate collegate. Sposta o chiudi prima quelle prenotazioni, poi potrai eliminare l'operatore.`
      );
      return;
    }

    Alert.alert(
      tApp(appLanguage, 'services_operator_delete_title'),
      hasLinkedEntries
        ? tApp(appLanguage, 'services_operator_delete_body_linked', {
            operatorName: operatoreDaEliminare.nome,
          })
        : tApp(appLanguage, 'services_operator_delete_body_simple', {
            operatorName: operatoreDaEliminare.nome,
          }),
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'common_delete'),
          style: 'destructive',
          onPress: () => {
            setOperatori((current) => current.filter((item) => item.id !== id));
            if (operatoreInModifica === id) {
              resetOperatoreForm();
            }
          },
        },
      ]
    );
  };

  const confermaElimina = (item: ServizioItem) => {
    const nomeServizio = normalizeServiceName(item.nome);
    const appuntamentiCollegati = appuntamenti.filter(
      (entry) => normalizeServiceName(entry.servizio) === nomeServizio
    );
    const richiesteCollegate = richiestePrenotazione.filter(
      (entry) =>
        normalizeServiceName(entry.servizio) === nomeServizio && entry.stato !== 'Rifiutata'
    );

    const hasLinkedBookings =
      appuntamentiCollegati.length > 0 || richiesteCollegate.length > 0;

    Alert.alert(
      tApp(appLanguage, 'services_delete_title'),
      hasLinkedBookings
        ? tApp(appLanguage, 'services_delete_body_linked', { serviceName: item.nome })
        : tApp(appLanguage, 'services_delete_body_simple', { serviceName: item.nome }),
      [
        { text: tApp(appLanguage, 'common_cancel'), style: 'cancel' },
        {
          text: tApp(appLanguage, 'agenda_delete_confirm'),
          style: 'destructive',
          onPress: () => {
            setServizi(servizi.filter((servizio) => servizio.id !== item.id));
            if (servizioInModifica === item.id) {
              resetForm();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={servizi}
        numColumns={2}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          closeAllSwipeables();
        }}
        columnWrapperStyle={styles.serviceGridRow}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="servizi"
                title={tApp(appLanguage, 'tab_services')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
              />

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatCardBlue}>
                  <Text style={styles.heroStatNumber}>{servizi.length}</Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'services_active')}</Text>
                </View>

                <View style={styles.heroStatCardRose}>
                  <Text style={styles.heroStatNumber}>
                    € {(servizi[0]?.prezzo ?? 0).toFixed(0)}
                  </Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'services_last_price')}</Text>
                </View>
              </View>
              <Text style={styles.subtitle}>{tApp(appLanguage, 'services_subtitle')}</Text>
            </View>

            <View
              style={[
                styles.desktopTopGrid,
                !responsive.isDesktop && styles.desktopTopGridStack,
              ]}
            >
              <View
                style={[styles.formCard, responsive.isDesktop && styles.desktopLeftPane]}
                onLayout={(event) => {
                  serviceFormOffsetRef.current = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {servizioInModifica
                    ? tApp(appLanguage, 'services_edit')
                    : tApp(appLanguage, 'services_new')}
                </Text>

              <ClearableTextInput
                ref={serviceNameRef}
                style={styles.input}
                placeholder={tApp(appLanguage, 'services_name_placeholder')}
                placeholderTextColor="#9a9a9a"
                value={nome}
                onChangeText={setNome}
                returnKeyType={serviceCustomRoleOpen ? 'next' : 'done'}
                onSubmitEditing={() =>
                  serviceCustomRoleOpen
                    ? serviceCustomRoleRef.current?.focus()
                    : Keyboard.dismiss()
                }
                blurOnSubmit={!serviceCustomRoleOpen}
                  />

                  <TouchableOpacity
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setServiceNumberPickerTarget('price')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !prezzo && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {formatNumericFieldLabel('Prezzo', prezzo, prezzo ? ' €' : '')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setServiceNumberPickerTarget('originalPrice')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !prezzoOriginale && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {formatNumericFieldLabel(
                        'Prezzo pieno (Opzionale)',
                        prezzoOriginale,
                        prezzoOriginale ? ' €' : ''
                      )}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setServiceNumberPickerTarget('duration')}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !durata && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {formatNumericFieldLabel('Durata', durata, durata ? ' min' : '')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.input, styles.roleSelectorInput]}
                    onPress={() => setServiceRolePickerOpen((current) => !current)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.roleSelectorText,
                        !mestiereRichiesto && styles.roleSelectorPlaceholder,
                      ]}
                    >
                      {mestiereRichiesto || tApp(appLanguage, 'services_required_role_placeholder')}
                    </Text>
                    <Text style={styles.roleSelectorChevron}>
                      {serviceRolePickerOpen ? '▴' : '▾'}
                    </Text>
                  </TouchableOpacity>

                  {serviceRolePickerOpen ? (
                    <View style={styles.rolePickerPanel}>
                      <Text style={styles.rolePickerTitle}>Mestieri suggeriti</Text>
                      <View style={styles.roleChipsWrap}>
                        {roleOptions.map((role) => {
                          const selected =
                            normalizeRoleName(role) === normalizeRoleName(mestiereRichiesto);
                          return (
                            <TouchableOpacity
                              key={`service-role-${role}`}
                              style={[styles.roleChip, selected && styles.roleChipSelected]}
                              onPress={() => selectServiceRole(role)}
                              activeOpacity={0.9}
                            >
                              <Text
                                style={[
                                  styles.roleChipText,
                                  selected && styles.roleChipTextSelected,
                                ]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                              >
                                {role}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          style={[styles.roleChip, styles.roleChipCreate]}
                          onPress={() => {
                            setServiceCustomRoleOpen(true);
                            setServiceRolePickerOpen(false);
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.roleChipCreateText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>+ Crea nuovo mestiere</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {serviceCustomRoleOpen ? (
                    <ClearableTextInput
                      ref={serviceCustomRoleRef}
                      style={styles.input}
                      placeholder="Nuovo mestiere personalizzato"
                      placeholderTextColor="#9a9a9a"
                      value={mestiereRichiesto}
                      onChangeText={setMestiereRichiesto}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                  ) : null}

                  <TouchableOpacity
                    style={[styles.buttonDark, !canSubmit && styles.buttonDisabled]}
                    onPress={salvaServizio}
                    activeOpacity={0.9}
                    disabled={!canSubmit}
                  >
                    <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {servizioInModifica
                        ? tApp(appLanguage, 'services_save_changes')
                        : tApp(appLanguage, 'services_add')}
                    </Text>
                  </TouchableOpacity>

                {servizioInModifica ? (
                  <TouchableOpacity
                    style={styles.buttonLight}
                    onPress={resetForm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonLightText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'services_cancel_edit')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View
                style={[styles.formCard, responsive.isDesktop && styles.desktopRightPane]}
                onLayout={(event) => {
                  operatorFormOffsetRef.current = event.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                  {tApp(appLanguage, 'services_operators_title')}
                </Text>
                <Text style={styles.helperTextInline}>
                  {tApp(appLanguage, 'services_operators_hint')}
                </Text>
                <ClearableTextInput
                  ref={operatorNameRef}
                  style={styles.input}
                  placeholder={tApp(appLanguage, 'services_operator_name_placeholder')}
                  placeholderTextColor="#9a9a9a"
                  value={nomeOperatore}
                  onChangeText={setNomeOperatore}
                  returnKeyType={operatorCustomRoleOpen ? 'next' : 'done'}
                  onSubmitEditing={() =>
                    operatorCustomRoleOpen
                      ? operatorCustomRoleRef.current?.focus()
                      : Keyboard.dismiss()
                  }
                  blurOnSubmit={!operatorCustomRoleOpen}
                />
                <TouchableOpacity
                  style={[styles.input, styles.roleSelectorInput]}
                  onPress={() => setOperatorRolePickerOpen((current) => !current)}
                  activeOpacity={0.9}
                >
                  <Text
                    style={[
                      styles.roleSelectorText,
                      !mestiereOperatore && styles.roleSelectorPlaceholder,
                    ]}
                  >
                    {mestiereOperatore || tApp(appLanguage, 'services_operator_role_placeholder')}
                  </Text>
                  <Text style={styles.roleSelectorChevron}>
                    {operatorRolePickerOpen ? '▴' : '▾'}
                  </Text>
                </TouchableOpacity>

                {operatorRolePickerOpen ? (
                  <View style={styles.rolePickerPanel}>
                    <Text style={styles.rolePickerTitle}>Mestieri disponibili</Text>
                    <View style={styles.roleChipsWrap}>
                      {roleOptions.map((role) => {
                        const selected =
                          normalizeRoleName(role) === normalizeRoleName(mestiereOperatore);
                        return (
                          <TouchableOpacity
                            key={`operator-role-${role}`}
                            style={[styles.roleChip, selected && styles.roleChipSelected]}
                            onPress={() => selectOperatorRole(role)}
                            activeOpacity={0.9}
                          >
                            <Text
                              style={[
                                styles.roleChipText,
                                selected && styles.roleChipTextSelected,
                              ]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.72}
                            >
                              {role}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        style={[styles.roleChip, styles.roleChipCreate]}
                        onPress={() => {
                          setOperatorCustomRoleOpen(true);
                          setOperatorRolePickerOpen(false);
                        }}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.roleChipCreateText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>+ Crea nuovo mestiere</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {operatorCustomRoleOpen ? (
                  <ClearableTextInput
                    ref={operatorCustomRoleRef}
                    style={styles.input}
                    placeholder="Nuovo mestiere personalizzato"
                    placeholderTextColor="#9a9a9a"
                    value={mestiereOperatore}
                    onChangeText={setMestiereOperatore}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                ) : null}

                <View style={styles.operatorAvailabilityPanel}>
                  <Text style={styles.operatorAvailabilityTitle}>Disponibilita settimanale</Text>
                  <Text style={styles.operatorAvailabilityHint}>
                    Scegli i giorni in cui questo operatore puo comparire in agenda e nelle prenotazioni.
                  </Text>
                  <View style={styles.weekdayChipsWrap}>
                    {WEEKDAY_OPTIONS.map((day) => {
                      const selected = operatorEnabledWeekdays.includes(day.value);
                      return (
                        <TouchableOpacity
                          key={`weekday-${day.value}`}
                          style={[styles.weekdayChip, selected && styles.weekdayChipActive]}
                          onPress={() => toggleOperatorWeekday(day.value)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[
                              styles.weekdayChipText,
                              selected && styles.weekdayChipTextActive,
                            ]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                          >
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.operatorAvailabilityTitle}>Periodo attivo da-a</Text>
                  <Text style={styles.operatorAvailabilityHint}>
                    Se lasci vuoto, l&apos;operatore resta valido tutto l&apos;anno nei giorni selezionati.
                  </Text>

                  <View
                    style={[
                      styles.operatorAvailabilityRangeRow,
                      !responsive.isDesktop && styles.operatorAvailabilityRangeColumn,
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.input,
                        styles.operatorAvailabilityInput,
                        styles.operatorAvailabilityDateButton,
                        !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                      ]}
                      onPress={() => setDatePickerTarget('start')}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.operatorAvailabilityDateButtonText,
                          !availabilityStartDate && styles.operatorAvailabilityDateButtonPlaceholder,
                        ]}
                      >
                        {availabilityStartDate
                          ? formatPickerButtonLabel('Dal', availabilityStartDate)
                          : 'Seleziona inizio'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.input,
                        styles.operatorAvailabilityInput,
                        styles.operatorAvailabilityDateButton,
                        !responsive.isDesktop && styles.operatorAvailabilityInputFull,
                      ]}
                      onPress={() => setDatePickerTarget('end')}
                      activeOpacity={0.9}
                    >
                      <Text
                        style={[
                          styles.operatorAvailabilityDateButtonText,
                          !availabilityEndDate && styles.operatorAvailabilityDateButtonPlaceholder,
                        ]}
                      >
                        {availabilityEndDate
                          ? formatPickerButtonLabel('Al', availabilityEndDate)
                          : 'Seleziona fine'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.operatorAvailabilityAddButton,
                      !canAddAvailabilityRange && styles.buttonDisabled,
                    ]}
                    onPress={addOperatorAvailabilityRange}
                    activeOpacity={0.9}
                    disabled={!canAddAvailabilityRange}
                  >
                    <Text style={styles.operatorAvailabilityAddText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Aggiungi periodo</Text>
                  </TouchableOpacity>

                  {operatorAvailabilityRanges.length > 0 ? (
                    <View style={styles.operatorRangeList}>
                      {operatorAvailabilityRanges.map((range) => (
                        <View key={range.id} style={styles.operatorRangeCard}>
                          <Text style={styles.operatorRangeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                            {range.startDate} → {range.endDate}
                          </Text>
                          <TouchableOpacity
                            onPress={() => removeOperatorAvailabilityRange(range.id)}
                            activeOpacity={0.9}
                            style={styles.operatorRangeDelete}
                          >
                            <Text style={styles.operatorRangeDeleteText}>X</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.operatorAvailabilityEmpty}>
                      Nessun periodo specifico: vale tutto l&apos;anno.
                    </Text>
                  )}
                </View>

                <NativeDatePickerModal
                  visible={datePickerTarget !== null}
                  title={
                    datePickerTarget === 'start'
                      ? 'Seleziona data inizio'
                      : 'Seleziona data fine'
                  }
                  initialValue={
                    datePickerTarget === 'start'
                      ? availabilityStartDate
                      : datePickerTarget === 'end'
                        ? availabilityEndDate
                        : undefined
                  }
                  onClose={() => setDatePickerTarget(null)}
                  onConfirm={(value) => {
                    if (datePickerTarget === 'start') {
                      setAvailabilityStartDate(value);
                      if (availabilityEndDate && availabilityEndDate < value) {
                        setAvailabilityEndDate(value);
                      }
                    }

                    if (datePickerTarget === 'end') {
                      setAvailabilityEndDate(value);
                      if (availabilityStartDate && availabilityStartDate > value) {
                        setAvailabilityStartDate(value);
                      }
                    }

                    setDatePickerTarget(null);
                  }}
                />

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'price'}
                  title="Prezzo servizio"
                  initialValue={prezzo ? Number(prezzo.replace(',', '.')) : 25}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setPrezzo(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={0}
                  max={500}
                  step={1}
                  gridStep={1}
                  decimals={0}
                  suffix=" €"
                  presets={[15, 20, 25, 30, 35, 40, 50, 60, 80, 100]}
                />

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'originalPrice'}
                  title="Prezzo pieno"
                  initialValue={prezzoOriginale ? Number(prezzoOriginale.replace(',', '.')) : 35}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setPrezzoOriginale(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={0}
                  max={500}
                  step={1}
                  gridStep={1}
                  decimals={0}
                  suffix=" €"
                  presets={[20, 25, 30, 35, 40, 50, 60, 80, 100, 120]}
                />

                <NumberPickerModal
                  visible={serviceNumberPickerTarget === 'duration'}
                  title="Durata servizio"
                  initialValue={durata ? Number(durata) : 60}
                  onClose={() => setServiceNumberPickerTarget(null)}
                  onConfirm={(value) => {
                    setDurata(value);
                    setServiceNumberPickerTarget(null);
                  }}
                  min={15}
                  max={360}
                  step={15}
                  gridStep={1}
                  decimals={0}
                  suffix=" min"
                  presets={[15, 30, 45, 60, 75, 90, 120, 150, 180]}
                />

                <TouchableOpacity
                  style={[styles.buttonDark, !canSubmitOperatore && styles.buttonDisabled]}
                  onPress={salvaOperatore}
                  activeOpacity={0.9}
                  disabled={!canSubmitOperatore}
                >
                  <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {operatoreInModifica
                      ? tApp(appLanguage, 'services_save_operator')
                      : tApp(appLanguage, 'services_add_operator')}
                  </Text>
                </TouchableOpacity>
                {operatoreInModifica ? (
                  <TouchableOpacity
                    style={styles.buttonLight}
                    onPress={resetOperatoreForm}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.buttonLightText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                      {tApp(appLanguage, 'services_cancel_edit')}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.operatorsList}>
                  {operatori.length === 0 ? (
                    <Text style={styles.helperTextInline}>
                      {tApp(appLanguage, 'services_no_operators')}
                    </Text>
                  ) : (
                    operatori.map((item) => {
                      const accent = getServiceAccentByMeta({ roleName: item.mestiere });

                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.operatorCard,
                            {
                              backgroundColor: accent.bg,
                              borderColor: accent.border,
                            },
                          ]}
                        >
                          <View style={styles.operatorCardTextWrap}>
                            <View style={styles.operatorCardHeaderRow}>
                              <Text
                                style={[styles.operatorName, { color: accent.text }]}
                                numberOfLines={1}
                              >
                                {item.nome}
                              </Text>
                              <View style={styles.operatorCardActions}>
                                <TouchableOpacity
                                  style={styles.operatorActionChip}
                                  onPress={() => avviaModificaOperatore(item)}
                                  activeOpacity={0.9}
                                >
                                  <Text style={styles.operatorActionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                                    {tApp(appLanguage, 'common_edit')}
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.operatorActionChip, styles.operatorDeleteChip]}
                                  onPress={() => eliminaOperatore(item.id)}
                                  activeOpacity={0.9}
                                >
                                  <Text style={styles.operatorDeleteText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Elimina</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                            <Text style={[styles.operatorRole, { color: accent.text }]} numberOfLines={1}>
                              {item.mestiere}
                            </Text>
                            <Text style={[styles.operatorAvailabilitySummary, { color: accent.text }]}>
                              {formatAvailabilitySummary(item)}
                            </Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'services_quick_notes')}</Text>
              <Text style={styles.helperTextInline}>
                {tApp(appLanguage, 'services_notes_duration')}
              </Text>
              <Text style={styles.helperTextInline}>
                {tApp(appLanguage, 'services_notes_swipe')}
              </Text>
              <Text style={styles.helperTextInline}>
                {tApp(appLanguage, 'services_notes_existing')}
              </Text>
              <Text style={styles.helperTextInline}>
                {tApp(appLanguage, 'services_notes_discount')}
              </Text>
              <Text style={styles.helperTextInline}>
                {tApp(appLanguage, 'services_notes_operator_match')}
              </Text>
              </View>

            <Text style={styles.listTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'services_list')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.serviceGridItem}>
          <Swipeable
            ref={(ref) => {
              swipeableRefs.current[item.id] = ref;
            }}
            renderRightActions={() => (
              <View style={styles.swipeActions}>
                <TouchableOpacity
                  style={styles.editSwipeAction}
                  onPress={() => avviaModifica(item)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.editSwipeText}>Modifica</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteSwipeAction}
                  onPress={() => confermaElimina(item)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.deleteSwipeText}>Elimina</Text>
                </TouchableOpacity>
              </View>
            )}
            overshootRight={false}
            rightThreshold={40}
          >
            {(() => {
              const accent = getServiceAccentByMeta({
                serviceName: item.nome,
                roleName: item.mestiereRichiesto,
              });

              return (
            <View
              style={[
                styles.itemCard,
                styles.itemCardShell,
                {
                  maxWidth: responsive.contentMaxWidth,
                  backgroundColor: accent.bg,
                  borderColor: accent.border,
                },
              ]}
            >
              <View style={styles.itemLeft}>
                <Text
                  style={[styles.serviceName, { color: accent.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.68}
                >
                  {item.nome}
                </Text>
                {item.mestiereRichiesto ? (
                  <Text
                    style={[
                      styles.serviceRoleBadge,
                      {
                        backgroundColor: 'rgba(255,255,255,0.72)',
                        color: accent.text,
                        borderColor: accent.border,
                      },
                    ]}
                  >
                    {item.mestiereRichiesto}
                  </Text>
                ) : null}
                <Text style={[styles.serviceHint, { color: accent.text }]}>
                  {tApp(appLanguage, 'services_duration_label')}: {formatDurata(item.durataMinuti ?? 60, appLanguage)}
                </Text>
              </View>

              <View style={styles.priceWrap}>
                {item.prezzoOriginale && item.prezzoOriginale > item.prezzo ? (
                  <>
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>Sconto</Text>
                    </View>
                    <Text style={styles.servicePriceOriginal}>€ {item.prezzoOriginale.toFixed(2)}</Text>
                  </>
                ) : null}
                <Text style={[styles.servicePrice, { color: accent.text }]}>€ {item.prezzo.toFixed(2)}</Text>
              </View>
            </View>
              );
            })()}
          </Swipeable>
          </View>
        )}
        ListFooterComponent={<View style={{ height: 18 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  content: {
    paddingTop: 54,
    paddingBottom: 140,
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
    paddingBottom: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#9a6b32',
    marginBottom: 8,
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
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 320,
    fontSize: 13,
    color: '#6f7b8d',
    lineHeight: 19,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    marginBottom: 2,
    gap: 10,
  },
  heroStatCardBlue: {
    flex: 1,
    backgroundColor: '#dcecff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c9defa',
  },
  heroStatCardRose: {
    flex: 1,
    backgroundColor: '#ffdfe8',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f6c9d7',
  },
  heroStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#5f564d',
    fontWeight: '700',
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    backgroundColor: '#fbfdff',
    borderRadius: 30,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#dfe7f1',
  },
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  desktopTopGridStack: {
    flexDirection: 'column',
    marginBottom: 0,
  },
  desktopLeftPane: {
    flex: 1.05,
    marginRight: 16,
    marginBottom: 0,
  },
  desktopRightPane: {
    flex: 0.95,
    marginBottom: 0,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1a1816',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f8f7f4',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 12,
    color: '#111111',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#f1f3f6',
  },
  numericPickerField: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericPickerFieldText: {
    fontSize: 15,
    color: '#111111',
    fontWeight: '700',
    textAlign: 'center',
  },
  numericPickerFieldPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  roleSelectorInput: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roleSelectorText: {
    flex: 1,
    fontSize: 15,
    color: '#111111',
    fontWeight: '700',
    textAlign: 'center',
  },
  roleSelectorPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  roleSelectorChevron: {
    fontSize: 18,
    color: '#475569',
    fontWeight: '800',
    marginLeft: 8,
  },
  rolePickerPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  rolePickerTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 10,
  },
  roleChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  roleChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dde6ef',
  },
  roleChipSelected: {
    backgroundColor: '#161616',
    borderColor: '#161616',
  },
  roleChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  roleChipTextSelected: {
    color: '#ffffff',
  },
  roleChipCreate: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  roleChipCreateText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  buttonDark: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  buttonDarkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonLight: {
    backgroundColor: '#eef2f7',
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  buttonLightText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  helperText: {
    fontSize: 13,
    color: '#6d6257',
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '600',
  },
  helperTextInline: {
    fontSize: 13,
    color: '#6d6257',
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  operatorAvailabilityPanel: {
    backgroundColor: '#f8fafc',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  operatorAvailabilityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  operatorAvailabilityHint: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  weekdayChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 10,
  },
  weekdayChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  weekdayChipActive: {
    backgroundColor: '#161616',
    borderColor: '#161616',
  },
  weekdayChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  weekdayChipTextActive: {
    color: '#ffffff',
  },
  operatorAvailabilityRangeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
  operatorAvailabilityRangeColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  operatorAvailabilityInput: {
    flex: 1,
    minWidth: 0,
  },
  operatorAvailabilityInputFull: {
    width: '100%',
  },
  operatorAvailabilityDateButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorAvailabilityDateButtonText: {
    fontSize: 15,
    color: '#111111',
    fontWeight: '700',
    textAlign: 'center',
  },
  operatorAvailabilityDateButtonPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  operatorAvailabilityAddButton: {
    backgroundColor: '#dcecff',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#c9defa',
  },
  operatorAvailabilityAddText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  operatorRangeList: {
    marginTop: 2,
  },
  operatorRangeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  operatorRangeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'left',
  },
  operatorRangeDelete: {
    marginLeft: 10,
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  operatorRangeDeleteText: {
    color: '#991b1b',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  operatorAvailabilityEmpty: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    marginTop: 6,
    marginBottom: 10,
    textAlign: 'center',
  },
  serviceGridRow: {
    justifyContent: 'space-between',
    width: '100%',
  },
  serviceGridItem: {
    width: '48.4%',
  },
  swipeActions: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  editSwipeAction: {
    backgroundColor: '#dcecff',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 84,
  },
  editSwipeText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  deleteSwipeAction: {
    backgroundColor: '#c93c3c',
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
  },
  deleteSwipeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    minHeight: 182,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.035,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  itemCardShell: {
    width: '100%',
  },
  itemLeft: {
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  serviceHint: {
    fontSize: 12,
    color: '#6b6b6b',
    fontWeight: '700',
    textAlign: 'center',
  },
  serviceRoleBadge: {
    backgroundColor: '#eef2f7',
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
    textAlign: 'center',
    borderWidth: 1,
  },
  priceWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginBottom: 3,
  },
  discountBadgeText: {
    color: '#991b1b',
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'center',
  },
  servicePriceOriginal: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '700',
    textDecorationLine: 'line-through',
    marginBottom: 4,
    textAlign: 'center',
  },
  servicePrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
  },
  operatorsList: {
    marginTop: 8,
  },
  operatorCard: {
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  operatorCardTextWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
  },
  operatorCardHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  operatorName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'left',
  },
  operatorRole: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'left',
    marginBottom: 4,
  },
  operatorAvailabilitySummary: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'left',
    opacity: 0.86,
  },
  operatorCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 8,
  },
  operatorActionChip: {
    backgroundColor: 'rgba(255,255,255,0.74)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.88)',
  },
  operatorActionText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  operatorDeleteChip: {
    backgroundColor: 'rgba(254,226,226,0.84)',
    borderColor: 'rgba(252,165,165,0.86)',
  },
  operatorDeleteText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
  },
});
