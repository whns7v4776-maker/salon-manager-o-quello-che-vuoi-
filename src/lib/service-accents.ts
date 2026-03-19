const normalizeValue = (value?: string) =>
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export type ServiceAccent = {
  bg: string;
  border: string;
  text: string;
};

const ROLE_ACCENTS: Record<string, ServiceAccent> = {
  barber: { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  'hair stylist': { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
  colorista: { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' },
  nails: { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' },
  estetica: { bg: '#ecfccb', border: '#bef264', text: '#3f6212' },
  skincare: { bg: '#d1fae5', border: '#86efac', text: '#166534' },
  epilazione: { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  brows: { bg: '#f3e8ff', border: '#d8b4fe', text: '#7e22ce' },
  lashes: { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' },
  'make-up': { bg: '#fce7f3', border: '#f9a8d4', text: '#be185d' },
  massaggi: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  spa: { bg: '#cffafe', border: '#67e8f9', text: '#155e75' },
  tattoo: { bg: '#e2e8f0', border: '#94a3b8', text: '#334155' },
  piercing: { bg: '#fae8ff', border: '#e879f9', text: '#a21caf' },
  pmu: { bg: '#fee2e2', border: '#fca5a5', text: '#be123c' },
  tricologia: { bg: '#ecfccb', border: '#a3e635', text: '#3f6212' },
  wellness: { bg: '#d1fae5', border: '#6ee7b7', text: '#065f46' },
};

export const getServiceAccentByMeta = ({
  serviceName,
  roleName,
}: {
  serviceName?: string;
  roleName?: string;
}): ServiceAccent => {
  const normalizedRole = normalizeValue(roleName);
  if (normalizedRole && ROLE_ACCENTS[normalizedRole]) {
    return ROLE_ACCENTS[normalizedRole];
  }

  const normalizedService = normalizeValue(serviceName);

  if (normalizedService.includes('colore') || normalizedService.includes('color')) {
    return { bg: '#fce7f3', border: '#f9a8d4', text: '#9d174d' };
  }

  if (normalizedService.includes('taglio')) {
    return { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' };
  }

  if (normalizedService.includes('piega')) {
    return { bg: '#ede9fe', border: '#c4b5fd', text: '#5b21b6' };
  }

  if (normalizedService.includes('trattamento')) {
    return { bg: '#ecfccb', border: '#bef264', text: '#3f6212' };
  }

  if (normalizedService.includes('barba')) {
    return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  }

  if (normalizedService.includes('capelli')) {
    return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  }

  return { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' };
};
