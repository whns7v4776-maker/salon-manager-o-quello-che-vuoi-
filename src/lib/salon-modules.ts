import { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type SalonModuleKey =
  | 'index'
  | 'agenda'
  | 'prenotazioni'
  | 'clienti'
  | 'cassa'
  | 'servizi';

type ModuleIconName = ComponentProps<typeof Ionicons>['name'];

type SalonModuleConfig = {
  icon: {
    active: ModuleIconName;
    inactive: ModuleIconName;
  };
  accent: {
    background: string;
    border: string;
    text: string;
  };
};

export const SALON_MODULES: Record<SalonModuleKey, SalonModuleConfig> = {
  index: {
    icon: {
      active: 'home',
      inactive: 'home-outline',
    },
    accent: {
      background: '#dbeafe',
      border: '#93c5fd',
      text: '#1d4ed8',
    },
  },
  agenda: {
    icon: {
      active: 'calendar',
      inactive: 'calendar-outline',
    },
    accent: {
      background: '#dcfce7',
      border: '#86efac',
      text: '#166534',
    },
  },
  prenotazioni: {
    icon: {
      active: 'notifications',
      inactive: 'notifications-outline',
    },
    accent: {
      background: '#fee2e2',
      border: '#fca5a5',
      text: '#b91c1c',
    },
  },
  clienti: {
    icon: {
      active: 'people',
      inactive: 'people-outline',
    },
    accent: {
      background: '#ede9fe',
      border: '#c4b5fd',
      text: '#6d28d9',
    },
  },
  cassa: {
    icon: {
      active: 'card',
      inactive: 'card-outline',
    },
    accent: {
      background: '#fef3c7',
      border: '#fcd34d',
      text: '#b45309',
    },
  },
  servizi: {
    icon: {
      active: 'cut',
      inactive: 'cut-outline',
    },
    accent: {
      background: '#fce7f3',
      border: '#f9a8d4',
      text: '#be185d',
    },
  },
};
