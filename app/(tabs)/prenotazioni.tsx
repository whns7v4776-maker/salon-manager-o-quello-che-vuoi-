import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef } from 'react';
import { Alert, Keyboard, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { useAppContext } from '../../src/context/AppContext';
import {
    findConflictingAppointment,
    formatDateLong,
    getTodayDateString,
} from '../../src/lib/booking';
import { tApp } from '../../src/lib/i18n';
import { queueWorkspacePushNotification } from '../../src/lib/push/push-notifications';
import { useResponsiveLayout } from '../../src/lib/responsive';

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}` : '';
};
const buildInstagramUrl = (value?: string) => {
  const handle = value?.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
};

export default function PrenotazioniScreen() {
  const responsive = useResponsiveLayout();
  const scrollRef = useRef<ScrollView | null>(null);
  const {
    richiestePrenotazione,
    setRichiestePrenotazione,
    clienti,
    setClienti,
    appuntamenti,
    setAppuntamenti,
    servizi,
    operatori,
    salonWorkspace,
    appLanguage,
  } = useAppContext();

  const richiesteInAttesa = useMemo(
    () =>
      richiestePrenotazione.filter(
        (item) =>
          (item.origine ?? 'frontend') === 'frontend' &&
          (item.stato === 'In attesa' || (item.stato === 'Annullata' && item.viewedBySalon === false))
      ),
    [richiestePrenotazione]
  );
  const richiesteGestite = useMemo(
    () =>
      richiestePrenotazione.filter(
        (item) => (item.origine ?? 'frontend') === 'frontend' && item.stato !== 'In attesa'
      ),
    [richiestePrenotazione]
  );

  const aggiornaStatoRichiesta = async (id: string, stato: 'Accettata' | 'Rifiutata') => {
    const requestTarget = richiestePrenotazione.find((item) => item.id === id);

    setRichiestePrenotazione((current) =>
      current.map((item) =>
        item.id === id ? { ...item, stato, viewedByCliente: false } : item
      )
    );

    if (!requestTarget) return;

    await queueWorkspacePushNotification({
      workspaceId: salonWorkspace.id,
      eventType: 'booking_request_status_changed',
      title: 'Aggiornamento prenotazione',
      body: `${requestTarget.nome} ${requestTarget.cognome} - ${stato}`,
      payload: {
        type: 'booking_request_status_changed',
        bookingRequestId: requestTarget.id,
        status: stato,
        appointmentDate: requestTarget.data,
        appointmentTime: requestTarget.ora,
        customerName: `${requestTarget.nome} ${requestTarget.cognome}`.trim(),
        serviceName: requestTarget.servizio,
      },
    });
  };

  const accettaRichiesta = (id: string) => {
    const richiesta = richiestePrenotazione.find((item) => item.id === id);
    if (!richiesta) return;

    const conflitto = findConflictingAppointment({
      appointmentDate: richiesta.data,
      startTime: richiesta.ora,
      serviceName: richiesta.servizio,
      appointments: appuntamenti,
      services: servizi,
      operatorId: richiesta.operatoreId,
      useOperators: operatori.length > 0 && !!richiesta.operatoreId,
    });

    if (conflitto) {
      Alert.alert(
        'Conflitto agenda',
        `Questa richiesta non può essere accettata così com’è, perché si sovrappone con ${conflitto.cliente} alle ${conflitto.ora}.`
      );
      return;
    }

    const nomeCompleto = `${richiesta.nome} ${richiesta.cognome}`.trim();
    const clienteEsistente = clienti.find(
      (item) =>
        item.telefono.trim() === richiesta.telefono.trim() ||
        item.nome.trim().toLowerCase() === nomeCompleto.toLowerCase()
    );

    if (clienteEsistente) {
      setClienti(
        clienti.map((item) =>
          item.id === clienteEsistente.id
            ? {
                ...item,
                nome: nomeCompleto,
                telefono: richiesta.telefono,
                email: richiesta.email || item.email,
                instagram: richiesta.instagram || item.instagram,
                nota: richiesta.note?.trim() || item.nota,
              }
            : item
        )
      );
    } else {
      setClienti([
        {
          id: `cliente-${Date.now()}`,
          nome: nomeCompleto,
          telefono: richiesta.telefono,
          email: richiesta.email,
          instagram: richiesta.instagram ?? '',
          nota: richiesta.note ?? '',
        },
        ...clienti,
      ]);
    }

    setAppuntamenti([
      {
        id: `app-${Date.now()}`,
        data: richiesta.data,
        ora: richiesta.ora,
        cliente: nomeCompleto,
        servizio: richiesta.servizio,
        prezzo: richiesta.prezzo,
        durataMinuti: richiesta.durataMinuti,
        operatoreId: richiesta.operatoreId,
        operatoreNome: richiesta.operatoreNome,
        incassato: false,
        completato: false,
      },
      ...appuntamenti,
    ]);

    aggiornaStatoRichiesta(id, 'Accettata').catch(() => null);
  };

  const rifiutaRichiesta = (id: string) => {
    Alert.alert('Rifiuta richiesta', 'Vuoi davvero rifiutare questa richiesta di prenotazione?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rifiuta',
        style: 'destructive',
        onPress: () => aggiornaStatoRichiesta(id, 'Rifiutata').catch(() => null),
      },
    ]);
  };

  const openExternalUrl = useCallback(async (url: string) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (!supported) return;
    Linking.openURL(url).catch(() => null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const hasUnreadCancelled = richiestePrenotazione.some(
        (item) => item.stato === 'Annullata' && item.viewedBySalon === false
      );

      if (hasUnreadCancelled) {
        setRichiestePrenotazione((current) =>
          current.map((item) =>
            item.stato === 'Annullata' && item.viewedBySalon === false
              ? { ...item, viewedBySalon: true }
              : item
          )
        );
      }

      return () => {
        Keyboard.dismiss();
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      };
    }, [richiestePrenotazione, setRichiestePrenotazione])
  );

  return (
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
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
      <View style={styles.heroCard}>
        <ModuleHeroHeader
          moduleKey="prenotazioni"
          title={tApp(appLanguage, 'tab_requests')}
          salonName={salonWorkspace.salonName}
          salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
          salonNameFontVariant={salonWorkspace.salonNameFontVariant}
        />

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStatCardBlue}>
            <Text style={styles.heroStatNumber}>{richiesteInAttesa.length}</Text>
            <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_pending')}</Text>
          </View>
          <View style={styles.heroStatCardMint}>
            <Text style={styles.heroStatNumber}>{richiesteGestite.length}</Text>
            <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_handled')}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{tApp(appLanguage, 'requests_subtitle')}</Text>
      </View>

      <View
        style={[
          styles.desktopColumns,
          !responsive.isDesktop && styles.desktopColumnsStack,
        ]}
      >
        <View style={[styles.desktopColumnLeft, !responsive.isDesktop && styles.desktopColumnStack]}>
          <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'requests_to_approve')}</Text>
          {richiesteInAttesa.length === 0 ? (
            <View style={[styles.emptyCard, responsive.isDesktop && styles.wideCard]}>
              <Text style={styles.emptyTitle}>{tApp(appLanguage, 'requests_no_pending')}</Text>
              <Text style={styles.emptyText}>
                {tApp(appLanguage, 'requests_no_pending_text')}
              </Text>
            </View>
          ) : null}

          {richiesteInAttesa.map((item) => (
            <View
              key={item.id}
              style={[styles.requestCard, responsive.isDesktop && styles.wideCard]}
            >
              <View style={styles.requestTopRow}>
                <View style={styles.requestHeaderText}>
                  <Text style={styles.requestName}>{item.nome} {item.cognome}</Text>
                  <Text style={styles.requestMeta}>{formatDateLong(item.data)} · {item.ora}</Text>
                </View>
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    {item.stato === 'Annullata'
                      ? tApp(appLanguage, 'requests_cancelled_badge')
                      : tApp(appLanguage, 'requests_pending')}
                  </Text>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoBox}>
                  <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_service')}</Text>
                  <Text style={styles.infoValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66}>{item.servizio}</Text>
                </View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_price')}</Text>
                  <Text style={styles.infoValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>€ {item.prezzo.toFixed(2)}</Text>
                </View>
              </View>
              {item.operatoreNome ? (
                <Text style={styles.contactLine}>Operatore: {item.operatoreNome}</Text>
              ) : null}

              <Text style={styles.contactLine}>{tApp(appLanguage, 'requests_phone')}: {item.telefono}</Text>
              <Text style={styles.contactLine}>{tApp(appLanguage, 'common_email')}: {item.email}</Text>
              {item.instagram ? <Text style={styles.contactLine}>Instagram: @{item.instagram}</Text> : null}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={styles.quickActionChip}
                  onPress={() => openExternalUrl(`tel:${buildDialablePhone(item.telefono)}`)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.quickActionChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>Chiama</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionChip, styles.quickActionChipWhatsapp]}
                  onPress={() => openExternalUrl(buildWhatsappUrl(item.telefono))}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.quickActionChipText, styles.quickActionChipWhatsappText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    WhatsApp
                  </Text>
                </TouchableOpacity>
                {item.instagram ? (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipInstagram]}
                    onPress={() => openExternalUrl(buildInstagramUrl(item.instagram))}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.quickActionChipText, styles.quickActionChipInstagramText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                      Instagram
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {item.note ? <Text style={styles.noteText}>{tApp(appLanguage, 'requests_note')}: {item.note}</Text> : null}
              {item.stato === 'Annullata' ? (
                <Text style={styles.noteText}>{tApp(appLanguage, 'requests_cancelled_note')}</Text>
              ) : (
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => accettaRichiesta(item.id)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.acceptButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{tApp(appLanguage, 'requests_accept')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => rifiutaRichiesta(item.id)}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.rejectButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{tApp(appLanguage, 'requests_reject')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={[styles.desktopColumnRight, !responsive.isDesktop && styles.desktopColumnStack]}>
          <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'requests_history')}</Text>
          {richiesteGestite.map((item) => (
            <View
              key={item.id}
              style={[styles.historyCard, responsive.isDesktop && styles.wideCard]}
            >
              <Text style={styles.historyTitle}>{item.nome} {item.cognome}</Text>
              <Text style={styles.historyMeta}>
                {item.servizio} · {item.ora} · {item.data || getTodayDateString()}
              </Text>
              {item.operatoreNome ? (
                <Text style={styles.contactLine}>Operatore: {item.operatoreNome}</Text>
              ) : null}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={styles.quickActionChip}
                  onPress={() => openExternalUrl(`tel:${buildDialablePhone(item.telefono)}`)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.quickActionChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>Chiama</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickActionChip, styles.quickActionChipWhatsapp]}
                  onPress={() => openExternalUrl(buildWhatsappUrl(item.telefono))}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.quickActionChipText, styles.quickActionChipWhatsappText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                    WhatsApp
                  </Text>
                </TouchableOpacity>
                {item.instagram ? (
                  <TouchableOpacity
                    style={[styles.quickActionChip, styles.quickActionChipInstagram]}
                    onPress={() => openExternalUrl(buildInstagramUrl(item.instagram))}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.quickActionChipText, styles.quickActionChipInstagramText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                      Instagram
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View
                style={[
                  styles.historyBadge,
                  item.stato === 'Accettata' ? styles.historyBadgeAccepted : styles.historyBadgeRejected,
                ]}
              >
                <Text
                  style={[
                    styles.historyBadgeText,
                    item.stato === 'Accettata'
                      ? styles.historyBadgeTextAccepted
                      : styles.historyBadgeTextRejected,
                  ]}
                >
                  {item.stato}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      </View>
    </ScrollView>
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
  desktopColumns: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopColumnsStack: {
    flexDirection: 'column',
  },
  desktopColumnLeft: {
    flex: 1.08,
    marginRight: 16,
  },
  desktopColumnRight: {
    flex: 0.92,
  },
  desktopColumnStack: {
    flex: undefined,
    width: '100%',
    marginRight: 0,
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
    fontSize: 34,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 360,
    fontSize: 13,
    color: '#6f7b8d',
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 2,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5edf5',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#666666',
  },
  requestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5edf5',
  },
  wideCard: {
    maxWidth: 980,
    alignSelf: 'center',
    width: '100%',
  },
  requestTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  requestHeaderText: {
    flex: 1,
  },
  requestName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  requestMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6d6257',
    textAlign: 'center',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pendingBadgeText: {
    color: '#92400e',
    fontSize: 12,
    fontWeight: '800',
  },
  infoGrid: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  infoBox: {
    flex: 1,
    backgroundColor: '#f4f2ed',
    borderRadius: 18,
    padding: 14,
    marginRight: 8,
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: '#7a6f65',
    fontWeight: '700',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    color: '#111111',
    fontWeight: '800',
    textAlign: 'center',
  },
  contactLine: {
    fontSize: 14,
    lineHeight: 21,
    color: '#5f564d',
    marginBottom: 4,
    textAlign: 'center',
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  quickActionChip: {
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  quickActionChipWhatsapp: {
    backgroundColor: '#dff6ed',
    borderColor: '#cbeedc',
  },
  quickActionChipInstagram: {
    backgroundColor: '#f5e8ff',
    borderColor: '#ead5ff',
  },
  quickActionChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  quickActionChipWhatsappText: {
    color: '#166534',
  },
  quickActionChipInstagramText: {
    color: '#7c3aed',
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#444444',
    marginTop: 6,
    marginBottom: 12,
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  acceptButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#f3dede',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#9b2c2c',
    fontSize: 14,
    fontWeight: '800',
  },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5edf5',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
    textAlign: 'center',
  },
  historyMeta: {
    fontSize: 13,
    color: '#6d6257',
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  historyBadge: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyBadgeAccepted: {
    backgroundColor: '#dff6ed',
  },
  historyBadgeRejected: {
    backgroundColor: '#fee2e2',
  },
  historyBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  historyBadgeTextAccepted: {
    color: '#166534',
  },
  historyBadgeTextRejected: {
    color: '#991b1b',
  },
});
