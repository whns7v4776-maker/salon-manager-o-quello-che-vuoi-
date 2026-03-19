export type SubscriptionPlan = 'demo' | 'starter' | 'pro';
export type SubscriptionStatus = 'demo' | 'active' | 'suspended' | 'expired';
export type SalonNameDisplayStyle = 'corsivo' | 'stampatello' | 'minuscolo';
export type SalonNameFontVariant =
  | 'neon'
  | 'condensed'
  | 'poster'
  | 'editorial'
  | 'script';

export type SalonWorkspace = {
  id: string;
  ownerEmail: string;
  salonCode: string;
  salonName: string;
  salonNameDisplayStyle: SalonNameDisplayStyle;
  salonNameFontVariant: SalonNameFontVariant;
  businessPhone: string;
  activityCategory: string;
  salonAddress: string;
  streetType: string;
  streetName: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  createdAt: string;
  updatedAt: string;
  cashSectionDisabled?: boolean;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  lastBackupAt?: string;
};

export const normalizeWorkspaceEmail = (value: string) => value.trim().toLowerCase();

const slugifyValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export const buildSalonCode = (salonName: string, email: string) => {
  const emailBase = normalizeWorkspaceEmail(email).split('@')[0] || 'salone';
  const nameBase =
    salonName.trim() && salonName.trim().toLowerCase() !== 'il tuo salone'
      ? slugifyValue(salonName)
      : slugifyValue(emailBase);
  const emailSuffix = normalizeWorkspaceEmail(email).replace(/[^a-z0-9]/g, '').slice(-4) || 'demo';

  return `${nameBase || 'salone'}-${emailSuffix}`.slice(0, 36);
};

export const normalizeSalonCode = (value: string) => slugifyValue(value).slice(0, 36);

export const formatSalonAddress = (workspace: Pick<
  SalonWorkspace,
  'streetType' | 'streetName' | 'streetNumber' | 'city' | 'postalCode' | 'salonAddress'
>) => {
  const street = [workspace.streetType, workspace.streetName, workspace.streetNumber]
    .map((item) => item.trim())
    .filter(Boolean)
    .join(' ');
  const cityLine = [workspace.postalCode.trim(), workspace.city.trim()].filter(Boolean).join(' ');
  const formatted = [street, cityLine].filter(Boolean).join(', ');

  return formatted || workspace.salonAddress.trim();
};

export const parseSalonAddress = (value: string) => {
  const raw = value.trim();

  if (!raw) {
    return {
      streetLine: '',
      postalCode: '',
      city: '',
    };
  }

  const segments = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const streetLine = segments[0] ?? raw;
  const locationSegment = segments[segments.length - 1] ?? '';
  const locationMatch = locationSegment.match(/^(\d{4,6})\s+(.+)$/);

  if (locationMatch) {
    return {
      streetLine,
      postalCode: locationMatch[1]?.trim() ?? '',
      city: locationMatch[2]?.trim() ?? '',
    };
  }

  return {
    streetLine,
    postalCode: '',
    city: segments.length > 1 ? locationSegment : '',
  };
};

export const createDefaultWorkspace = (email: string): SalonWorkspace => {
  const normalizedEmail = normalizeWorkspaceEmail(email);
  const now = new Date().toISOString();

  return {
    id: `workspace-${normalizedEmail.replace(/[^a-z0-9]/g, '-')}`,
    ownerEmail: normalizedEmail,
    salonCode: buildSalonCode('Il tuo salone', normalizedEmail),
    salonName: 'Il tuo salone',
    salonNameDisplayStyle: 'corsivo',
    salonNameFontVariant: 'neon',
    businessPhone: '',
    activityCategory: '',
    salonAddress: '',
    streetType: '',
    streetName: '',
    streetNumber: '',
    city: '',
    postalCode: '',
    subscriptionPlan: 'demo',
    subscriptionStatus: 'demo',
    createdAt: now,
    updatedAt: now,
    cashSectionDisabled: false,
    trialEndsAt: undefined,
    subscriptionEndsAt: undefined,
    lastBackupAt: undefined,
  };
};

export const normalizeWorkspace = (
  workspace: Partial<SalonWorkspace> | null | undefined,
  email: string
): SalonWorkspace => {
  const fallback = createDefaultWorkspace(email);

  return {
    ...fallback,
    ...workspace,
    ownerEmail: normalizeWorkspaceEmail(workspace?.ownerEmail ?? email),
    salonCode: normalizeSalonCode(
      workspace?.salonCode ?? buildSalonCode(workspace?.salonName ?? fallback.salonName, email)
    ),
    salonNameDisplayStyle:
      workspace?.salonNameDisplayStyle === 'stampatello'
        ? 'stampatello'
        : workspace?.salonNameDisplayStyle === 'minuscolo'
          ? 'minuscolo'
          : 'corsivo',
    salonNameFontVariant:
      workspace?.salonNameFontVariant === 'condensed'
        ? 'condensed'
        : workspace?.salonNameFontVariant === 'poster'
          ? 'poster'
          : workspace?.salonNameFontVariant === 'editorial'
            ? 'editorial'
            : workspace?.salonNameFontVariant === 'script'
              ? 'script'
              : 'neon',
    activityCategory: workspace?.activityCategory?.trim() ?? fallback.activityCategory,
    cashSectionDisabled: workspace?.cashSectionDisabled ?? fallback.cashSectionDisabled,
    salonAddress: formatSalonAddress({
      streetType: workspace?.streetType ?? fallback.streetType,
      streetName: workspace?.streetName ?? fallback.streetName,
      streetNumber: workspace?.streetNumber ?? fallback.streetNumber,
      city: workspace?.city ?? fallback.city,
      postalCode: workspace?.postalCode ?? fallback.postalCode,
      salonAddress: workspace?.salonAddress ?? fallback.salonAddress,
    }),
    updatedAt: workspace?.updatedAt ?? fallback.updatedAt,
  };
};

export const isWorkspaceAccessible = (workspace: SalonWorkspace) =>
  workspace.subscriptionStatus === 'demo' || workspace.subscriptionStatus === 'active';
