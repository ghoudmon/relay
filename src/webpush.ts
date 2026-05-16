import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { StateChange, SubscriptionRecord, WebSubscription } from './types.js';

interface VapidKeys {
  vapid_public_key: string;
  vapid_private_key: string;
}

let cachedVapidKeys: VapidKeys | null = null;

async function loadVapidKeys(): Promise<VapidKeys> {
  if (cachedVapidKeys) return cachedVapidKeys;

  const inline = process.env.VAPID_KEYS_JSON;
  if (inline && inline.trim().startsWith('{')) {
    cachedVapidKeys = JSON.parse(inline) as VapidKeys;
    return cachedVapidKeys;
  }

  const filePath =
    inline && inline.trim().length > 0
      ? inline
      : path.join(process.env.PUSH_DATA_DIR ?? './data', 'vapid-keys.json');
  const raw = await fs.readFile(filePath, 'utf8');
  cachedVapidKeys = JSON.parse(raw) as VapidKeys;
  return cachedVapidKeys;
}


export async function getVapidPublicKey(): Promise<string> {
  const account = await loadVapidKeys();
  return account.vapid_public_key;
}

// Web Push Protocol support
export interface WebPushSendResult {
  ok: boolean;
  status: number;
  unregistered: boolean;
  body?: unknown;
}

export async function sendWebPush(
  record: SubscriptionRecord,
  change: StateChange
): Promise<WebPushSendResult> {
  const keys = await loadVapidKeys();

  // Data-only push so onMessageReceived always fires — the app enriches it
  // (sender/subject/avatar) via JMAP fetch before posting a notification.
  const message: any = {
    data: {
      kind: 'jmap-state-change',
      accountLabel: record.accountLabel ?? '',
      changed: JSON.stringify(change.changed ?? {}),
    },
  };

  const { endpoint, headers, body } = await buildPushHTTPRequest({
    privateJWK:keys.vapid_private_key,
    subscription: record.subscription as WebSubscription,
    message: message
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body
  });

  if (response.status === 201) {
    console.log("Notification sent");
  }
  
  const rawBody = await response.text();
  let parsed: unknown = rawBody;
  try {
    parsed = rawBody.length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    // keep raw text
  }
  
  const unregistered = response.status === 410 || response.status === 404;
  
  return {
    ok: response.ok,
    status: response.status,
    unregistered,
    body: parsed,
  };
}
