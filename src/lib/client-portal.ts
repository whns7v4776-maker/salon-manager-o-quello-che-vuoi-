import { normalizeAvailabilitySettings } from './booking';
import { normalizeWorkspace, type SalonWorkspace } from './platform';
import { supabase } from './supabase';

export type ClientPortalSnapshot = {
  workspace: SalonWorkspace;
  clienti: Array<Record<string, unknown>>;
  appuntamenti: Array<Record<string, unknown>>;
  servizi: Array<Record<string, unknown>>;
  operatori: Array<Record<string, unknown>>;
  richiestePrenotazione: Array<Record<string, unknown>>;
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
};

const normalizePortalSnapshot = (data: Record<string, any> | null): ClientPortalSnapshot | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const workspace = normalizeWorkspace(data.workspace ?? null, data.workspace?.ownerEmail ?? '');

  return {
    workspace,
    clienti: Array.isArray(data.clienti) ? data.clienti : [],
    appuntamenti: Array.isArray(data.appuntamenti) ? data.appuntamenti : [],
    servizi: Array.isArray(data.servizi) ? data.servizi : [],
    operatori: Array.isArray(data.operatori) ? data.operatori : [],
    richiestePrenotazione: Array.isArray(data.richiestePrenotazione)
      ? data.richiestePrenotazione
      : [],
    availabilitySettings: normalizeAvailabilitySettings(data.availabilitySettings ?? {}),
  };
};

export const fetchClientPortalSnapshot = async (salonCode: string) => {
  const { data, error } = await supabase.rpc('get_client_portal_snapshot', {
    p_salon_code: salonCode,
  });

  if (error) {
    throw error;
  }

  return normalizePortalSnapshot((data ?? null) as Record<string, any> | null);
};

export const publishClientPortalSnapshot = async (snapshot: ClientPortalSnapshot) => {
  const payload = {
    workspace: {
      id: snapshot.workspace.id,
      ownerEmail: snapshot.workspace.ownerEmail,
      salonCode: snapshot.workspace.salonCode,
      salonName: snapshot.workspace.salonName,
      salonNameDisplayStyle: snapshot.workspace.salonNameDisplayStyle,
      salonNameFontVariant: snapshot.workspace.salonNameFontVariant,
      businessPhone: snapshot.workspace.businessPhone,
      activityCategory: snapshot.workspace.activityCategory,
      salonAddress: snapshot.workspace.salonAddress,
      streetType: snapshot.workspace.streetType,
      streetName: snapshot.workspace.streetName,
      streetNumber: snapshot.workspace.streetNumber,
      city: snapshot.workspace.city,
      postalCode: snapshot.workspace.postalCode,
      subscriptionPlan: snapshot.workspace.subscriptionPlan,
      subscriptionStatus: snapshot.workspace.subscriptionStatus,
      createdAt: snapshot.workspace.createdAt,
      updatedAt: snapshot.workspace.updatedAt,
    },
    clienti: snapshot.clienti,
    appuntamenti: snapshot.appuntamenti,
    servizi: snapshot.servizi,
    operatori: snapshot.operatori,
    richiestePrenotazione: snapshot.richiestePrenotazione,
    availabilitySettings: snapshot.availabilitySettings,
  };

  const { data, error } = await supabase.rpc('upsert_client_portal_snapshot', {
    p_payload: payload,
  });

  if (error) {
    throw error;
  }

  return typeof data === 'string' ? data : null;
};
