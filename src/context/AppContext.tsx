import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  AvailabilitySettings,
  normalizeAvailabilitySettings,
  OperatorAvailability,
  OperatorAvailabilityRange,
} from '../lib/booking';
import { fetchClientPortalSnapshot, publishClientPortalSnapshot } from '../lib/client-portal';
import { AppLanguage, resolveStoredAppLanguage } from '../lib/i18n';
import {
  buildSalonCode,
  createDefaultWorkspace,
  formatSalonAddress,
  isWorkspaceAccessible,
  normalizeSalonCode,
  normalizeWorkspace,
  SalonWorkspace,
} from '../lib/platform';
import { queueWorkspacePushNotification } from '../lib/push/push-notifications';

const STORAGE_KEYS = {
  account_attivo: 'salon_manager_account_attivo',
  owner_accounts: 'salon_manager_owner_accounts',
  owner_session: 'salon_manager_owner_session',
  biometric_enabled: 'salon_manager_biometric_enabled',
  app_language: 'salon_manager_app_language',
  workspace: 'salon_manager_workspace',
  clienti: 'salon_manager_clienti',
  appuntamenti: 'salon_manager_appuntamenti',
  movimenti: 'salon_manager_movimenti',
  servizi: 'salon_manager_servizi',
  carte: 'salon_manager_carte',
  eventi: 'salon_manager_eventi',
  eventi_template: 'salon_manager_eventi_template',
  richieste_prenotazione: 'salon_manager_richieste_prenotazione',
  availability_settings: 'salon_manager_availability_settings',
  operatori: 'salon_manager_operatori',
  daily_auto_cashout: 'salon_manager_daily_auto_cashout',
};

const normalizeAccountEmail = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const buildScopedStorageKey = (baseKey: string, accountEmail: string) =>
  `${baseKey}__${normalizeAccountEmail(accountEmail)}`;

type OwnerAccount = {
  firstName: string;
  lastName: string;
  salonName: string;
  businessPhone: string;
  streetLine: string;
  city: string;
  postalCode: string;
  activityCategory: string;
  email: string;
  password: string;
  createdAt: string;
};

type Cliente = {
  id: string;
  nome: string;
  telefono: string;
  email?: string;
  instagram?: string;
  birthday?: string;
  nota: string;
  fonte?: 'salone' | 'frontend';
  viewedBySalon?: boolean;
  annullamentiCount?: number;
  inibito?: boolean;
};

const normalizeClienti = (items: Cliente[]) =>
  items.map((item) => ({
    ...item,
    email: item.email ?? '',
    instagram: item.instagram ?? '',
    birthday: item.birthday ?? '',
    fonte: item.fonte ?? 'salone',
    viewedBySalon: item.viewedBySalon ?? true,
    annullamentiCount: item.annullamentiCount ?? 0,
    inibito: item.inibito ?? false,
  }));

type Appuntamento = {
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

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const buildAutoCashoutMovementId = (appointmentId: string, dateValue: string) =>
  `auto-cashout-${appointmentId}-${dateValue}`;

const normalizeAppuntamenti = (items: Appuntamento[]) =>
  items.map((item) => ({
    ...item,
    data: item.data ?? getTodayDateString(),
    operatoreId: item.operatoreId ?? '',
    operatoreNome: item.operatoreNome ?? '',
    incassato: item.incassato ?? false,
    completato: item.completato ?? false,
    nonEffettuato: item.nonEffettuato ?? false,
  }));

type Movimento = {
  id: string;
  descrizione: string;
  importo: number;
  metodo?: 'Contanti' | 'Carta' | 'Bonifico';
  cartaLabel?: string;
  createdAt?: string;
};

const deriveMovementCreatedAt = (item: Movimento) => {
  if (item.createdAt?.trim()) return item.createdAt;

  const numericId = Number(item.id);
  if (!Number.isNaN(numericId)) {
    return new Date(numericId).toISOString();
  }

  const autoCashoutMatch = item.id.match(/^auto-cashout-.+-(\d{4}-\d{2}-\d{2})$/);
  if (autoCashoutMatch) {
    return `${autoCashoutMatch[1]}T23:59:00.000Z`;
  }

  return new Date().toISOString();
};

const normalizeMovimenti = (items: Movimento[]) =>
  items.map((item) => ({
    ...item,
    createdAt: deriveMovementCreatedAt(item),
  }));

type CartaCollegata = {
  id: string;
  nome: string;
  circuito: string;
  ultime4: string;
  predefinita?: boolean;
};

const normalizeCarte = (items: CartaCollegata[]) =>
  items.map((item, index) => ({
    ...item,
    predefinita: item.predefinita ?? index === 0,
  }));

type Evento = {
  id: string;
  titolo: string;
  data: string;
  ora: string;
  note?: string;
};

type RichiestaPrenotazione = {
  id: string;
  data: string;
  ora: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  operatoreId?: string;
  operatoreNome?: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string;
  instagram?: string;
  note?: string;
  origine?: 'frontend' | 'backoffice';
  stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
  createdAt: string;
  viewedByCliente?: boolean;
  viewedBySalon?: boolean;
};

const normalizeRichiestePrenotazione = (items: RichiestaPrenotazione[]) =>
  items.map((item) => ({
    ...item,
    operatoreId: item.operatoreId ?? '',
    operatoreNome: item.operatoreNome ?? '',
    origine: item.origine ?? 'frontend',
    viewedByCliente: item.viewedByCliente ?? item.stato === 'In attesa',
    viewedBySalon:
      item.viewedBySalon ??
      !(item.stato === 'In attesa' || item.stato === 'Annullata'),
  }));

type Servizio = {
  id: string;
  nome: string;
  prezzo: number;
  prezzoOriginale?: number;
  durataMinuti?: number;
  mestiereRichiesto?: string;
};

const normalizeServizi = (items: Servizio[]) =>
  items.map((item) => ({
    ...item,
    prezzoOriginale:
      typeof item.prezzoOriginale === 'number' && item.prezzoOriginale > item.prezzo
        ? item.prezzoOriginale
        : undefined,
    durataMinuti: item.durataMinuti ?? 60,
    mestiereRichiesto: item.mestiereRichiesto?.trim() ?? '',
  }));

type Operatore = {
  id: string;
  nome: string;
  mestiere: string;
  availability?: OperatorAvailability;
};

const ALL_OPERATOR_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const normalizeOperatorAvailabilityRanges = (items?: OperatorAvailabilityRange[]) =>
  (items ?? [])
    .map((item, index) => ({
      id: item.id?.trim() || `operator-range-${index}`,
      startDate: item.startDate?.trim() ?? '',
      endDate: item.endDate?.trim() ?? '',
      label: item.label?.trim() ?? '',
    }))
    .filter((item) => item.startDate !== '' && item.endDate !== '' && item.startDate <= item.endDate);

const normalizeOperatorAvailability = (availability?: OperatorAvailability): OperatorAvailability => {
  const enabledWeekdays = Array.isArray(availability?.enabledWeekdays)
    ? availability?.enabledWeekdays
        .filter((item): item is number => Number.isInteger(item) && item >= 0 && item <= 6)
        .filter((item, index, array) => array.indexOf(item) === index)
        .sort((first, second) => first - second)
    : [];

  return {
    enabledWeekdays: enabledWeekdays.length > 0 ? enabledWeekdays : ALL_OPERATOR_WEEKDAYS,
    dateRanges: normalizeOperatorAvailabilityRanges(availability?.dateRanges),
  };
};

const normalizeOperatori = (items: Operatore[]) =>
  items.map((item) => ({
    ...item,
    nome: item.nome.trim(),
    mestiere: item.mestiere.trim(),
    availability: normalizeOperatorAvailability(item.availability),
  }));

type AppContextType = {
  appLanguage: AppLanguage;
  setAppLanguage: React.Dispatch<React.SetStateAction<AppLanguage>>;
  isAuthenticated: boolean;
  biometricEnabled: boolean;
  setBiometricEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  unlockOwnerAccountWithBiometric: () => Promise<{ ok: boolean; error?: string }>;
  loginOwnerAccount: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  registerOwnerAccount: (params: {
    firstName: string;
    lastName: string;
    salonName: string;
    businessPhone: string;
    streetLine: string;
    city: string;
    postalCode: string;
    activityCategory: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; email?: string }>;
  requestOwnerPasswordReset: (
    email: string
  ) => Promise<{ ok: boolean; error?: string; backendRequired?: boolean }>;
  logoutOwnerAccount: () => Promise<void>;
  salonAccountEmail: string;
  switchSalonAccount: (email: string) => Promise<boolean>;
  salonWorkspace: SalonWorkspace;
  setSalonWorkspace: React.Dispatch<React.SetStateAction<SalonWorkspace>>;
  workspaceAccessAllowed: boolean;
  clienti: Cliente[];
  setClienti: React.Dispatch<React.SetStateAction<Cliente[]>>;
  appuntamenti: Appuntamento[];
  setAppuntamenti: React.Dispatch<React.SetStateAction<Appuntamento[]>>;
  movimenti: Movimento[];
  setMovimenti: React.Dispatch<React.SetStateAction<Movimento[]>>;
  servizi: Servizio[];
  setServizi: React.Dispatch<React.SetStateAction<Servizio[]>>;
  operatori: Operatore[];
  setOperatori: React.Dispatch<React.SetStateAction<Operatore[]>>;
  carteCollegate: CartaCollegata[];
  setCarteCollegate: React.Dispatch<React.SetStateAction<CartaCollegata[]>>;
  eventi: Evento[];
  setEventi: React.Dispatch<React.SetStateAction<Evento[]>>;
  richiestePrenotazione: RichiestaPrenotazione[];
  setRichiestePrenotazione: React.Dispatch<React.SetStateAction<RichiestaPrenotazione[]>>;
  availabilitySettings: AvailabilitySettings;
  setAvailabilitySettings: React.Dispatch<React.SetStateAction<AvailabilitySettings>>;
  messaggioEventoTemplate: string;
  setMessaggioEventoTemplate: React.Dispatch<React.SetStateAction<string>>;
  resolveSalonByCode: (code: string) => Promise<{
    workspace: SalonWorkspace;
    clienti: Cliente[];
    appuntamenti: Appuntamento[];
    servizi: Servizio[];
    operatori: Operatore[];
    richiestePrenotazione: RichiestaPrenotazione[];
    availabilitySettings: AvailabilitySettings;
  } | null>;
  upsertFrontendCustomerForSalon: (params: {
    salonCode: string;
    profile: {
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
      instagram?: string;
    };
  }) => Promise<boolean>;
  addBookingRequestForSalon: (
    salonCode: string,
    request: RichiestaPrenotazione
  ) => Promise<boolean>;
  markClientRequestsViewedForSalon: (
    salonCode: string,
    email: string,
    telefono: string
  ) => Promise<void>;
  cancelClientAppointmentForSalon: (params: {
    salonCode: string;
    requestId: string;
    email: string;
    telefono: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  isLoaded: boolean;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('it');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [salonAccountEmail, setSalonAccountEmail] = useState('');
  const [salonWorkspace, setSalonWorkspace] = useState<SalonWorkspace>(
    createDefaultWorkspace('')
  );
  const [clienti, setClienti] = useState<Cliente[]>(normalizeClienti([]));
  const [appuntamenti, setAppuntamenti] = useState<Appuntamento[]>(normalizeAppuntamenti([]));
  const [movimenti, setMovimenti] = useState<Movimento[]>(normalizeMovimenti([]));
  const [servizi, setServizi] = useState<Servizio[]>(normalizeServizi([]));
  const [operatori, setOperatori] = useState<Operatore[]>(normalizeOperatori([]));
  const [carteCollegate, setCarteCollegate] = useState<CartaCollegata[]>([]);
  const [eventi, setEventi] = useState<Evento[]>([]);
  const [richiestePrenotazione, setRichiestePrenotazione] = useState<
    RichiestaPrenotazione[]
  >([]);
  const [availabilitySettings, setAvailabilitySettings] = useState<AvailabilitySettings>(
    normalizeAvailabilitySettings()
  );
  const [messaggioEventoTemplate, setMessaggioEventoTemplate] = useState(
    'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
  );
  const [isLoaded, setIsLoaded] = useState(false);

  const isUuid = React.useCallback(
    (value?: string | null) =>
      !!value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    []
  );

  const clearRuntimeDataForAccount = React.useCallback((email: string) => {
    setSalonWorkspace(createDefaultWorkspace(email));
    setClienti(normalizeClienti([]));
    setAppuntamenti(normalizeAppuntamenti([]));
    setMovimenti(normalizeMovimenti([]));
    setServizi(normalizeServizi([]));
    setOperatori(normalizeOperatori([]));
    setCarteCollegate([]);
    setEventi([]);
    setRichiestePrenotazione([]);
    setAvailabilitySettings(normalizeAvailabilitySettings());
    setBiometricEnabled(false);
    setMessaggioEventoTemplate(
      'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
    );
  }, []);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;

    const processEndOfDayCashout = async () => {
      const today = getTodayDateString();
      const storageKey = buildScopedStorageKey(
        STORAGE_KEYS.daily_auto_cashout,
        salonAccountEmail
      );

      try {
        const lastProcessedDate = await AsyncStorage.getItem(storageKey);
        if (lastProcessedDate === today) {
          return;
        }

        let appointmentsChanged = false;
        let movementsChanged = false;

        setAppuntamenti((current) => {
          const nextAppointments = current.map((item) => {
            const appointmentDate = item.data ?? today;
            const shouldAutoCashout =
              appointmentDate < today &&
              !item.incassato &&
              !item.nonEffettuato;

            if (!shouldAutoCashout) {
              return item;
            }

            appointmentsChanged = true;
            return {
              ...item,
              completato: true,
              incassato: true,
            };
          });

          return appointmentsChanged ? nextAppointments : current;
        });

        setMovimenti((current) => {
          const nextMovements = [...current];

          appuntamenti.forEach((item) => {
            const appointmentDate = item.data ?? today;
            const shouldAutoCashout =
              appointmentDate < today &&
              !item.incassato &&
              !item.nonEffettuato;

            if (!shouldAutoCashout) {
              return;
            }

            const movementId = buildAutoCashoutMovementId(item.id, appointmentDate);
            const alreadyPresent = nextMovements.some((movement) => movement.id === movementId);
            if (alreadyPresent) {
              return;
            }

            movementsChanged = true;
            nextMovements.unshift({
              id: movementId,
              descrizione: `Incasso automatico fine giornata · ${item.servizio} · ${item.cliente}`,
              importo: item.prezzo,
              metodo: 'Contanti',
              createdAt: `${appointmentDate}T23:59:00.000Z`,
            });
          });

          return movementsChanged ? nextMovements : current;
        });

        await AsyncStorage.setItem(storageKey, today);
      } catch (error) {
        console.log('Errore chiusura automatica fine giornata:', error);
      }
    };

    processEndOfDayCashout();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        processEndOfDayCashout();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [appuntamenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    const caricaAccountAttivo = async () => {
      try {
        const [accountSalvato, sessioneSalvata, linguaSalvata] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.account_attivo),
          AsyncStorage.getItem(STORAGE_KEYS.owner_session),
          AsyncStorage.getItem(STORAGE_KEYS.app_language),
        ]);
        const sessionEmail = normalizeAccountEmail(sessioneSalvata);
        const normalizedAccount = sessionEmail || normalizeAccountEmail(accountSalvato);

        if (!accountSalvato && normalizedAccount) {
          await AsyncStorage.setItem(STORAGE_KEYS.account_attivo, normalizedAccount);
        }

        setIsAuthenticated(!!sessionEmail);
        setSalonAccountEmail(normalizedAccount);
        setAppLanguage(resolveStoredAppLanguage(linguaSalvata));
      } catch (error) {
        console.log('Errore caricamento account:', error);
      }
    };

    caricaAccountAttivo();
  }, []);

  useEffect(() => {
    const caricaDatiAccount = async () => {
      if (!salonAccountEmail) {
        clearRuntimeDataForAccount('');
        setIsLoaded(true);
        return;
      }

      setIsLoaded(false);

      try {
        const clientiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail)
        );
        const workspaceSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail)
        );
        const appuntamentiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.appuntamenti, salonAccountEmail)
        );
        const movimentiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.movimenti, salonAccountEmail)
        );
        const serviziSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.servizi, salonAccountEmail)
        );
        const carteSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.carte, salonAccountEmail)
        );
        const operatoriSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.operatori, salonAccountEmail)
        );
        const eventiSalvati = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.eventi, salonAccountEmail)
        );
        const richiesteSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, salonAccountEmail)
        );
        const availabilitySettingsSalvate = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail)
        );
        const biometricEnabledSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, salonAccountEmail)
        );
        const templateEventiSalvato = await AsyncStorage.getItem(
          buildScopedStorageKey(STORAGE_KEYS.eventi_template, salonAccountEmail)
        );

        setSalonWorkspace(
          workspaceSalvato
            ? normalizeWorkspace(JSON.parse(workspaceSalvato), salonAccountEmail)
            : createDefaultWorkspace(salonAccountEmail)
        );
        setClienti(
          clientiSalvati ? normalizeClienti(JSON.parse(clientiSalvati)) : normalizeClienti([])
        );
        setAppuntamenti(
          appuntamentiSalvati ? normalizeAppuntamenti(JSON.parse(appuntamentiSalvati)) : normalizeAppuntamenti([])
        );
        setMovimenti(
          movimentiSalvati ? normalizeMovimenti(JSON.parse(movimentiSalvati)) : normalizeMovimenti([])
        );
        setServizi(
          serviziSalvati ? normalizeServizi(JSON.parse(serviziSalvati)) : normalizeServizi([])
        );
        setOperatori(operatoriSalvati ? normalizeOperatori(JSON.parse(operatoriSalvati)) : []);
        setCarteCollegate(carteSalvate ? normalizeCarte(JSON.parse(carteSalvate)) : []);
        setEventi(eventiSalvati ? JSON.parse(eventiSalvati) : []);
        setRichiestePrenotazione(
          richiesteSalvate ? normalizeRichiestePrenotazione(JSON.parse(richiesteSalvate)) : []
        );
        setAvailabilitySettings(
          availabilitySettingsSalvate
            ? normalizeAvailabilitySettings(JSON.parse(availabilitySettingsSalvate))
            : normalizeAvailabilitySettings()
        );
        setBiometricEnabled(biometricEnabledSalvato === 'true');
        setMessaggioEventoTemplate(
          templateEventiSalvato ??
            'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
        );
      } catch (error) {
        console.log('Errore caricamento dati account:', error);
        setSalonWorkspace(createDefaultWorkspace(salonAccountEmail));
        setClienti(normalizeClienti([]));
        setAppuntamenti(normalizeAppuntamenti([]));
        setMovimenti(normalizeMovimenti([]));
        setServizi(normalizeServizi([]));
        setOperatori(normalizeOperatori([]));
        setCarteCollegate([]);
        setEventi([]);
        setRichiestePrenotazione([]);
        setAvailabilitySettings(normalizeAvailabilitySettings());
        setBiometricEnabled(false);
        setMessaggioEventoTemplate(
          'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
        );
      } finally {
        setIsLoaded(true);
      }
    };

    caricaDatiAccount();
  }, [salonAccountEmail]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.app_language, appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    if (!isLoaded) return;

    const normalizedOwnerEmail = normalizeAccountEmail(
      salonWorkspace.ownerEmail || salonAccountEmail
    );
    const normalizedSalonCode = normalizeSalonCode(salonWorkspace.salonCode);

    if (!normalizedOwnerEmail || !normalizedSalonCode || !salonWorkspace.salonName.trim()) {
      return;
    }

    let cancelled = false;

    const publishPortalSnapshot = async () => {
      try {
        const workspaceId = await publishClientPortalSnapshot({
          workspace: {
            ...salonWorkspace,
            ownerEmail: normalizedOwnerEmail,
            salonCode: normalizedSalonCode,
          },
          clienti: clienti as unknown as Array<Record<string, unknown>>,
          appuntamenti: appuntamenti as unknown as Array<Record<string, unknown>>,
          servizi: servizi as unknown as Array<Record<string, unknown>>,
          operatori: operatori as unknown as Array<Record<string, unknown>>,
          richiestePrenotazione:
            richiestePrenotazione as unknown as Array<Record<string, unknown>>,
          availabilitySettings,
        });

        if (!cancelled && workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({
            ...current,
            id: workspaceId,
            ownerEmail: normalizedOwnerEmail,
            salonCode: normalizedSalonCode,
          }));
        }
      } catch (error) {
        console.log('Errore pubblicazione portale cliente:', error);
      }
    };

    void publishPortalSnapshot();

    return () => {
      cancelled = true;
    };
  }, [
    appuntamenti,
    availabilitySettings,
    clienti,
    isLoaded,
    operatori,
    richiestePrenotazione,
    salonAccountEmail,
    salonWorkspace,
    servizi,
  ]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.workspace, salonAccountEmail),
      JSON.stringify({
        ...salonWorkspace,
        ownerEmail: salonAccountEmail,
        salonCode:
          normalizeSalonCode(salonWorkspace.salonCode) ||
          buildSalonCode(salonWorkspace.salonName, salonAccountEmail),
        updatedAt: new Date().toISOString(),
      })
    );
  }, [salonWorkspace, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.clienti, salonAccountEmail),
      JSON.stringify(clienti)
    );
  }, [clienti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.appuntamenti, salonAccountEmail),
      JSON.stringify(appuntamenti)
    );
  }, [appuntamenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.movimenti, salonAccountEmail),
      JSON.stringify(movimenti)
    );
  }, [movimenti, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.servizi, salonAccountEmail),
      JSON.stringify(servizi)
    );
  }, [servizi, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.operatori, salonAccountEmail),
      JSON.stringify(operatori)
    );
  }, [operatori, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.carte, salonAccountEmail),
      JSON.stringify(carteCollegate)
    );
  }, [carteCollegate, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi, salonAccountEmail),
      JSON.stringify(eventi)
    );
  }, [eventi, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, salonAccountEmail),
      JSON.stringify(richiestePrenotazione)
    );
  }, [richiestePrenotazione, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.availability_settings, salonAccountEmail),
      JSON.stringify(availabilitySettings)
    );
  }, [availabilitySettings, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.biometric_enabled, salonAccountEmail),
      biometricEnabled ? 'true' : 'false'
    );
  }, [biometricEnabled, isLoaded, salonAccountEmail]);

  useEffect(() => {
    if (!isLoaded || !salonAccountEmail) return;
    AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi_template, salonAccountEmail),
      messaggioEventoTemplate
    );
  }, [messaggioEventoTemplate, isLoaded, salonAccountEmail]);

  const switchSalonAccount = async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return false;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.account_attivo, normalizedEmail);
    setIsLoaded(false);
    clearRuntimeDataForAccount(normalizedEmail);
    setSalonAccountEmail(normalizedEmail);
    return true;
  };

  const loadOwnerAccounts = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.owner_accounts);
      const parsed = raw ? (JSON.parse(raw) as OwnerAccount[]) : [];
      return parsed.map((item) => ({
        ...item,
        email: normalizeAccountEmail(item.email),
      }));
    } catch (error) {
      console.log('Errore caricamento account proprietari:', error);
      return [] as OwnerAccount[];
    }
  };

  const loginOwnerAccount = async (email: string, password: string) => {
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      return { ok: false, error: 'Inserisci email e password.' };
    }

    const accounts = await loadOwnerAccounts();
    const account = accounts.find(
      (item) =>
        item.email === normalizedEmail && item.password.trim() === normalizedPassword
    );

    if (!account) {
      return { ok: false, error: 'Email o password non corretti.' };
    }

    await AsyncStorage.setItem(STORAGE_KEYS.owner_session, normalizedEmail);
    await switchSalonAccount(normalizedEmail);
    setIsAuthenticated(true);
    return { ok: true };
  };

  const unlockOwnerAccountWithBiometric = async () => {
    const normalizedEmail = normalizeAccountEmail(salonAccountEmail);

    if (!normalizedEmail) {
      return { ok: false, error: 'Non ho trovato un account attivo su questo dispositivo.' };
    }

    const accounts = await loadOwnerAccounts();
    const account = accounts.find((item) => item.email === normalizedEmail);

    if (!account) {
      return { ok: false, error: 'Questo dispositivo non ha un account proprietario salvato.' };
    }

    await AsyncStorage.setItem(STORAGE_KEYS.owner_session, normalizedEmail);
    await switchSalonAccount(normalizedEmail);
    setIsAuthenticated(true);
    return { ok: true };
  };

  const registerOwnerAccount = async ({
    firstName,
    lastName,
    salonName,
    businessPhone,
    streetLine,
    city,
    postalCode,
    activityCategory,
    email,
    password,
  }: {
    firstName: string;
    lastName: string;
    salonName: string;
    businessPhone: string;
    streetLine: string;
    city: string;
    postalCode: string;
    activityCategory: string;
    email: string;
    password: string;
  }) => {
    const normalizedEmail = normalizeAccountEmail(email);
    const normalizedPassword = password.trim();
    const normalizedActivityCategory = activityCategory.trim().toUpperCase();

    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !salonName.trim() ||
      !businessPhone.trim() ||
      !streetLine.trim() ||
      !city.trim() ||
      !postalCode.trim() ||
      !normalizedActivityCategory ||
      !normalizedEmail ||
      !normalizedPassword
    ) {
      return { ok: false, error: 'Compila tutti i campi obbligatori.' };
    }

    const accounts = await loadOwnerAccounts();
    if (accounts.some((item) => item.email === normalizedEmail)) {
      return { ok: false, error: 'Esiste già un account registrato con questa mail.' };
    }

    const now = new Date().toISOString();
    const nextAccount: OwnerAccount = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      salonName: salonName.trim(),
      businessPhone: businessPhone.trim(),
      streetLine: streetLine.trim().toUpperCase(),
      city: city.trim().toUpperCase(),
      postalCode: postalCode.trim(),
      activityCategory: normalizedActivityCategory,
      email: normalizedEmail,
      password: normalizedPassword,
      createdAt: now,
    };

    const formattedAddress = formatSalonAddress({
      streetType: '',
      streetName: streetLine.trim().toUpperCase(),
      streetNumber: '',
      city: city.trim().toUpperCase(),
      postalCode: postalCode.trim(),
      salonAddress: '',
    });

    const nextAccounts = [nextAccount, ...accounts];

    const workspace = normalizeWorkspace(
      {
        salonName: salonName.trim(),
        ownerEmail: normalizedEmail,
        businessPhone: businessPhone.trim(),
        activityCategory: normalizedActivityCategory,
        streetType: '',
        streetName: streetLine.trim().toUpperCase(),
        streetNumber: '',
        city: city.trim().toUpperCase(),
        postalCode: postalCode.trim(),
        salonAddress: formattedAddress,
        salonCode: buildSalonCode(salonName.trim(), normalizedEmail),
        createdAt: now,
        updatedAt: now,
      },
      normalizedEmail
    );

    await AsyncStorage.setItem(STORAGE_KEYS.owner_accounts, JSON.stringify(nextAccounts));
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.workspace, normalizedEmail),
      JSON.stringify(workspace)
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.clienti, normalizedEmail),
      JSON.stringify(normalizeClienti([]))
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.appuntamenti, normalizedEmail),
      JSON.stringify(normalizeAppuntamenti([]))
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.movimenti, normalizedEmail),
      JSON.stringify([])
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.servizi, normalizedEmail),
      JSON.stringify(normalizeServizi([]))
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.operatori, normalizedEmail),
      JSON.stringify(normalizeOperatori([]))
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.carte, normalizedEmail),
      JSON.stringify([])
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi, normalizedEmail),
      JSON.stringify([])
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.richieste_prenotazione, normalizedEmail),
      JSON.stringify([])
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.availability_settings, normalizedEmail),
      JSON.stringify(normalizeAvailabilitySettings())
    );
    await AsyncStorage.setItem(
      buildScopedStorageKey(STORAGE_KEYS.eventi_template, normalizedEmail),
      'Ciao! Ti aspetto a {evento} il {data} alle {ora}. Scrivimi per conferma.'
    );
    return { ok: true, email: normalizedEmail };
  };

  const requestOwnerPasswordReset = async (email: string) => {
    const normalizedEmail = normalizeAccountEmail(email);

    if (!normalizedEmail) {
      return { ok: false, error: 'Inserisci una mail valida.' };
    }

    const accounts = await loadOwnerAccounts();
    const exists = accounts.some((item) => item.email === normalizedEmail);

    if (!exists) {
      return { ok: false, error: 'Non ho trovato un account registrato con questa mail.' };
    }

    return { ok: true, backendRequired: true };
  };

  const logoutOwnerAccount = async () => {
    await AsyncStorage.removeItem(STORAGE_KEYS.owner_session);
    setIsAuthenticated(false);
  };

  const resolveSalonByCode = async (code: string) => {
    const normalizedCode = normalizeSalonCode(code);

    if (!normalizedCode) return null;

    try {
      const remoteSnapshot = await fetchClientPortalSnapshot(normalizedCode);

      if (remoteSnapshot) {
        return {
          workspace: remoteSnapshot.workspace,
          clienti: normalizeClienti(remoteSnapshot.clienti as Cliente[]),
          appuntamenti: normalizeAppuntamenti(remoteSnapshot.appuntamenti as Appuntamento[]),
          servizi: normalizeServizi(remoteSnapshot.servizi as Servizio[]),
          operatori: normalizeOperatori(remoteSnapshot.operatori as Operatore[]),
          richiestePrenotazione: normalizeRichiestePrenotazione(
            remoteSnapshot.richiestePrenotazione as RichiestaPrenotazione[]
          ),
          availabilitySettings: normalizeAvailabilitySettings(remoteSnapshot.availabilitySettings),
        };
      }

      if (
        isAuthenticated &&
        normalizedCode === normalizeSalonCode(salonWorkspace.salonCode) &&
        salonWorkspace.salonName.trim()
      ) {
        return {
          workspace: salonWorkspace,
          clienti,
          appuntamenti,
          servizi,
          operatori,
          richiestePrenotazione,
          availabilitySettings,
        };
      }

      return null;
    } catch (error) {
      console.log('Errore caricamento salone pubblico:', error);
      return null;
    }
  };

  const upsertFrontendCustomerForSalon = async ({
    salonCode,
    profile,
  }: {
    salonCode: string;
    profile: {
      nome: string;
      cognome: string;
      email: string;
      telefono: string;
      instagram?: string;
    };
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) return false;

      const customerName = `${profile.nome.trim()} ${profile.cognome.trim()}`.trim();
      const existingCustomer = resolved.clienti.find(
        (item) =>
          item.telefono.trim() === profile.telefono.trim() ||
          item.email?.trim().toLowerCase() === profile.email.trim().toLowerCase()
      );

      const nextCustomers = existingCustomer
        ? resolved.clienti.map((item) =>
            item.id === existingCustomer.id
              ? {
                  ...item,
                  nome: customerName,
                  telefono: profile.telefono.trim(),
                  email: profile.email.trim(),
                  instagram: profile.instagram?.trim() ?? '',
                  fonte: 'frontend' as const,
                  viewedBySalon: false,
                }
              : item
          )
        : [
            {
              id: `cliente-front-${Date.now()}`,
              nome: customerName,
              telefono: profile.telefono.trim(),
              email: profile.email.trim(),
              instagram: profile.instagram?.trim() ?? '',
              nota: '',
              fonte: 'frontend' as const,
              viewedBySalon: false,
            },
            ...resolved.clienti,
          ];

      const workspaceId = await publishClientPortalSnapshot({
        workspace: resolved.workspace,
        clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
        appuntamenti: resolved.appuntamenti as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione:
          resolved.richiestePrenotazione as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setClienti(nextCustomers);
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      return true;
    } catch (error) {
      console.log('Errore salvataggio cliente frontend:', error);
      return false;
    }
  };

  const addBookingRequestForSalon = async (
    salonCode: string,
    request: RichiestaPrenotazione
  ) => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) return false;

      const nextRequests = [request, ...resolved.richiestePrenotazione];

      const workspaceId = await publishClientPortalSnapshot({
        workspace: resolved.workspace,
        clienti: resolved.clienti as unknown as Array<Record<string, unknown>>,
        appuntamenti: resolved.appuntamenti as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione:
          normalizeRichiestePrenotazione(nextRequests) as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setRichiestePrenotazione(normalizeRichiestePrenotazione(nextRequests));
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      await queueWorkspacePushNotification({
        workspaceId: resolved.workspace.id,
        eventType: 'booking_request_created',
        title: 'Nuova richiesta prenotazione',
        body: `${request.nome} ${request.cognome} - ${request.servizio} alle ${request.ora}`,
        payload: {
          type: 'booking_request_created',
          bookingRequestId: request.id,
          appointmentDate: request.data,
          appointmentTime: request.ora,
          customerName: `${request.nome} ${request.cognome}`.trim(),
          serviceName: request.servizio,
        },
      });

      return true;
    } catch (error) {
      console.log('Errore salvataggio richiesta frontend:', error);
      return false;
    }
  };

  const markClientRequestsViewedForSalon = async (
    salonCode: string,
    email: string,
    telefono: string
  ) => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) return;

      const nextRequests = resolved.richiestePrenotazione.map((item: RichiestaPrenotazione) =>
        item.email.trim().toLowerCase() === email.trim().toLowerCase() &&
        item.telefono.trim() === telefono.trim() &&
        item.stato !== 'In attesa'
          ? { ...item, viewedByCliente: true }
          : item
      );

      const workspaceId = await publishClientPortalSnapshot({
        workspace: resolved.workspace,
        clienti: resolved.clienti as unknown as Array<Record<string, unknown>>,
        appuntamenti: resolved.appuntamenti as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione:
          normalizeRichiestePrenotazione(nextRequests) as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setRichiestePrenotazione(normalizeRichiestePrenotazione(nextRequests));
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }
    } catch (error) {
      console.log('Errore aggiornamento richieste cliente lette:', error);
    }
  };

  const cancelClientAppointmentForSalon = async ({
    salonCode,
    requestId,
    email,
    telefono,
  }: {
    salonCode: string;
    requestId: string;
    email: string;
    telefono: string;
  }) => {
    const normalizedCode = normalizeSalonCode(salonCode);

    try {
      const resolved = await resolveSalonByCode(normalizedCode);
      if (!resolved) {
        return { ok: false, error: 'Salone non trovato.' };
      }

      const requestToCancel = resolved.richiestePrenotazione.find((item) => item.id === requestId);
      if (!requestToCancel) {
        return { ok: false, error: 'Prenotazione non trovata.' };
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPhone = telefono.trim();
      if (
        requestToCancel.email.trim().toLowerCase() !== normalizedEmail ||
        requestToCancel.telefono.trim() !== normalizedPhone
      ) {
        return { ok: false, error: 'Questa prenotazione non appartiene al profilo cliente attivo.' };
      }

      const normalizedFullName = `${requestToCancel.nome} ${requestToCancel.cognome}`.trim().toLowerCase();
      const nextRequests = normalizeRichiestePrenotazione(
        resolved.richiestePrenotazione.map((item) =>
          item.id === requestId
            ? {
                ...item,
                stato: 'Annullata',
                viewedByCliente: true,
                viewedBySalon: false,
              }
            : item
        )
      );

      const nextAppointments = resolved.appuntamenti.filter((item) => {
        const itemDate = item.data ?? getTodayDateString();
        return !(
          itemDate === requestToCancel.data &&
          item.ora === requestToCancel.ora &&
          item.servizio.trim().toLowerCase() === requestToCancel.servizio.trim().toLowerCase() &&
          item.cliente.trim().toLowerCase() === normalizedFullName &&
          !item.completato &&
          !item.incassato &&
          !item.nonEffettuato
        );
      });

      const nextCustomers = normalizeClienti(
        resolved.clienti.map((item) => {
          const matchesByPhone = item.telefono.trim() === normalizedPhone;
          const matchesByEmail = (item.email ?? '').trim().toLowerCase() === normalizedEmail;
          if (!matchesByPhone && !matchesByEmail) return item;

          return {
            ...item,
            annullamentiCount: (item.annullamentiCount ?? 0) + 1,
            viewedBySalon: false,
          };
        })
      );

      const workspaceId = await publishClientPortalSnapshot({
        workspace: resolved.workspace,
        clienti: nextCustomers as unknown as Array<Record<string, unknown>>,
        appuntamenti: nextAppointments as unknown as Array<Record<string, unknown>>,
        servizi: resolved.servizi as unknown as Array<Record<string, unknown>>,
        operatori: resolved.operatori as unknown as Array<Record<string, unknown>>,
        richiestePrenotazione: nextRequests as unknown as Array<Record<string, unknown>>,
        availabilitySettings: resolved.availabilitySettings,
      });

      if (normalizedCode === salonWorkspace.salonCode && resolved.workspace.ownerEmail === salonAccountEmail) {
        setRichiestePrenotazione(nextRequests);
        setAppuntamenti(nextAppointments);
        setClienti(nextCustomers);
        if (workspaceId && workspaceId !== salonWorkspace.id) {
          setSalonWorkspace((current) => ({ ...current, id: workspaceId }));
        }
      }

      await queueWorkspacePushNotification({
        workspaceId: resolved.workspace.id,
        eventType: 'appointment_cancelled',
        title: 'Prenotazione annullata dal cliente',
        body: `${requestToCancel.nome} ${requestToCancel.cognome} - ${requestToCancel.servizio} alle ${requestToCancel.ora}`,
        payload: {
          type: 'appointment_cancelled',
          bookingRequestId: requestToCancel.id,
          appointmentDate: requestToCancel.data,
          appointmentTime: requestToCancel.ora,
          customerName: `${requestToCancel.nome} ${requestToCancel.cognome}`.trim(),
          serviceName: requestToCancel.servizio,
        },
      });

      return { ok: true };
    } catch (error) {
      console.log('Errore annullamento prenotazione cliente:', error);
      return { ok: false, error: 'Non sono riuscito ad annullare la prenotazione.' };
    }
  };

  const workspaceAccessAllowed = isWorkspaceAccessible(salonWorkspace);

  return (
    <AppContext.Provider
      value={{
        appLanguage,
        setAppLanguage,
        isAuthenticated,
        biometricEnabled,
        setBiometricEnabled,
        unlockOwnerAccountWithBiometric,
        loginOwnerAccount,
        registerOwnerAccount,
        requestOwnerPasswordReset,
        logoutOwnerAccount,
        salonAccountEmail,
        switchSalonAccount,
        salonWorkspace,
        setSalonWorkspace,
        workspaceAccessAllowed,
        clienti,
        setClienti,
        appuntamenti,
        setAppuntamenti,
        movimenti,
        setMovimenti,
        servizi,
        setServizi,
        operatori,
        setOperatori,
        carteCollegate,
        setCarteCollegate,
        eventi,
        setEventi,
        richiestePrenotazione,
        setRichiestePrenotazione,
        availabilitySettings,
        setAvailabilitySettings,
        messaggioEventoTemplate,
        setMessaggioEventoTemplate,
        resolveSalonByCode,
        upsertFrontendCustomerForSalon,
        addBookingRequestForSalon,
        markClientRequestsViewedForSalon,
        cancelClientAppointmentForSalon,
        isLoaded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext deve essere usato dentro AppProvider');
  }

  return context;
}
