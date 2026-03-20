import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { WheelDatePickerModal } from '../../components/ui/wheel-date-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { supabase } from '../../src/lib/supabase';

type ClienteItem = {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  instagram?: string | null;
  birthday?: string | null;
  is_active?: boolean;
  salon_id: string;
};

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}` : '';
};
const buildInstagramUrl = (value?: string | null) => {
  const handle = value?.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
};

const normalizeBirthdayValue = (value?: string | null) => {
  const trimmedValue = value?.trim() ?? '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const slashDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDateMatch) {
    const [, day, month, year] = slashDateMatch;
    return `${year}-${month}-${day}`;
  }

  return '';
};

const formatBirthdayLabel = (value?: string | null) => {
  const normalizedValue = normalizeBirthdayValue(value);
  if (!normalizedValue) return '';

  const [year, month, day] = normalizedValue.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

export default function ClientiScreen() {
  const responsive = useResponsiveLayout();
  const {
    salonWorkspace,
    clienti: localClienti,
    setClienti: setLocalClienti,
  } = useAppContext();
  const listRef = useRef<FlatList<ClienteItem> | null>(null);
  const nameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const instagramInputRef = useRef<TextInput | null>(null);

  const [clienti, setClienti] = useState<ClienteItem[]>([]);
  const [clienteInModifica, setClienteInModifica] = useState<ClienteItem | null>(null);

  const [nome, setNome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [ricerca, setRicerca] = useState('');

  const [salonId, setSalonId] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<'local' | 'remote'>('local');
  const [loadingInit, setLoadingInit] = useState(true);
  const [saving, setSaving] = useState(false);

  const mapLocalClientsToScreen = useCallback(
    (items: typeof localClienti, fallbackSalonId: string) =>
      items.map((item) => ({
        id: item.id,
        full_name: item.nome,
        phone: item.telefono,
        email: item.email ?? null,
        instagram: item.instagram ?? null,
        birthday: item.birthday ?? null,
        is_active: item.inibito !== true,
        salon_id: fallbackSalonId,
      })),
    []
  );

  const mapScreenClientsToLocal = useCallback(
    (items: ClienteItem[]) =>
      items.map((item) => ({
        id: item.id,
        nome: item.full_name,
        telefono: item.phone,
        email: item.email ?? '',
        instagram: item.instagram ?? '',
        birthday: item.birthday ?? '',
        nota: '',
        fonte: 'salone' as const,
        viewedBySalon: true,
        annullamentiCount: 0,
        inibito: (item.is_active ?? true) === false,
      })),
    []
  );

  const caricaClienti = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Errore', error.message);
      return;
    }

    const nextClients = (data as ClienteItem[]) || [];
    setClienti(nextClients);
    setLocalClienti(mapScreenClientsToLocal(nextClients));
  }, [mapScreenClientsToLocal, setLocalClienti]);

  const init = useCallback(async () => {
    try {
      setLoadingInit(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setStorageMode('local');
        setSalonId(salonWorkspace.id);
        setClienti(mapLocalClientsToScreen(localClienti, salonWorkspace.id));
        setLoadingInit(false);
        return;
      }

      const { data: salone, error: saloneError } = await supabase
        .from('salons')
        .select('id')
        .eq('owner_user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (saloneError || !salone) {
        setStorageMode('local');
        setSalonId(salonWorkspace.id);
        setClienti(mapLocalClientsToScreen(localClienti, salonWorkspace.id));
        setLoadingInit(false);
        return;
      }

      setStorageMode('remote');
      setSalonId(salone.id);
      await caricaClienti(salone.id);
      setLoadingInit(false);
    } catch (e: any) {
      Alert.alert('Errore init', e.message);
      setLoadingInit(false);
    }
  }, [caricaClienti, localClienti, mapLocalClientsToScreen, salonWorkspace.id]);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (storageMode !== 'local') return;
    setClienti(mapLocalClientsToScreen(localClienti, salonWorkspace.id));
  }, [localClienti, mapLocalClientsToScreen, salonWorkspace.id, storageMode]);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });

      setLocalClienti((current) =>
        current.map((item) =>
          item.fonte === 'frontend' && item.viewedBySalon === false
            ? { ...item, viewedBySalon: true }
            : item
        )
      );
    }, [setLocalClienti])
  );

  const pulisciCampi = () => {
    setNome('');
    setTelefono('');
    setEmail('');
    setInstagram('');
    setBirthday('');
    setClienteInModifica(null);
  };

  const preparaModificaCliente = (cliente: ClienteItem) => {
    setClienteInModifica(cliente);
    setNome(cliente.full_name ?? '');
    setTelefono(cliente.phone ?? '');
    setEmail(cliente.email ?? '');
    setInstagram(cliente.instagram ?? '');
    setBirthday(normalizeBirthdayValue(cliente.birthday));
  };

  const salvaCliente = async () => {
    if (!nome.trim() || !telefono.trim()) {
      Alert.alert('Errore', 'Compila nome e telefono');
      return;
    }

    try {
      setSaving(true);

      if (storageMode === 'local' || !salonId) {
        if (clienteInModifica) {
          setLocalClienti((current) =>
            current.map((item) =>
              item.id === clienteInModifica.id
                ? {
                    ...item,
                    nome: nome.trim(),
                    telefono: telefono.trim(),
                    email: email.trim() || '',
                    instagram: instagram.trim() || '',
                    birthday: birthday.trim() || '',
                  }
                : item
            )
          );

          setSaving(false);
          pulisciCampi();
          Alert.alert('OK', 'Cliente aggiornato');
          return;
        }

        setLocalClienti((current) => [
          {
            id: `cliente-${Date.now()}`,
            nome: nome.trim(),
            telefono: telefono.trim(),
            email: email.trim() || '',
            instagram: instagram.trim() || '',
            birthday: birthday.trim() || '',
            nota: '',
            fonte: 'salone',
            viewedBySalon: true,
            annullamentiCount: 0,
            inibito: false,
          },
          ...current,
        ]);

        setSaving(false);
        pulisciCampi();
        Alert.alert('OK', 'Cliente aggiunto');
        return;
      }

      if (clienteInModifica) {
        const { error } = await supabase
          .from('clients')
          .update({
            full_name: nome.trim(),
            phone: telefono.trim(),
            email: email.trim() || null,
            instagram: instagram.trim() || null,
            birthday: birthday.trim() || null,
          })
          .eq('id', clienteInModifica.id)
          .eq('salon_id', salonId);

        setSaving(false);

        if (error) {
          Alert.alert('Errore aggiornamento', error.message);
          return;
        }

        pulisciCampi();
        await caricaClienti(salonId);
        Alert.alert('OK', 'Cliente aggiornato');
        return;
      }

      const { error } = await supabase.from('clients').insert([
        {
          full_name: nome.trim(),
          phone: telefono.trim(),
          email: email.trim() || null,
          instagram: instagram.trim() || null,
          birthday: birthday.trim() || null,
          salon_id: salonId,
          is_active: true,
        },
      ]);

      setSaving(false);

      if (error) {
        Alert.alert('Errore inserimento', error.message);
        return;
      }

      pulisciCampi();
      await caricaClienti(salonId);
      Alert.alert('OK', 'Cliente aggiunto');
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Errore generale', e.message);
    }
  };

  const eliminaCliente = async (id: string, nomeCliente: string) => {
    Alert.alert('Conferma', `Vuoi eliminare ${nomeCliente}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          if (storageMode === 'local' || !salonId) {
            setLocalClienti((current) => current.filter((item) => item.id !== id));

            if (clienteInModifica?.id === id) {
              pulisciCampi();
            }

            return;
          }

          const { error } = await supabase.from('clients').delete().eq('id', id);

          if (error) {
            Alert.alert('Errore', error.message);
            return;
          }

          if (clienteInModifica?.id === id) {
            pulisciCampi();
          }

          if (salonId) {
            await caricaClienti(salonId);
          }
        },
      },
    ]);
  };

  const toggleInibizioneCliente = async (cliente: ClienteItem) => {
    const isCurrentlyActive = cliente.is_active ?? true;
    const nextIsActive = !isCurrentlyActive;
    const actionLabel = nextIsActive ? 'sbloccare' : 'inibire';

    Alert.alert(
      'Conferma',
      nextIsActive
        ? `${cliente.full_name} tornerà a vedere gli slot disponibili e potrà prenotare di nuovo.`
        : `${cliente.full_name} vedrà tutti gli slot occupati finché non lo sblocchi.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: nextIsActive ? 'Sblocca' : 'Inibisci',
          style: nextIsActive ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (storageMode === 'local' || !salonId) {
                setLocalClienti((current) =>
                  current.map((item) =>
                    item.id === cliente.id ? { ...item, inibito: !nextIsActive } : item
                  )
                );
                return;
              }

              const { error } = await supabase
                .from('clients')
                .update({ is_active: nextIsActive })
                .eq('id', cliente.id)
                .eq('salon_id', salonId);

              if (error) {
                Alert.alert('Errore', error.message);
                return;
              }

              await caricaClienti(salonId);
            } catch (error: any) {
              Alert.alert('Errore', error?.message || `Non sono riuscito a ${actionLabel} il cliente.`);
            }
          },
        },
      ]
    );
  };

  const clientiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) return clienti;

    return clienti.filter((item) => {
      const nomeMatch = item.full_name?.toLowerCase().includes(testo);
      const telefonoMatch = item.phone?.toLowerCase().includes(testo);
      const emailMatch = item.email?.toLowerCase().includes(testo);
      const instagramMatch = item.instagram?.toLowerCase().includes(testo);
      return nomeMatch || telefonoMatch || emailMatch || instagramMatch;
    });
  }, [clienti, ricerca]);

  const renderClienteCard = (item: ClienteItem) => {
    const isSelected = clienteInModifica?.id === item.id;
    const isInibito = (item.is_active ?? true) === false;
    const instagramHandle = item.instagram?.replace(/^@+/, '') ?? '';
    const canOpenInstagram = instagramHandle.trim() !== '';
    const compactContactChips = responsive.width < 390;
    const ultraCompactContactChips = responsive.width < 360;
    const compactSideActions = responsive.width < 390;
    const ultraCompactSideActions = responsive.width < 360;

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => preparaModificaCliente(item)}
        style={[styles.clienteCard, isSelected && styles.clienteCardSelected]}
      >
        <View style={styles.clienteMain}>
          <View style={styles.clienteIdentityRow}>
            <View style={styles.clienteInitialBadge}>
              <Text style={styles.clienteInitialText}>
                {(item.full_name?.trim()?.charAt(0) || '?').toUpperCase()}
              </Text>
            </View>

            <View style={styles.clienteInfo}>
              <View style={styles.clienteTitleRow}>
                <Text style={styles.clienteNome} numberOfLines={1}>
                  {item.full_name}
                </Text>
                {isInibito ? (
                  <View style={styles.statusBadgeBlocked}>
                    <Text style={styles.statusBadgeBlockedText}>Inibito</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.clienteTelefono} numberOfLines={1}>{item.phone}</Text>

              {(item.email || canOpenInstagram) ? (
                <View style={styles.clienteMetaRow}>
                  {item.email ? (
                    <Text style={styles.clienteEmailCompact} numberOfLines={1}>
                      {item.email}
                    </Text>
                  ) : null}
                  {canOpenInstagram ? (
                    <Text style={styles.clienteInstagramCompact} numberOfLines={1}>
                      @{instagramHandle}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={[styles.quickActionsRow, compactContactChips && styles.quickActionsRowCompact]}>
                <TouchableOpacity
                  style={[styles.quickActionChip, compactContactChips && styles.quickActionChipCompact]}
                  onPress={() => Linking.openURL(`tel:${buildDialablePhone(item.phone)}`).catch(() => null)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.quickActionText, compactContactChips && styles.quickActionTextCompact]}>
                    {ultraCompactContactChips ? 'Call' : 'Chiama'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionChip, styles.quickActionChipWhatsapp, compactContactChips && styles.quickActionChipCompact]}
                  onPress={() => Linking.openURL(buildWhatsappUrl(item.phone)).catch(() => null)}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.quickActionText, styles.quickActionTextWhatsapp, compactContactChips && styles.quickActionTextCompact]}>
                    {ultraCompactContactChips ? 'WA' : 'WhatsApp'}
                  </Text>
                </TouchableOpacity>
                {canOpenInstagram ? (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipInstagram, compactContactChips && styles.quickActionChipCompact]}
                    onPress={() => Linking.openURL(buildInstagramUrl(item.instagram) || '').catch(() => null)}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.quickActionText, styles.quickActionTextInstagram, compactContactChips && styles.quickActionTextCompact]}>
                      {ultraCompactContactChips ? 'IG' : 'Instagram'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <Text style={styles.clienteTapHint}>Tocca la card per modificare</Text>
        </View>

        <View style={[styles.cardActionsColumn, compactSideActions && styles.cardActionsColumnCompact]}>
          <TouchableOpacity
            onPress={() => toggleInibizioneCliente(item)}
            activeOpacity={0.9}
            style={[
              styles.sideActionButton,
              compactSideActions && styles.sideActionButtonCompact,
              isInibito ? styles.sideActionButtonSuccess : styles.sideActionButtonWarning,
            ]}
          >
            <Text
              style={[
                styles.sideActionButtonText,
                compactSideActions && styles.sideActionButtonTextCompact,
                isInibito ? styles.sideActionButtonTextSuccess : styles.sideActionButtonTextWarning,
              ]}
            >
              {isInibito
                ? ultraCompactSideActions
                  ? 'On'
                  : 'Sblocca'
                : ultraCompactSideActions
                  ? 'Off'
                  : 'Inibisci'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => eliminaCliente(item.id, item.full_name)}
            activeOpacity={0.9}
            style={[
              styles.sideActionButton,
              compactSideActions && styles.sideActionButtonCompact,
              styles.sideActionButtonDanger,
            ]}
          >
            <Text
              style={[
                styles.sideActionButtonText,
                compactSideActions && styles.sideActionButtonTextCompact,
                styles.sideActionButtonTextDanger,
              ]}
            >
              {ultraCompactSideActions ? 'Del' : 'Elimina'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={clientiFiltrati}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="clienti"
                title="Clienti"
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                subtitle="Gestisci i clienti del tuo salone, aggiungili rapidamente e tieni tutto ordinato."
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
                      {clienteInModifica ? 'Modifica cliente' : 'Aggiungi Nuovo Cliente'}
                    </Text>
                  </View>
                  <Text style={styles.searchSubtitle}>
                    {loadingInit
                      ? 'Caricamento salone...'
                      : clienteInModifica
                      ? 'Stai modificando un cliente esistente.'
                      : 'Aggiungi un cliente e salvalo direttamente nel database.'}
                  </Text>
                </View>

                <View style={styles.bookingBadge}>
                  <Text style={styles.bookingBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{clienti.length} clienti</Text>
                </View>
              </View>
                <>
                  <View style={styles.formFieldsWrap}>
                    <ClearableTextInput
                      ref={nameInputRef}
                      placeholder="Inserisci nome e cognome"
                      placeholderTextColor="#9a9a9a"
                      value={nome}
                      onChangeText={setNome}
                      editable={!saving && !loadingInit}
                      style={styles.input}
                      returnKeyType="next"
                      onSubmitEditing={() => phoneInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />

                    <ClearableTextInput
                      ref={phoneInputRef}
                      placeholder="Inserisci numero di telefono"
                      placeholderTextColor="#9a9a9a"
                      value={telefono}
                      onChangeText={setTelefono}
                      editable={!saving && !loadingInit}
                      keyboardType="phone-pad"
                      style={styles.input}
                      returnKeyType="next"
                      onSubmitEditing={() => emailInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />

                    <ClearableTextInput
                      ref={emailInputRef}
                      placeholder="Email (Opzionale)"
                      placeholderTextColor="#9a9a9a"
                      value={email}
                      onChangeText={setEmail}
                      editable={!saving && !loadingInit}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      style={styles.input}
                      returnKeyType="next"
                      onSubmitEditing={() => instagramInputRef.current?.focus()}
                      blurOnSubmit={false}
                    />

                    <ClearableTextInput
                      ref={instagramInputRef}
                      placeholder="Instagram (Opzionale)"
                      placeholderTextColor="#9a9a9a"
                      value={instagram}
                      onChangeText={setInstagram}
                      editable={!saving && !loadingInit}
                      autoCapitalize="none"
                      style={styles.input}
                      returnKeyType="next"
                      onSubmitEditing={() => {
                        Keyboard.dismiss();
                        setShowBirthdayPicker(true);
                      }}
                      blurOnSubmit={false}
                    />

                    <TouchableOpacity
                      style={[
                        styles.input,
                        styles.dateInputButton,
                        (saving || loadingInit) && styles.primaryButtonDisabled,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowBirthdayPicker(true);
                      }}
                      activeOpacity={0.9}
                      disabled={saving || loadingInit}
                    >
                      <Text
                        style={[
                          styles.dateInputText,
                          !birthday && styles.dateInputPlaceholder,
                        ]}
                      >
                        {formatBirthdayLabel(birthday) || 'Compleanno / Data (Opzionale)'}
                      </Text>
                    </TouchableOpacity>

                    {birthday ? (
                      <TouchableOpacity
                        style={styles.clearDateChip}
                        onPress={() => setBirthday('')}
                        activeOpacity={0.9}
                        disabled={saving || loadingInit}
                      >
                        <Text style={styles.clearDateChipText}>Rimuovi data</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <Text style={styles.requiredFieldsHint}>
                    Obbligatori: nome e cognome, numero di telefono.
                  </Text>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.secondaryButton, (saving || loadingInit) && styles.primaryButtonDisabled]}
                      onPress={pulisciCampi}
                      activeOpacity={0.9}
                      disabled={saving || loadingInit}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {clienteInModifica ? 'Annulla modifica' : 'Svuota'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.primaryButtonInline, (saving || loadingInit) && styles.primaryButtonDisabled]}
                      onPress={salvaCliente}
                      activeOpacity={0.9}
                      disabled={saving || loadingInit}
                    >
                      <Text style={styles.primaryButtonText}>
                        {saving
                          ? 'Salvataggio...'
                          : clienteInModifica
                          ? 'Salva modifiche'
                          : 'Aggiungi cliente'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.searchTitle}>Rubrica clienti</Text>
              <Text style={styles.searchSubtitle}>
                Qui trovi tutti i clienti collegati al tuo salone.
              </Text>

              <ClearableTextInput
                placeholder="Cerca per nome, telefono, email o Instagram"
                placeholderTextColor="#8f8f8f"
                value={ricerca}
                onChangeText={setRicerca}
                style={[styles.input, styles.searchInput]}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          !loadingInit ? (
            <View style={[styles.emptyCard, { maxWidth: responsive.contentMaxWidth, alignSelf: 'center' }]}>
              <Text style={styles.emptyTitle}>
                {ricerca.trim() ? 'Nessun risultato trovato' : 'Nessun cliente presente'}
              </Text>
              <Text style={styles.emptyText}>
                {ricerca.trim()
                  ? 'Prova a cambiare ricerca.'
                  : 'Aggiungi il primo cliente usando il modulo qui sopra.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.pageShell, styles.daySectionCardShell, { maxWidth: responsive.contentMaxWidth }]}>
            {renderClienteCard(item)}
          </View>
        )}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />

      <WheelDatePickerModal
        visible={showBirthdayPicker}
        title="Compleanno / Data (Opzionale)"
        initialValue={birthday || undefined}
        onClose={() => setShowBirthdayPicker(false)}
        onConfirm={(value) => {
          setBirthday(value);
          setShowBirthdayPicker(false);
        }}
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
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  bookingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  bookingHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bookingHeaderLeft: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingHeadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  bookingHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  bookingBadge: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexShrink: 0,
    marginTop: 8,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#4b5563',
    textAlign: 'center',
  },
  formToggleChip: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 10,
  },
  formToggleChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  formFieldsWrap: {
    marginTop: 2,
  },
  sectionBlock: {
    marginBottom: 12,
    backgroundColor: '#fbfdff',
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#dfe7f1',
    shadowColor: '#000',
    shadowOpacity: 0.025,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#f1f3f6',
    marginBottom: 10,
  },
  searchInput: {
    marginTop: 10,
  },
  dateInputButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInputText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
  },
  dateInputPlaceholder: {
    color: '#9a9a9a',
  },
  clearDateChip: {
    alignSelf: 'center',
    marginTop: -2,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  clearDateChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  requiredFieldsHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  primaryButtonInline: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 16,
    paddingVertical: 13,
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
    fontWeight: '900',
    textAlign: 'center',
  },
  secondaryButton: {
    width: 140,
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  searchCard: {
    backgroundColor: '#f7fbff',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
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
    fontSize: 18,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'center',
  },
  searchSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  daySectionCardShell: {
    width: '100%',
  },
  clienteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clienteCardSelected: {
    borderColor: '#111827',
    borderWidth: 2,
  },
  clienteMain: {
    flex: 1,
    marginRight: 10,
  },
  clienteIdentityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  clienteInitialBadge: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    marginTop: 1,
  },
  clienteInitialText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  clienteInfo: {
    flex: 1,
    alignItems: 'flex-start',
    minWidth: 0,
  },
  clienteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    width: '100%',
    minWidth: 0,
  },
  clienteNome: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111111',
    marginBottom: 1,
    textAlign: 'left',
    flex: 1,
  },
  clienteTelefono: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '800',
    textAlign: 'left',
  },
  clienteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 1,
  },
  clienteEmailCompact: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    textAlign: 'left',
  },
  clienteInstagramCompact: {
    fontSize: 11,
    color: '#7c3aed',
    fontWeight: '800',
    textAlign: 'left',
  },
  clienteTapHint: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    marginTop: 4,
    marginLeft: 45,
    textAlign: 'left',
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    width: '100%',
  },
  quickActionsRowCompact: {
    gap: 5,
    marginTop: 5,
  },
  quickActionChip: {
    backgroundColor: '#f8fafc',
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    minWidth: 82,
    alignItems: 'center',
  },
  quickActionChipCompact: {
    minWidth: 62,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quickActionChipWhatsapp: {
    backgroundColor: '#dff6ed',
    borderColor: '#cbeedc',
  },
  quickActionChipInstagram: {
    backgroundColor: '#f5e8ff',
    borderColor: '#ead5ff',
  },
  quickActionText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  quickActionTextCompact: {
    fontSize: 9,
  },
  quickActionTextWhatsapp: {
    color: '#166534',
  },
  quickActionTextInstagram: {
    color: '#7c3aed',
  },
  cardActionsColumn: {
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 6,
  },
  cardActionsColumnCompact: {
    gap: 5,
  },
  sideActionButton: {
    minWidth: 78,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  sideActionButtonCompact: {
    minWidth: 60,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 10,
  },
  sideActionButtonText: {
    fontWeight: '800',
    fontSize: 11,
  },
  sideActionButtonTextCompact: {
    fontSize: 10,
  },
  sideActionButtonWarning: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  sideActionButtonTextWarning: {
    color: '#c2410c',
  },
  sideActionButtonSuccess: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac',
  },
  sideActionButtonTextSuccess: {
    color: '#166534',
  },
  sideActionButtonDanger: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
  },
  sideActionButtonTextDanger: {
    color: '#b91c1c',
  },
  statusBadgeBlocked: {
    backgroundColor: '#fff7ed',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fdba74',
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusBadgeBlockedText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#c2410c',
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
    marginTop: 6,
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
    lineHeight: 21,
    textAlign: 'center',
  },
});
