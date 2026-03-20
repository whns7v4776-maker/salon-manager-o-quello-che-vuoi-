import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import {
    FlatList,
    ListRenderItemInfo,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
    ViewToken,
} from 'react-native';

type OnboardingStep = {
  key: string;
  title: string;
  body: string;
  cta: string;
  secondaryCta?: string;
  visual: 'welcome' | 'services' | 'qr' | 'agenda' | 'speed' | 'final';
};

type OnboardingModalProps = {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'welcome',
    title: 'Gestisci il tuo salone in modo semplice',
    body: 'Clienti, servizi e appuntamenti.\nTutto in un unico posto, sempre sotto controllo.',
    cta: 'Inizia',
    secondaryCta: 'Salta',
    visual: 'welcome',
  },
  {
    key: 'services',
    title: 'Organizza servizi e clienti',
    body: 'Aggiungi e modifica servizi in pochi secondi.\nGestisci i clienti facilmente e tieni tutto aggiornato.',
    cta: 'Avanti',
    secondaryCta: 'Salta',
    visual: 'services',
  },
  {
    key: 'qr',
    title: 'Fai prenotare i clienti in autonomia',
    body: 'Condividi il tuo QR code.\nI clienti accedono direttamente al tuo salone e prenotano in modo semplice.',
    cta: 'Avanti',
    secondaryCta: 'Salta',
    visual: 'qr',
  },
  {
    key: 'agenda',
    title: 'Controlla la tua giornata',
    body: 'Visualizza appuntamenti e disponibilità.\nOrganizza il lavoro in modo chiaro e veloce.',
    cta: 'Avanti',
    secondaryCta: 'Salta',
    visual: 'agenda',
  },
  {
    key: 'speed',
    title: 'Tutto a portata di tap',
    body: 'Crea appuntamenti, gestisci clienti e accedi alle funzioni principali in pochi passaggi.',
    cta: 'Avanti',
    secondaryCta: 'Salta',
    visual: 'speed',
  },
  {
    key: 'final',
    title: 'Sei pronto',
    body: 'Inizia a usare il gestionale e semplifica il lavoro ogni giorno.',
    cta: 'Entra nell’app',
    visual: 'final',
  },
];

const VISUAL_HEIGHT = 188;

const StepVisual = ({ visual }: { visual: OnboardingStep['visual'] }) => {
  if (visual === 'welcome') {
    return (
      <View style={styles.visualShell}>
        <View style={styles.visualHeroCard}>
          <View style={styles.visualHeroDot} />
          <View style={styles.visualHeroContent}>
            <Text style={styles.visualHeroEyebrow}>SALON MANAGER</Text>
            <Text style={styles.visualHeroTitle}>Il tuo salone, ordinato.</Text>
          </View>
        </View>
        <View style={styles.visualPillsRow}>
          <View style={styles.visualPill}>
            <Ionicons name="people-outline" size={16} color="#0f172a" />
            <Text style={styles.visualPillText}>Clienti</Text>
          </View>
          <View style={styles.visualPill}>
            <Ionicons name="cut-outline" size={16} color="#0f172a" />
            <Text style={styles.visualPillText}>Servizi</Text>
          </View>
          <View style={styles.visualPill}>
            <Ionicons name="calendar-outline" size={16} color="#0f172a" />
            <Text style={styles.visualPillText}>Agenda</Text>
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'services') {
    return (
      <View style={styles.visualShell}>
        <View style={styles.visualSplitRow}>
          <View style={styles.visualMiniPanel}>
            <Text style={styles.visualPanelTitle}>Servizi</Text>
            <View style={styles.visualListItem}>
              <View style={styles.visualListBarWide} />
              <View style={styles.visualPriceTag}><Text style={styles.visualPriceText}>€35</Text></View>
            </View>
            <View style={styles.visualListItem}>
              <View style={styles.visualListBarMid} />
              <View style={styles.visualPriceTag}><Text style={styles.visualPriceText}>€60</Text></View>
            </View>
          </View>
          <View style={styles.visualMiniPanelAccent}>
            <Text style={styles.visualPanelTitle}>Clienti</Text>
            <View style={styles.visualClientRow}>
              <View style={styles.visualAvatar} />
              <View style={styles.visualClientBars}>
                <View style={styles.visualListBarWide} />
                <View style={styles.visualListBarShort} />
              </View>
            </View>
            <View style={styles.visualClientRow}>
              <View style={styles.visualAvatarSecondary} />
              <View style={styles.visualClientBars}>
                <View style={styles.visualListBarMid} />
                <View style={styles.visualListBarShort} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'qr') {
    return (
      <View style={styles.visualShellCentered}>
        <View style={styles.visualQrCard}>
          <View style={styles.visualQrGrid}>
            {Array.from({ length: 25 }, (_, index) => (
              <View
                key={`qr-${index}`}
                style={[
                  styles.visualQrCell,
                  (index + 1) % 2 === 0 && styles.visualQrCellFilled,
                ]}
              />
            ))}
          </View>
        </View>
        <View style={styles.visualPhoneCard}>
          <Ionicons name="phone-portrait-outline" size={52} color="#0f172a" />
          <Ionicons name="scan-outline" size={28} color="#b45309" style={styles.visualScanIcon} />
        </View>
      </View>
    );
  }

  if (visual === 'agenda') {
    return (
      <View style={styles.visualShell}>
        <View style={styles.visualAgendaHeader}>
          <Text style={styles.visualPanelTitle}>Agenda</Text>
          <View style={styles.visualLegendPill}><Text style={styles.visualLegendText}>Oggi</Text></View>
        </View>
        <View style={styles.visualAgendaGrid}>
          <View style={styles.visualTimeRail}>
            <Text style={styles.visualTimeText}>09:00</Text>
            <Text style={styles.visualTimeText}>10:00</Text>
            <Text style={styles.visualTimeText}>11:00</Text>
          </View>
          <View style={styles.visualAgendaColumn}>
            <View style={styles.visualAppointmentBlockTall} />
            <View style={styles.visualFreeSlot} />
            <View style={styles.visualAppointmentBlockSmall} />
          </View>
          <View style={styles.visualAgendaColumn}>
            <View style={styles.visualFreeSlot} />
            <View style={styles.visualAppointmentBlockWide} />
            <View style={styles.visualFreeSlot} />
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'speed') {
    return (
      <View style={styles.visualShell}>
        <View style={styles.visualSpeedHub}>
          <View style={styles.visualSpeedCenter}>
            <Ionicons name="flash-outline" size={28} color="#ffffff" />
          </View>
          <View style={[styles.visualSpeedAction, styles.visualSpeedTop]}>
            <Ionicons name="add-circle-outline" size={18} color="#0f172a" />
            <Text style={styles.visualSpeedText}>Appuntamenti</Text>
          </View>
          <View style={[styles.visualSpeedAction, styles.visualSpeedLeft]}>
            <Ionicons name="people-outline" size={18} color="#0f172a" />
            <Text style={styles.visualSpeedText}>Clienti</Text>
          </View>
          <View style={[styles.visualSpeedAction, styles.visualSpeedRight]}>
            <Ionicons name="qr-code-outline" size={18} color="#0f172a" />
            <Text style={styles.visualSpeedText}>QR</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.visualShellCentered}>
      <View style={styles.visualFinalBadge}>
        <Ionicons name="checkmark" size={34} color="#ffffff" />
      </View>
      <Text style={styles.visualFinalText}>Pronto a lavorare meglio</Text>
    </View>
  );
};

export function OnboardingModal({ visible, onClose, onComplete }: OnboardingModalProps) {
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList<OnboardingStep> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const cardWidth = Math.min(width - 32, 560);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), []);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
      const firstVisible = viewableItems[0]?.index ?? 0;
      setCurrentIndex(firstVisible);
    }
  );

  const handlePrimaryAction = () => {
    if (currentIndex === ONBOARDING_STEPS.length - 1) {
      onComplete();
      return;
    }

    flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
  };

  const handleSkip = () => {
    onClose();
  };

  const renderStep = ({ item }: ListRenderItemInfo<OnboardingStep>) => (
    <View style={[styles.slide, { width: cardWidth }]}> 
      <View style={styles.card}>
        <View style={styles.visualWrap}>
          <StepVisual visual={item.visual} />
        </View>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <View style={styles.overlay}>
        <View style={[styles.modalCard, { width: cardWidth }]}> 
          <View style={styles.topRow}>
            <Text style={styles.topLabel}>Onboarding</Text>
            {ONBOARDING_STEPS[currentIndex]?.secondaryCta ? (
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.85}>
                <Text style={styles.skipText}>{ONBOARDING_STEPS[currentIndex]?.secondaryCta}</Text>
              </TouchableOpacity>
            ) : <View style={styles.skipPlaceholder} />}
          </View>

          <FlatList
            ref={flatListRef}
            data={ONBOARDING_STEPS}
            renderItem={renderStep}
            keyExtractor={(item) => item.key}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            bounces={false}
            onViewableItemsChanged={onViewableItemsChanged.current}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={(_, index) => ({ length: cardWidth, offset: cardWidth * index, index })}
          />

          <View style={styles.footer}>
            <View style={styles.dotsRow}>
              {ONBOARDING_STEPS.map((step, index) => (
                <View
                  key={step.key}
                  style={[styles.dot, index === currentIndex && styles.dotActive]}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handlePrimaryAction} activeOpacity={0.9}>
              <Text style={styles.primaryButtonText}>{ONBOARDING_STEPS[currentIndex]?.cta}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 8,
  },
  topLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  skipPlaceholder: {
    width: 44,
  },
  slide: {
    paddingHorizontal: 18,
  },
  card: {
    minHeight: 396,
    justifyContent: 'space-between',
  },
  visualWrap: {
    height: VISUAL_HEIGHT,
    marginBottom: 18,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 6,
  },
  footer: {
    paddingHorizontal: 18,
    marginTop: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#0f172a',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  visualShell: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
    justifyContent: 'space-between',
  },
  visualShellCentered: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visualHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  visualHeroDot: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#b45309',
    marginRight: 12,
  },
  visualHeroContent: {
    flex: 1,
  },
  visualHeroEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400e',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  visualHeroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  visualPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  visualPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    borderRadius: 999,
  },
  visualPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  visualSplitRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  visualMiniPanel: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 12,
  },
  visualMiniPanelAccent: {
    flex: 1,
    backgroundColor: '#eefbf4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#b7e4c7',
    padding: 12,
  },
  visualPanelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
  },
  visualListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  visualListBarWide: {
    height: 12,
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  visualListBarMid: {
    height: 12,
    width: '68%',
    borderRadius: 999,
    backgroundColor: '#94a3b8',
  },
  visualListBarShort: {
    height: 9,
    width: '44%',
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
    marginTop: 6,
  },
  visualPriceTag: {
    borderRadius: 999,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  visualPriceText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1d4ed8',
  },
  visualClientRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  visualAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#0f172a',
  },
  visualAvatarSecondary: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#166534',
  },
  visualClientBars: {
    flex: 1,
  },
  visualQrCard: {
    width: 124,
    height: 124,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  visualQrGrid: {
    width: 88,
    height: 88,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  visualQrCell: {
    width: '20%',
    height: '20%',
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  visualQrCellFilled: {
    backgroundColor: '#111827',
  },
  visualPhoneCard: {
    width: 104,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualScanIcon: {
    position: 'absolute',
    right: 16,
    bottom: 10,
  },
  visualAgendaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  visualLegendPill: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  visualLegendText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
  },
  visualAgendaGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  visualTimeRail: {
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  visualTimeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
  },
  visualAgendaColumn: {
    flex: 1,
    gap: 8,
  },
  visualAppointmentBlockTall: {
    height: 68,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  visualAppointmentBlockSmall: {
    height: 34,
    borderRadius: 16,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  visualAppointmentBlockWide: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  visualFreeSlot: {
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#86efac',
  },
  visualSpeedHub: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualSpeedCenter: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  visualSpeedAction: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  visualSpeedTop: {
    top: 22,
  },
  visualSpeedLeft: {
    left: 8,
    bottom: 36,
  },
  visualSpeedRight: {
    right: 8,
    bottom: 36,
  },
  visualSpeedText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  visualFinalBadge: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  visualFinalText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
  },
});