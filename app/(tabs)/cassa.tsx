import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';

type MetodoPagamento = 'Contanti' | 'Carta' | 'Bonifico';

type SuggerimentoDescrizione = {
  id: string;
  label: string;
  value: string;
  prezzo?: number;
};

const METODI_PAGAMENTO: MetodoPagamento[] = ['Contanti', 'Carta', 'Bonifico'];

const resolveMovementDate = (movement: { id: string; createdAt?: string }) => {
  if (movement.createdAt) {
    const createdDate = new Date(movement.createdAt);
    if (!Number.isNaN(createdDate.getTime())) return createdDate;
  }

  const timestamp = Number(movement.id);
  if (!Number.isNaN(timestamp)) return new Date(timestamp);

  const autoCashoutMatch = movement.id.match(/^auto-cashout-.+-(\d{4}-\d{2}-\d{2})$/);
  if (autoCashoutMatch) {
    const fallbackDate = new Date(`${autoCashoutMatch[1]}T23:59:00`);
    if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate;
  }

  return null;
};

const formatMovementStamp = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'Movimento registrato';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(resolvedDate);
};

const getMovementDateKey = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'senza-data';

  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(resolvedDate);
};

const formatMovementDateLabel = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'Data non disponibile';

  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(resolvedDate);
};

export default function CassaScreen() {
  const responsive = useResponsiveLayout();
  const {
    movimenti,
    setMovimenti,
    servizi,
    clienti,
    carteCollegate,
    setCarteCollegate,
    salonWorkspace,
    setSalonWorkspace,
    appLanguage,
  } = useAppContext();

  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('Contanti');
  const [cartaSelezionataId, setCartaSelezionataId] = useState<string | null>(null);
  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [nomeCarta, setNomeCarta] = useState('');
  const [circuitoCarta, setCircuitoCarta] = useState('');
  const [ultime4, setUltime4] = useState('');
  const [campoAttivo, setCampoAttivo] = useState<'descrizione' | 'ricerca' | null>(null);
  const listRef = useRef<FlatList<(typeof movimentiFiltrati)[number]> | null>(null);
  const cardNameRef = useRef<TextInput | null>(null);
  const cardCircuitRef = useRef<TextInput | null>(null);
  const cardLast4Ref = useRef<TextInput | null>(null);
  const incomeDescriptionRef = useRef<TextInput | null>(null);
  const searchMovementRef = useRef<TextInput | null>(null);
  const metodoPagamentoLabels: Record<MetodoPagamento, string> = {
    Contanti: tApp(appLanguage, 'payment_method_cash'),
    Carta: tApp(appLanguage, 'payment_method_card'),
    Bonifico: tApp(appLanguage, 'payment_method_transfer'),
  };

  const cartaPredefinita = useMemo(
    () => carteCollegate.find((item) => item.predefinita) ?? carteCollegate[0] ?? null,
    [carteCollegate]
  );

  const cartaAttiva = useMemo(() => {
    if (!cartaSelezionataId) return cartaPredefinita;
    return carteCollegate.find((item) => item.id === cartaSelezionataId) ?? cartaPredefinita;
  }, [cartaPredefinita, cartaSelezionataId, carteCollegate]);

  const totale = useMemo(() => {
    return movimenti.reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const incassoCarta = useMemo(() => {
    return movimenti
      .filter((item) => item.metodo === 'Carta')
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const incassoContanti = useMemo(() => {
    return movimenti
      .filter((item) => item.metodo === 'Contanti')
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const daChiudere = useMemo(() => {
    return movimenti
      .filter((item) => !item.metodo)
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const canAdd = useMemo(() => {
    if (descrizione.trim() === '' || importo.trim() === '') return false;
    if (metodoPagamento === 'Carta' && !cartaAttiva) return false;
    return true;
  }, [descrizione, importo, metodoPagamento, cartaAttiva]);

  const canSaveCard = useMemo(() => {
    return (
      nomeCarta.trim() !== '' &&
      circuitoCarta.trim() !== '' &&
      ultime4.trim().length === 4
    );
  }, [nomeCarta, circuitoCarta, ultime4]);

  const movimentiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) return movimenti;

    return movimenti.filter((movimento) => {
      return (
        movimento.descrizione.toLowerCase().includes(testo) ||
        movimento.importo.toString().includes(testo) ||
        (movimento.metodo ?? '').toLowerCase().includes(testo) ||
        (movimento.cartaLabel ?? '').toLowerCase().includes(testo)
      );
    });
  }, [movimenti, ricerca]);

  const movimentiOrdinati = useMemo(
    () =>
      [...movimentiFiltrati].sort((first, second) => {
        const firstPending = first.metodo ? 1 : 0;
        const secondPending = second.metodo ? 1 : 0;
        if (firstPending !== secondPending) return firstPending - secondPending;

        const firstTime = resolveMovementDate(first)?.getTime() ?? Number.NaN;
        const secondTime = resolveMovementDate(second)?.getTime() ?? Number.NaN;
        if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
          return secondTime - firstTime;
        }

        return second.id.localeCompare(first.id);
      }),
    [movimentiFiltrati]
  );

  const suggerimentiDescrizione = useMemo<SuggerimentoDescrizione[]>(() => {
    const testo = descrizione.trim().toLowerCase();
    const suggerimentiServizi = servizi
      .filter((servizio) => (testo ? servizio.nome.toLowerCase().includes(testo) : true))
      .map((servizio) => ({
        id: `servizio-${servizio.id}`,
        label: `${servizio.nome} · € ${servizio.prezzo.toFixed(2)}`,
        value: servizio.nome,
        prezzo: servizio.prezzo,
      }));

    const suggerimentiMovimenti = movimenti
      .filter((movimento) =>
        testo ? movimento.descrizione.toLowerCase().includes(testo) : true
      )
      .map((movimento) => ({
        id: `movimento-${movimento.id}`,
        label: movimento.descrizione,
        value: movimento.descrizione,
      }));

    const suggerimentiClienti = clienti
      .filter((cliente) => (testo ? cliente.nome.toLowerCase().includes(testo) : true))
      .map((cliente) => ({
        id: `cliente-${cliente.id}`,
        label: `${cliente.nome} · ${cliente.telefono}`,
        value: cliente.nome,
      }));

    return [...suggerimentiServizi, ...suggerimentiMovimenti, ...suggerimentiClienti]
      .filter(
        (suggerimento, index, array) =>
          array.findIndex((item) => item.value === suggerimento.value) === index
      )
      .slice(0, 6);
  }, [clienti, descrizione, movimenti, servizi]);

  const suggerimentiRicerca = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    return movimenti
      .filter((movimento) =>
        testo
          ? movimento.descrizione.toLowerCase().includes(testo) ||
            movimento.importo.toString().includes(testo) ||
            (movimento.metodo ?? '').toLowerCase().includes(testo) ||
            (movimento.cartaLabel ?? '').toLowerCase().includes(testo)
          : true
      )
      .slice(0, 6);
  }, [movimenti, ricerca]);

  const closeActiveSuggestions = useCallback(() => {
    Keyboard.dismiss();
    setCampoAttivo(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        closeActiveSuggestions();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      };
    }, [closeActiveSuggestions])
  );

  const aggiungiMovimento = () => {
    if (!canAdd) return;

    const valore = Number(importo.replace(',', '.'));
    if (Number.isNaN(valore)) return;

    const nuovoMovimento = {
      id: Date.now().toString(),
      descrizione: descrizione.trim(),
      importo: valore,
      metodo: metodoPagamento,
      cartaLabel: metodoPagamento === 'Carta' ? cartaAttiva?.nome : undefined,
      createdAt: new Date().toISOString(),
    };

    setMovimenti([nuovoMovimento, ...movimenti]);
    setDescrizione('');
    setImporto('');
    setCampoAttivo(null);
  };

  const salvaCarta = () => {
    if (!canSaveCard) return;

    const nuovaCarta = {
      id: Date.now().toString(),
      nome: nomeCarta.trim(),
      circuito: circuitoCarta.trim(),
      ultime4: ultime4.trim(),
      predefinita: carteCollegate.length === 0,
    };

    setCarteCollegate([nuovaCarta, ...carteCollegate.map((item) => ({ ...item, predefinita: false }))]);
    setCartaSelezionataId(nuovaCarta.id);
    setNomeCarta('');
    setCircuitoCarta('');
    setUltime4('');
  };

  const impostaCartaPredefinita = (id: string) => {
    setCarteCollegate(
      carteCollegate.map((item) => ({
        ...item,
        predefinita: item.id === id,
      }))
    );
    setCartaSelezionataId(id);
  };

  const eliminaCarta = (id: string) => {
    const restante = carteCollegate.filter((item) => item.id !== id);
    const primaRestante = restante[0];

    setCarteCollegate(
      restante.map((item) => ({
        ...item,
        predefinita: primaRestante ? item.id === primaRestante.id : false,
      }))
    );

    if (cartaSelezionataId === id) {
      setCartaSelezionataId(primaRestante?.id ?? null);
    }
  };

  const selezionaServizio = (nome: string, prezzo: number) => {
    setDescrizione(nome);
    setImporto(prezzo.toString());
  };

  const selezionaSuggerimentoDescrizione = (item: SuggerimentoDescrizione) => {
    setDescrizione(item.value);
    if (typeof item.prezzo === 'number') {
      setImporto(item.prezzo.toString());
    }
    setCampoAttivo(null);
  };

  const assegnaMetodoMovimento = (id: string, metodo: MetodoPagamento) => {
    setMovimenti(
      movimenti.map((item) =>
        item.id === id
          ? {
              ...item,
              metodo,
              cartaLabel: metodo === 'Carta' ? cartaAttiva?.nome : undefined,
            }
          : item
      )
    );
  };

  const getMovementTitle = useCallback((description: string) => {
    if (description.startsWith('Incasso automatico fine giornata')) {
      return 'Chiusura giornata';
    }

    return description;
  }, []);

  const handleCashSectionToggle = useCallback(() => {
    if (salonWorkspace.cashSectionDisabled) {
      Alert.alert(
        'Riattiva sezione Cassa',
        'La schermata Cassa tornerà visibile con tutti i contenuti e i movimenti registrati.',
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Riattiva',
            onPress: () => {
              setSalonWorkspace((current) => ({
                ...current,
                cashSectionDisabled: false,
                updatedAt: new Date().toISOString(),
              }));
            },
          },
        ]
      );
      return;
    }

    Alert.alert(
      'Disabilita sezione Cassa',
      'Questa schermata non è collegata direttamente a banca o conto corrente. Se usi già un gestionale contabile esterno collegato elettronicamente con la banca, puoi nascondere tutta la sezione Cassa mantenendo visibile solo il tab.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Disabilita',
          style: 'destructive',
          onPress: () => {
            setSalonWorkspace((current) => ({
              ...current,
              cashSectionDisabled: true,
              updatedAt: new Date().toISOString(),
            }));
          },
        },
      ]
    );
  }, [salonWorkspace.cashSectionDisabled, setSalonWorkspace]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={salonWorkspace.cashSectionDisabled ? [] : movimentiOrdinati}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={closeActiveSuggestions}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="cassa"
                title={tApp(appLanguage, 'tab_cash')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                iconOffsetY={2}
              />

              <View style={styles.heroStatsRow}>
                <View style={styles.heroStatCardMint}>
                  <Text style={styles.heroStatNumber}>€ {totale.toFixed(0)}</Text>
                  <Text style={styles.heroStatLabel}>{tApp(appLanguage, 'cash_total_income')}</Text>
                </View>

                <View style={styles.heroStatCardBlue}>
                  <Text style={styles.heroStatNumber}>€ {incassoCarta.toFixed(0)}</Text>
                  <Text style={styles.heroStatLabel}>{tApp(appLanguage, 'cash_card_payments')}</Text>
                </View>
              </View>

              <View style={styles.heroStatsRowBottom}>
                <View style={styles.heroMiniChip}>
                  <Text style={styles.heroMiniChipText}>{tApp(appLanguage, 'cash_cash_chip')} € {incassoContanti.toFixed(0)}</Text>
                </View>
                <View style={styles.heroMiniChip}>
                  <Text style={styles.heroMiniChipText}>{tApp(appLanguage, 'cash_to_close_chip')} € {daChiudere.toFixed(0)}</Text>
                </View>
                <View style={styles.heroMiniChip}>
                  <Text style={styles.heroMiniChipText}>
                    {tApp(appLanguage, 'cash_linked_cards_chip')} {carteCollegate.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.subtitle}>{tApp(appLanguage, 'cash_subtitle')}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.cashDisableCard,
                salonWorkspace.cashSectionDisabled && styles.cashDisableCardActive,
              ]}
              onPress={handleCashSectionToggle}
              activeOpacity={0.92}
            >
              <View style={styles.cashDisableHeader}>
                <Text style={styles.cashDisableEyebrow}>Visibilità sezione</Text>
                <Text style={styles.cashDisableTitle}>
                  {salonWorkspace.cashSectionDisabled
                    ? 'Sezione Cassa disabilitata'
                    : 'Disabilita Sezione Cassa'}
                </Text>
                <View
                  style={[
                    styles.cashDisableBadge,
                    salonWorkspace.cashSectionDisabled
                      ? styles.cashDisableBadgeActive
                      : styles.cashDisableBadgeIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.cashDisableBadgeText,
                      salonWorkspace.cashSectionDisabled
                        ? styles.cashDisableBadgeTextActive
                        : styles.cashDisableBadgeTextIdle,
                    ]}
                  >
                    {salonWorkspace.cashSectionDisabled ? 'Attiva' : 'Visibile'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cashDisableText}>
                Questa sezione non è collegata direttamente alla banca o al conto corrente, quindi
                le registrazioni vanno gestite manualmente. Se usi già un altro gestionale
                contabile collegato elettronicamente con la banca, puoi nascondere tutta questa
                schermata lasciando visibile solo il tab.
              </Text>

              <View
                style={[
                  styles.cashDisableButton,
                  salonWorkspace.cashSectionDisabled && styles.cashDisableButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.cashDisableButtonText,
                    salonWorkspace.cashSectionDisabled && styles.cashDisableButtonTextActive,
                  ]}
                >
                  {salonWorkspace.cashSectionDisabled ? 'Riattiva contenuto Cassa' : 'Nascondi tutto il contenuto Cassa'}
                </Text>
              </View>
            </TouchableOpacity>

            {salonWorkspace.cashSectionDisabled ? (
              <View style={styles.cashHiddenCard}>
                <Text style={styles.cashHiddenTitle}>Contenuto Cassa nascosto</Text>
                <Text style={styles.cashHiddenText}>
                  Il tab resta visibile, ma questa sezione è stata disabilitata per questo salone.
                  Puoi riattivarla in qualsiasi momento dal blocco qui sopra.
                </Text>
              </View>
            ) : null}

            {!salonWorkspace.cashSectionDisabled ? (
              <View
                style={[
                  styles.desktopTopGrid,
                  !responsive.isDesktop && styles.desktopTopGridStack,
                ]}
              >
                <View style={[styles.desktopLeftPane, !responsive.isDesktop && styles.desktopPaneStack]}>
                  <View style={styles.card}>
                  <Text style={styles.cardTitle}>{tApp(appLanguage, 'cash_linked_card_title')}</Text>
                  <Text style={styles.cardHint}>
                    {tApp(appLanguage, 'cash_linked_card_hint')}
                  </Text>

                  <TextInput
                    ref={cardNameRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_name_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={nomeCarta}
                    onChangeText={setNomeCarta}
                    returnKeyType="next"
                    onSubmitEditing={() => cardCircuitRef.current?.focus()}
                    blurOnSubmit={false}
                  />

                  <TextInput
                    ref={cardCircuitRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_circuit_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={circuitoCarta}
                    onChangeText={setCircuitoCarta}
                    returnKeyType="next"
                    onSubmitEditing={() => cardLast4Ref.current?.focus()}
                    blurOnSubmit={false}
                  />

                  <TextInput
                    ref={cardLast4Ref}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_last4_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={ultime4}
                    onChangeText={setUltime4}
                    keyboardType="numeric"
                    maxLength={4}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <TouchableOpacity
                    style={[styles.buttonDark, !canSaveCard && styles.buttonDisabled]}
                    onPress={salvaCarta}
                    activeOpacity={0.9}
                    disabled={!canSaveCard}
                  >
                    <Text style={styles.buttonDarkText}>{tApp(appLanguage, 'cash_connect_card')}</Text>
                  </TouchableOpacity>

                  {carteCollegate.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.cardsRow}
                      keyboardDismissMode="on-drag"
                      onScrollBeginDrag={closeActiveSuggestions}
                    >
                      {carteCollegate.map((item) => {
                        const active = cartaAttiva?.id === item.id;

                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.linkedCard, active && styles.linkedCardActive]}
                            onPress={() => impostaCartaPredefinita(item.id)}
                            activeOpacity={0.9}
                          >
                            <Text style={styles.linkedCardCircuit}>{item.circuito}</Text>
                            <Text style={styles.linkedCardName}>{item.nome}</Text>
                            <Text style={styles.linkedCardDigits}>•••• {item.ultime4}</Text>
                            <Text style={styles.linkedCardHint}>
                              {item.predefinita
                                ? tApp(appLanguage, 'cash_card_default')
                                : tApp(appLanguage, 'cash_card_tap_to_activate')}
                            </Text>
                            <TouchableOpacity
                              style={styles.linkedCardDelete}
                              onPress={() => eliminaCarta(item.id)}
                              activeOpacity={0.9}
                            >
                              <Text style={styles.linkedCardDeleteText}>
                                {tApp(appLanguage, 'cash_remove_card')}
                              </Text>
                            </TouchableOpacity>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  ) : null}
                  </View>

                  <View style={styles.card}>
                  <Text style={styles.cardTitle}>{tApp(appLanguage, 'cash_new_income_title')}</Text>
                  <Text style={styles.cardHint}>
                    {tApp(appLanguage, 'cash_new_income_hint')}
                  </Text>

                  <TextInput
                    ref={incomeDescriptionRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_description_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={descrizione}
                    onChangeText={setDescrizione}
                    onFocus={() => setCampoAttivo('descrizione')}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {campoAttivo === 'descrizione' && suggerimentiDescrizione.length > 0 ? (
                    <View style={styles.suggestionBox}>
                      {suggerimentiDescrizione.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.suggestionItem}
                          onPress={() => selezionaSuggerimentoDescrizione(item)}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.suggestionText}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setShowAmountPicker(true)}
                    activeOpacity={0.9}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !importo && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {importo ? `Importo € ${importo}` : tApp(appLanguage, 'cash_amount_placeholder')}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.methodsRow}>
                    {METODI_PAGAMENTO.map((item) => {
                      const selected = item === metodoPagamento;

                      return (
                        <TouchableOpacity
                          key={item}
                          style={[styles.methodChip, selected && styles.methodChipActive]}
                          onPress={() => setMetodoPagamento(item)}
                          activeOpacity={0.9}
                        >
                          <Text
                            style={[styles.methodChipText, selected && styles.methodChipTextActive]}
                          >
                            {metodoPagamentoLabels[item]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {metodoPagamento === 'Carta' ? (
                    <View style={styles.autoCardBox}>
                      <Text style={styles.autoCardTitle}>
                        {tApp(appLanguage, 'cash_auto_card_title')}
                      </Text>
                      <Text style={styles.autoCardText}>
                        {cartaAttiva
                          ? `${cartaAttiva.nome} · ${cartaAttiva.circuito} •••• ${cartaAttiva.ultime4}`
                          : tApp(appLanguage, 'cash_no_card_connected')}
                      </Text>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[styles.buttonDark, !canAdd && styles.buttonDisabled]}
                    onPress={aggiungiMovimento}
                    activeOpacity={0.9}
                    disabled={!canAdd}
                  >
                    <Text style={styles.buttonDarkText}>{tApp(appLanguage, 'cash_register_income')}</Text>
                  </TouchableOpacity>
                  </View>

                  <View style={styles.card}>
                  <Text style={styles.cardTitle}>{tApp(appLanguage, 'cash_quick_services')}</Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickServicesRow}
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={closeActiveSuggestions}
                  >
                    {servizi.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.quickServiceChip}
                        onPress={() => selezionaServizio(item.nome, item.prezzo)}
                        activeOpacity={0.9}
                      >
                        <Text style={styles.quickServiceChipText}>
                          {item.nome} · € {item.prezzo.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  </View>
                </View>

                <View style={[styles.desktopRightPane, !responsive.isDesktop && styles.desktopPaneStack]}>
                  <View style={styles.card}>
                  <Text style={styles.cardTitle}>{tApp(appLanguage, 'cash_search_movement')}</Text>

                  <TextInput
                    ref={searchMovementRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_search_placeholder')}
                    placeholderTextColor="#9a9a9a"
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
                            setRicerca(item.descrizione);
                            setCampoAttivo(null);
                          }}
                          activeOpacity={0.9}
                        >
                          <Text style={styles.suggestionText}>
                            {item.descrizione} · € {item.importo.toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  </View>

                  <Text style={styles.listTitle}>{tApp(appLanguage, 'cash_movements')} ({movimentiOrdinati.length})</Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <>
          {index === 0 || (!!movimentiOrdinati[index - 1]?.metodo !== !!item.metodo) ? (
            <View
              style={[
                styles.sectionLabelWrap,
                styles.itemCardShell,
                { maxWidth: responsive.contentMaxWidth },
              ]}
            >
              <Text style={styles.sectionLabelText}>
                {item.metodo ? 'Registrati in cassa' : 'Da chiudere'}
              </Text>
            </View>
          ) : null}
          {index === 0 ||
          (!!movimentiOrdinati[index - 1]?.metodo !== !!item.metodo) ||
          getMovementDateKey(movimentiOrdinati[index - 1] ?? { id: '' }) !== getMovementDateKey(item) ? (
            <View
              style={[
                styles.dateSectionWrap,
                styles.itemCardShell,
                { maxWidth: responsive.contentMaxWidth },
              ]}
            >
              <View style={styles.dateSectionPill}>
                <Text style={styles.dateSectionText}>{formatMovementDateLabel(item)}</Text>
              </View>
            </View>
          ) : null}
          <View
            style={[
              styles.itemCard,
              item.metodo
                ? item.metodo === 'Carta'
                  ? styles.itemCardCard
                  : item.metodo === 'Bonifico'
                  ? styles.itemCardTransfer
                  : styles.itemCardCash
                : styles.itemCardPending,
              styles.itemCardShell,
              { maxWidth: responsive.contentMaxWidth },
            ]}
          >
            <View style={styles.itemTop}>
              <View style={styles.itemMainInfo}>
                <Text
                  style={styles.itemDescription}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {getMovementTitle(item.descrizione)}
                </Text>
                <View style={styles.itemMetaRow}>
                  <View
                    style={[
                      styles.itemMetaBadge,
                      item.metodo
                        ? item.metodo === 'Carta'
                          ? styles.itemMetaBadgeBlue
                          : item.metodo === 'Bonifico'
                          ? styles.itemMetaBadgeViolet
                          : styles.itemMetaBadgeCash
                        : styles.itemMetaBadgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.itemMetaBadgeText,
                        item.metodo
                          ? item.metodo === 'Carta'
                            ? styles.itemMetaBadgeBlueText
                            : item.metodo === 'Bonifico'
                            ? styles.itemMetaBadgeVioletText
                            : styles.itemMetaBadgeCashText
                          : styles.itemMetaBadgePendingText,
                      ]}
                    >
                      {item.metodo ? metodoPagamentoLabels[item.metodo] : tApp(appLanguage, 'cash_to_close_status')}
                    </Text>
                  </View>
                  {item.cartaLabel ? (
                    <View style={[styles.itemMetaBadge, styles.itemMetaBadgeInk]}>
                      <Text style={[styles.itemMetaBadgeText, styles.itemMetaBadgeInkText]}>
                        {item.cartaLabel}
                      </Text>
                    </View>
                  ) : null}
                  <View style={[styles.itemMetaBadge, styles.itemMetaBadgeStamp]}>
                    <Text style={[styles.itemMetaBadgeText, styles.itemMetaBadgeStampText]}>
                      {formatMovementStamp(item)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.itemAmountWrap}>
                <Text
                  style={[
                    styles.itemAmountEyebrow,
                    item.metodo ? styles.itemAmountEyebrowDone : styles.itemAmountEyebrowPending,
                  ]}
                >
                  {item.metodo ? 'Registrato' : 'Da assegnare'}
                </Text>
                <Text
                  style={[
                    styles.itemAmount,
                    item.metodo
                      ? item.metodo === 'Carta'
                        ? styles.itemAmountCard
                        : item.metodo === 'Bonifico'
                        ? styles.itemAmountTransfer
                        : styles.itemAmountCash
                      : styles.itemAmountPending,
                  ]}
                >
                  € {item.importo.toFixed(2)}
                </Text>
              </View>
            </View>

            {!item.metodo ? (
              <View style={styles.pendingMethodsRow}>
                {METODI_PAGAMENTO.map((metodo) => (
                  <TouchableOpacity
                    key={`${item.id}-${metodo}`}
                    style={styles.pendingMethodChip}
                    onPress={() => assegnaMetodoMovimento(item.id, metodo)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.pendingMethodChipText}>
                      {metodoPagamentoLabels[metodo]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          </>
        )}
        ListEmptyComponent={
          salonWorkspace.cashSectionDisabled ? null :
          <View
            style={[
              styles.emptyCard,
              styles.itemCardShell,
              { maxWidth: responsive.contentMaxWidth },
            ]}
          >
            <Text style={styles.emptyTitle}>{tApp(appLanguage, 'cash_no_movements')}</Text>
            <Text style={styles.emptyText}>
              Prova a cambiare ricerca oppure registra un nuovo incasso.
            </Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 18 }} />}
      />

      <NumberPickerModal
        visible={showAmountPicker}
        title="Importo incasso"
        initialValue={importo ? Number(importo.replace(',', '.')) : 25}
        onClose={() => setShowAmountPicker(false)}
        onConfirm={(value) => {
          setImporto(value);
          setShowAmountPicker(false);
        }}
        min={0}
        max={1000}
        step={1}
        gridStep={1}
        suffix=" €"
        presets={[10, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100]}
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
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopTopGridStack: {
    flexDirection: 'column',
  },
  desktopLeftPane: {
    flex: 0.95,
    marginRight: 16,
  },
  desktopRightPane: {
    flex: 1.05,
  },
  desktopPaneStack: {
    flex: undefined,
    marginRight: 0,
    width: '100%',
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
    marginBottom: 2,
    textAlign: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 10,
  },
  heroStatsRowBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  heroStatCardMint: {
    flex: 1,
    backgroundColor: '#dff6ed',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbeedc',
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
  heroStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 6,
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#5f564d',
    fontWeight: '700',
    textAlign: 'center',
  },
  heroMiniChip: {
    backgroundColor: '#f2ede5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e7ddd0',
  },
  heroMiniChipText: {
    fontSize: 12,
    color: '#6d6257',
    fontWeight: '700',
    textAlign: 'center',
  },
  cashDisableCard: {
    backgroundColor: '#fff8eb',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f7d9a6',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cashDisableCardActive: {
    backgroundColor: '#fff1f2',
    borderColor: '#fecdd3',
  },
  cashDisableHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cashDisableEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#9a6b32',
    textAlign: 'center',
  },
  cashDisableTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1a1816',
    textAlign: 'center',
    lineHeight: 25,
  },
  cashDisableBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  cashDisableBadgeIdle: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ec',
  },
  cashDisableBadgeActive: {
    backgroundColor: '#7f1d1d',
    borderColor: '#7f1d1d',
  },
  cashDisableBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashDisableBadgeTextIdle: {
    color: '#475569',
  },
  cashDisableBadgeTextActive: {
    color: '#ffffff',
  },
  cashDisableText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6d6257',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 14,
  },
  cashDisableButton: {
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashDisableButtonActive: {
    backgroundColor: '#991b1b',
  },
  cashDisableButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashDisableButtonTextActive: {
    color: '#ffffff',
  },
  cashHiddenCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5edf5',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  cashHiddenTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  cashHiddenText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e5edf5',
  },
  wideCard: {
    maxWidth: 980,
    alignSelf: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 10,
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    marginBottom: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
    color: '#111111',
    textAlign: 'center',
  },
  numericPickerField: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  numericPickerFieldText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  numericPickerFieldPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  buttonDark: {
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
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
  buttonDisabled: {
    opacity: 0.45,
  },
  cardsRow: {
    paddingTop: 8,
    paddingRight: 6,
    alignItems: 'center',
  },
  linkedCard: {
    width: 190,
    backgroundColor: '#1f2937',
    borderRadius: 24,
    padding: 16,
    marginRight: 12,
  },
  itemCardShell: {
    width: '100%',
  },
  linkedCardActive: {
    borderWidth: 2,
    borderColor: '#fcd34d',
  },
  linkedCardCircuit: {
    color: '#cfe0f7',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  linkedCardName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  linkedCardDigits: {
    color: '#d9e3ee',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  linkedCardHint: {
    color: '#b9c7d6',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  linkedCardDelete: {
    alignSelf: 'center',
    backgroundColor: '#334155',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  linkedCardDeleteText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  methodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
    justifyContent: 'center',
  },
  methodChip: {
    backgroundColor: '#f2ede5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  methodChipActive: {
    backgroundColor: '#111111',
  },
  methodChipText: {
    color: '#4b5563',
    fontSize: 13,
    fontWeight: '800',
  },
  methodChipTextActive: {
    color: '#ffffff',
  },
  autoCardBox: {
    backgroundColor: '#eef6ff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  autoCardTitle: {
    fontSize: 13,
    color: '#1d4ed8',
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  autoCardText: {
    fontSize: 14,
    color: '#1f2937',
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickServicesRow: {
    paddingRight: 6,
    alignItems: 'center',
  },
  quickServiceChip: {
    backgroundColor: '#111111',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  quickServiceChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    marginTop: -4,
    marginBottom: 10,
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
  listTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    marginTop: 6,
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionLabelWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#64748b',
    textAlign: 'center',
  },
  dateSectionWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  dateSectionPill: {
    backgroundColor: '#e2ebf5',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#d1deeb',
  },
  dateSectionText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#5b6f86',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  itemCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  itemCardPending: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  itemCardCash: {
    backgroundColor: '#f8fafc',
    borderColor: '#dbe4ec',
  },
  itemCardCard: {
    backgroundColor: '#eef6ff',
    borderColor: '#c9defa',
  },
  itemCardTransfer: {
    backgroundColor: '#f5f3ff',
    borderColor: '#ddd6fe',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 10,
  },
  itemMainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemDescription: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
    marginBottom: 8,
  },
  itemAmountWrap: {
    minWidth: 110,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemAmountEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemAmountEyebrowDone: {
    color: '#64748b',
  },
  itemAmountEyebrowPending: {
    color: '#c2410c',
  },
  itemAmount: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  itemAmountPending: {
    color: '#c2410c',
  },
  itemAmountCash: {
    color: '#0f172a',
  },
  itemAmountCard: {
    color: '#1d4ed8',
  },
  itemAmountTransfer: {
    color: '#6d28d9',
  },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 6,
  },
  itemMetaBadge: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMetaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  itemMetaBadgePending: {
    backgroundColor: '#ffedd5',
  },
  itemMetaBadgePendingText: {
    color: '#c2410c',
  },
  itemMetaBadgeCash: {
    backgroundColor: '#e2e8f0',
  },
  itemMetaBadgeCashText: {
    color: '#334155',
  },
  itemMetaBadgeBlue: {
    backgroundColor: '#dcecff',
  },
  itemMetaBadgeBlueText: {
    color: '#1d4ed8',
  },
  itemMetaBadgeViolet: {
    backgroundColor: '#ede9fe',
  },
  itemMetaBadgeVioletText: {
    color: '#6d28d9',
  },
  itemMetaBadgeInk: {
    backgroundColor: '#dbe4ec',
  },
  itemMetaBadgeInkText: {
    color: '#334155',
  },
  itemMetaBadgeStamp: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemMetaBadgeStampText: {
    color: '#64748b',
  },
  pendingMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    justifyContent: 'flex-start',
  },
  pendingMethodChip: {
    backgroundColor: '#161616',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginRight: 6,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingMethodChipText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
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
    color: '#64748b',
    lineHeight: 20,
    textAlign: 'center',
  },
});
