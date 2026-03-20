import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ClaimedPushRow = {
  notification_id: string;
  expo_push_token: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
};

type ExpoPushResult = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
};

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const getEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value?.trim()) {
      return value;
    }
  }

  return null;
};

Deno.serve(async (request) => {
  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      });
    }

    const supabaseUrl = getEnvValue('SUPABASE_URL', 'URL');
    const serviceRoleKey = getEnvValue('SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({
          error: 'missing_supabase_env',
          required: ['SUPABASE_URL or URL', 'SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY'],
        }),
        {
        status: 500,
        headers: { 'content-type': 'application/json' },
        }
      );
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit ?? 50), 1), 200);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const claimResult = await supabase.rpc('claim_push_notifications', { p_limit: limit });

    if (claimResult.error) {
      return new Response(
        JSON.stringify({
          error: 'claim_failed',
          details: claimResult.error.message,
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }
      );
    }

    const claimedRows = (claimResult.data ?? []) as ClaimedPushRow[];
    if (claimedRows.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, failed: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    const expoPayload = claimedRows.map((row) => ({
      to: row.expo_push_token,
      sound: 'default',
      title: row.title,
      body: row.body,
      data: row.payload ?? {},
      priority: 'high',
    }));

    const expoResponse = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(expoPayload),
    });

    const expoJson = (await expoResponse.json().catch(() => ({ data: [] }))) as {
      data?: ExpoPushResult[];
      errors?: Array<{ message?: string }>;
    };

    const results = expoJson.data ?? [];
    let sent = 0;
    let failed = 0;

    for (let index = 0; index < claimedRows.length; index += 1) {
      const row = claimedRows[index];
      const result = results[index];

      const isOk = result?.status === 'ok';
      const status = isOk ? 'sent' : 'failed';
      const errorMessage =
        !isOk
          ? result?.message ??
            (typeof result?.details === 'object' ? JSON.stringify(result.details) : null) ??
            expoJson.errors?.[0]?.message ??
            'unknown_expo_error'
          : null;

      const markResult = await supabase.rpc('mark_push_notification_result', {
        p_notification_id: row.notification_id,
        p_status: status,
        p_error: errorMessage,
      });

      if (markResult.error) {
        failed += 1;
        continue;
      }

      if (isOk) {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    return new Response(
      JSON.stringify({
        processed: claimedRows.length,
        sent,
        failed,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'unexpected_error',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
});
