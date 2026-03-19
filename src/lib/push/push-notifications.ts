import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../supabase';

const PUSH_TOKEN_STORAGE_KEY = 'salon_manager_expo_push_token';

type RegisterPushParams = {
  workspaceId: string;
  ownerEmail: string;
};

type RegisterPushResult = {
  token: string | null;
  backendSynced: boolean;
  reason?: string;
};

type QueuePushParams = {
  workspaceId: string;
  eventType: 'booking_request_created' | 'booking_request_status_changed' | 'appointment_cancelled' | 'custom';
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

const getProjectId = () => {
  const projectIdFromEasConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  if (projectIdFromEasConfig) return projectIdFromEasConfig;

  const expoConfig = Constants.expoConfig as
    | {
        extra?: {
          eas?: {
            projectId?: string;
          };
        };
      }
    | undefined;

  return expoConfig?.extra?.eas?.projectId;
};

export const configurePushNotifications = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

const getExpoPushToken = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#d4af37',
    });
  }

  const projectId = getProjectId();
  if (!projectId) {
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
};

const upsertPushTokenBackend = async ({
  workspaceId,
  ownerEmail,
  token,
}: {
  workspaceId: string;
  ownerEmail: string;
  token: string;
}) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  const { data: authSession } = await supabase.auth.getSession();
  if (!authSession.session) {
    return false;
  }

  const { error } = await supabase.rpc('upsert_push_device', {
    p_workspace_id: workspaceId,
    p_owner_email: ownerEmail,
    p_expo_push_token: token,
    p_platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'manual',
    p_device_model: Device.modelName ?? null,
    p_app_version: Constants.expoConfig?.version ?? null,
  });

  return !error;
};

export const registerPushNotifications = async ({
  workspaceId,
  ownerEmail,
}: RegisterPushParams): Promise<RegisterPushResult> => {
  try {
    const token = await getExpoPushToken();
    if (!token) {
      return { token: null, backendSynced: false, reason: 'permission_or_project_id_missing' };
    }

    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
    const backendSynced = await upsertPushTokenBackend({ workspaceId, ownerEmail, token });

    return { token, backendSynced };
  } catch (error) {
    return {
      token: null,
      backendSynced: false,
      reason: error instanceof Error ? error.message : 'register_failed',
    };
  }
};

export const getStoredPushToken = async () => AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

export const queueWorkspacePushNotification = async ({
  workspaceId,
  eventType,
  title,
  body,
  payload = {},
}: QueuePushParams) => {
  if (!isUuid(workspaceId)) {
    return false;
  }

  const { data: authSession } = await supabase.auth.getSession();
  if (!authSession.session) {
    return false;
  }

  const { error } = await supabase.rpc('queue_workspace_push', {
    p_workspace_id: workspaceId,
    p_event_type: eventType,
    p_title: title,
    p_body: body,
    p_payload: payload,
  });

  return !error;
};
