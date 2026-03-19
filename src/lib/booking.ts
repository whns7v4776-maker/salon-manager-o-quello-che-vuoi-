export type SharedService = {
  id: string;
  nome: string;
  prezzo: number;
  prezzoOriginale?: number;
  durataMinuti?: number;
  mestiereRichiesto?: string;
};

export type SharedOperator = {
  id: string;
  nome: string;
  mestiere: string;
  availability?: OperatorAvailability;
};

export type OperatorAvailabilityRange = {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
};

export type OperatorAvailability = {
  enabledWeekdays: number[];
  dateRanges: OperatorAvailabilityRange[];
};

export type SharedAppointment = {
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
};

export type FutureDateItem = {
  value: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  fullLabel: string;
};

export type WeeklyScheduleDay = {
  weekday: number;
  isClosed: boolean;
  startTime: string;
  endTime: string;
};

export type VacationRange = {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
};

export type DateOverride = {
  date: string;
  forceOpen?: boolean;
  closed?: boolean;
};

export type SlotOverride = {
  date: string;
  time: string;
  blocked: boolean;
};

export type AvailabilitySettings = {
  weeklySchedule: WeeklyScheduleDay[];
  vacationRanges: VacationRange[];
  dateOverrides: DateOverride[];
  slotOverrides: SlotOverride[];
  dateSlotIntervals: { date: string; slotIntervalMinutes: number }[];
  slotIntervalMinutes: number;
  lunchBreakEnabled: boolean;
  lunchBreakStart: string;
  lunchBreakEnd: string;
};

const GIORNI_SETTIMANA = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const normalizeServiceName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[+]/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

export const normalizeRoleName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');

export const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
};

export const isOperatorAvailableOnDate = (
  operator: Pick<SharedOperator, 'availability'> | null | undefined,
  dateValue: string,
  settings?: AvailabilitySettings | null
) => {
  if (settings && getDateAvailabilityInfo(settings, dateValue).closed) {
    return false;
  }

  const availability = operator?.availability;
  if (!availability) return true;

  const weekday = parseIsoDate(dateValue).getDay();
  const enabledWeekdays = availability.enabledWeekdays?.length
    ? availability.enabledWeekdays
    : ALL_WEEKDAYS;

  if (!enabledWeekdays.includes(weekday)) {
    return false;
  }

  const ranges = availability.dateRanges ?? [];
  if (ranges.length === 0) {
    return true;
  }

  return ranges.some(
    (range) => range.startDate.trim() !== '' && range.startDate <= dateValue && range.endDate >= dateValue
  );
};

export const formatDateLong = (value: string) => {
  const date = parseIsoDate(value);
  return `${GIORNI_SETTIMANA[date.getDay()]} ${String(date.getDate()).padStart(2, '0')} ${
    MESI[date.getMonth()]
  } ${date.getFullYear()}`;
};

export const formatDateCompact = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

export const buildFutureDates = (daysAhead: number): FutureDateItem[] => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: daysAhead }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);

    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    const value = `${year}-${month}-${day}`;

    return {
      value,
      weekdayShort: GIORNI_SETTIMANA[current.getDay()],
      dayNumber: day,
      monthShort: MESI[current.getMonth()],
      fullLabel: formatDateLong(value),
    };
  });
};

export const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

export const minutesToTime = (minutesValue: number) => {
  const hours = Math.floor(minutesValue / 60);
  const minutes = minutesValue % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const DEFAULT_WEEKLY_SCHEDULE: WeeklyScheduleDay[] = [
  { weekday: 0, isClosed: true, startTime: '09:00', endTime: '19:30' },
  { weekday: 1, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 2, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 3, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 4, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 5, isClosed: false, startTime: '09:00', endTime: '19:30' },
  { weekday: 6, isClosed: false, startTime: '09:00', endTime: '19:30' },
];

export const normalizeAvailabilitySettings = (
  settings?: Partial<AvailabilitySettings> | null
): AvailabilitySettings => {
  const weeklySchedule = DEFAULT_WEEKLY_SCHEDULE.map((defaultDay) => {
    const savedDay = settings?.weeklySchedule?.find((item) => item.weekday === defaultDay.weekday);
    return {
      ...defaultDay,
      ...savedDay,
    };
  });

  const normalizedSlotInterval =
    typeof settings?.slotIntervalMinutes === 'number' &&
    settings.slotIntervalMinutes >= 15 &&
    settings.slotIntervalMinutes <= 300 &&
    settings.slotIntervalMinutes % 15 === 0
      ? settings.slotIntervalMinutes
      : 30;

  return {
    weeklySchedule,
    vacationRanges: (settings?.vacationRanges ?? []).map((item) => ({
      ...item,
      label: item.label ?? '',
    })),
    dateOverrides: settings?.dateOverrides ?? [],
    slotOverrides: settings?.slotOverrides ?? [],
    dateSlotIntervals: (settings?.dateSlotIntervals ?? []).filter(
      (item) =>
        typeof item?.date === 'string' &&
        typeof item?.slotIntervalMinutes === 'number' &&
        item.slotIntervalMinutes >= 15 &&
        item.slotIntervalMinutes <= 300 &&
        item.slotIntervalMinutes % 15 === 0
    ),
    slotIntervalMinutes: normalizedSlotInterval,
    lunchBreakEnabled: settings?.lunchBreakEnabled ?? false,
    lunchBreakStart: settings?.lunchBreakStart ?? '13:00',
    lunchBreakEnd: settings?.lunchBreakEnd ?? '14:00',
  };
};

export const getSlotIntervalForDate = (
  settings: AvailabilitySettings,
  dateValue?: string | null
) => {
  if (!dateValue) {
    return settings.slotIntervalMinutes || 30;
  }

  return (
    settings.dateSlotIntervals.find((item) => item.date === dateValue)?.slotIntervalMinutes ??
    settings.slotIntervalMinutes ??
    30
  );
};

export const buildTimeSlots = (startTime = '06:00', endTime = '22:00', interval = 30) => {
  const items: string[] = [];
  let current = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  while (current <= end) {
    items.push(minutesToTime(current));
    current += interval;
  }

  return items;
};

export const buildDisplayTimeSlots = (
  settings: AvailabilitySettings,
  dateValue?: string | null
) => {
  const openDays = settings.weeklySchedule.filter((item) => !item.isClosed);
  const interval = getSlotIntervalForDate(settings, dateValue);

  if (openDays.length === 0) {
    return buildTimeSlots('09:00', '19:00', interval);
  }

  const minStart = Math.min(...openDays.map((item) => timeToMinutes(item.startTime)));
  const maxEnd = Math.max(...openDays.map((item) => timeToMinutes(item.endTime) - interval));

  return buildTimeSlots(
    minutesToTime(minStart),
    minutesToTime(Math.max(maxEnd, minStart)),
    interval
  );
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
};

export const isItalianHoliday = (dateValue: string) => {
  const date = parseIsoDate(dateValue);
  const year = date.getFullYear();
  const mmdd = dateValue.slice(5);
  const fixedHolidays = new Set([
    '01-01',
    '01-06',
    '04-25',
    '05-01',
    '06-02',
    '08-15',
    '11-01',
    '12-08',
    '12-25',
    '12-26',
  ]);

  if (fixedHolidays.has(mmdd)) return true;

  const easter = getEasterSunday(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);
  const easterIso = easter.toISOString().split('T')[0];
  const easterMondayIso = easterMonday.toISOString().split('T')[0];

  return dateValue === easterIso || dateValue === easterMondayIso;
};

export const getWeeklyDaySchedule = (settings: AvailabilitySettings, dateValue: string) => {
  const weekday = parseIsoDate(dateValue).getDay();
  return (
    settings.weeklySchedule.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE.find((item) => item.weekday === weekday) ??
    DEFAULT_WEEKLY_SCHEDULE[0]
  );
};

export const getDateOverride = (settings: AvailabilitySettings, dateValue: string) =>
  settings.dateOverrides.find((item) => item.date === dateValue) ?? null;

export const isDateInVacationRanges = (settings: AvailabilitySettings, dateValue: string) =>
  settings.vacationRanges.some(
    (item) => item.startDate <= dateValue && dateValue <= item.endDate
  );

export const getDateAvailabilityInfo = (settings: AvailabilitySettings, dateValue: string) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const override = getDateOverride(settings, dateValue);

  if (override?.forceOpen) {
    return { closed: false, reason: null as string | null };
  }

  if (override?.closed) {
    return { closed: true, reason: 'manual' };
  }

  if (isDateInVacationRanges(settings, dateValue)) {
    return { closed: true, reason: 'vacation' };
  }

  if (isItalianHoliday(dateValue)) {
    return { closed: true, reason: 'holiday' };
  }

  if (daySchedule.isClosed) {
    return { closed: true, reason: 'weekly' };
  }

  return { closed: false, reason: null as string | null };
};

export const isTimeWithinDaySchedule = (
  settings: AvailabilitySettings,
  dateValue: string,
  timeValue: string
) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const time = timeToMinutes(timeValue);
  return time >= timeToMinutes(daySchedule.startTime) && time < timeToMinutes(daySchedule.endTime);
};

export const doesServiceFitWithinDaySchedule = ({
  settings,
  dateValue,
  startTime,
  durationMinutes,
}: {
  settings: AvailabilitySettings;
  dateValue: string;
  startTime: string;
  durationMinutes: number;
}) => {
  const daySchedule = getWeeklyDaySchedule(settings, dateValue);
  const start = timeToMinutes(startTime);
  const end = start + durationMinutes;

  return (
    start >= timeToMinutes(daySchedule.startTime) &&
    end <= timeToMinutes(daySchedule.endTime)
  );
};

export const isTimeBlockedByLunchBreak = (
  settings: AvailabilitySettings,
  timeValue: string
) => {
  if (!settings.lunchBreakEnabled) return false;
  const time = timeToMinutes(timeValue);
  return (
    time >= timeToMinutes(settings.lunchBreakStart) &&
    time < timeToMinutes(settings.lunchBreakEnd)
  );
};

export const doesServiceOverlapLunchBreak = ({
  settings,
  startTime,
  durationMinutes,
}: {
  settings: AvailabilitySettings;
  startTime: string;
  durationMinutes: number;
}) => {
  if (!settings.lunchBreakEnabled) return false;

  const serviceStart = timeToMinutes(startTime);
  const serviceEnd = serviceStart + durationMinutes;
  const lunchStart = timeToMinutes(settings.lunchBreakStart);
  const lunchEnd = timeToMinutes(settings.lunchBreakEnd);

  return serviceStart < lunchEnd && serviceEnd > lunchStart;
};

export const isSlotBlockedByOverride = (
  settings: AvailabilitySettings,
  dateValue: string,
  timeValue: string
) =>
  settings.slotOverrides.some(
    (item) => item.date === dateValue && item.time === timeValue && item.blocked
  );

export const getServiceDuration = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  return (
    services.find((item) => normalizeServiceName(item.nome) === normalized)?.durataMinuti ?? 60
  );
};

export const getServiceByName = (serviceName: string, services: SharedService[]) => {
  const normalized = normalizeServiceName(serviceName);
  return services.find((item) => normalizeServiceName(item.nome) === normalized) ?? null;
};

export const doesServiceUseOperators = (
  serviceName: string,
  services: SharedService[]
) => {
  const service = getServiceByName(serviceName, services);
  return normalizeRoleName(service?.mestiereRichiesto ?? '') !== '';
};

export const getEligibleOperatorsForService = ({
  serviceName,
  services,
  operators,
  appointmentDate,
  settings,
}: {
  serviceName: string;
  services: SharedService[];
  operators: SharedOperator[];
  appointmentDate?: string;
  settings?: AvailabilitySettings | null;
}) => {
  if (operators.length === 0) return [];

  const service = getServiceByName(serviceName, services);
  const requiredRole = normalizeRoleName(service?.mestiereRichiesto ?? '');

  if (!requiredRole) return [];

  return operators.filter((item) => {
    if (normalizeRoleName(item.mestiere) !== requiredRole) {
      return false;
    }

    if (appointmentDate) {
      return isOperatorAvailableOnDate(item, appointmentDate, settings);
    }

    return true;
  });
};

export const getAppointmentEndTime = (
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'>,
  services: SharedService[]
) => {
  const duration =
    typeof appointment.durataMinuti === 'number'
      ? appointment.durataMinuti
      : getServiceDuration(appointment.servizio, services);

  return minutesToTime(timeToMinutes(appointment.ora) + duration);
};

export const doesAppointmentOccupySlot = (
  appointment: Pick<SharedAppointment, 'ora' | 'servizio' | 'durataMinuti'>,
  slotTime: string,
  services: SharedService[]
) => {
  const start = timeToMinutes(appointment.ora);
  const end =
    start +
    (typeof appointment.durataMinuti === 'number'
      ? appointment.durataMinuti
      : getServiceDuration(appointment.servizio, services));
  const slot = timeToMinutes(slotTime);

  return slot >= start && slot < end;
};

export const findConflictingAppointment = ({
  appointmentDate,
  startTime,
  serviceName,
  appointments,
  services,
  operatorId,
  useOperators = false,
}: {
  appointmentDate: string;
  startTime: string;
  serviceName: string;
  appointments: SharedAppointment[];
  services: SharedService[];
  operatorId?: string | null;
  useOperators?: boolean;
}) => {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + getServiceDuration(serviceName, services);

  return (
    appointments.find((item) => {
      if ((item.data ?? getTodayDateString()) !== appointmentDate) return false;

      if (useOperators) {
        const existingOperatorId = item.operatoreId?.trim() ?? '';
        const selectedOperatorId = operatorId?.trim() ?? '';

        if (existingOperatorId && selectedOperatorId && existingOperatorId !== selectedOperatorId) {
          return false;
        }
      }

      const existingStart = timeToMinutes(item.ora);
      const existingEnd =
        existingStart +
        (typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(item.servizio, services));

      return newStart < existingEnd && newEnd > existingStart;
    }) ?? null
  );
};
