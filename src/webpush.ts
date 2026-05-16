import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPushHTTPRequest } from "@pushforge/builder";
import type { StateChange, SubscriptionRecord, WebSubscription } from './types.js';
import { JsonWebKey } from 'node:crypto';

interface VapidKeys {
  vapid_public_key: string;
  vapid_private_key: JsonWebKey | string;
  admin_contact: string;
}

let cachedVapidKeys: VapidKeys | null = null;

async function loadVapidKeys(): Promise<VapidKeys> {
  if (cachedVapidKeys) return cachedVapidKeys;

  // Default to loading from PUSH_DATA_DIR/vapid.json
  const filePath = path.join(process.env.PUSH_DATA_DIR ?? './data', 'vapid-keys.json');
    if (await fs.access(filePath).then(() => true).catch(() => false)) {
    const raw = await fs.readFile(filePath, 'utf8');
    cachedVapidKeys = JSON.parse(raw) as VapidKeys;
  } else {
    cachedVapidKeys = {} as VapidKeys;
  }
  // Load from env vars if present, overriding file values
  if (process.env.VAPID_PUBLIC_KEY) {
    cachedVapidKeys.vapid_public_key = process.env.VAPID_PUBLIC_KEY;
  }
  if (process.env.VAPID_PRIVATE_KEY) {
    cachedVapidKeys.vapid_private_key = JSON.parse(process.env.VAPID_PRIVATE_KEY) as JsonWebKey;
  }
  if (process.env.VAPID_ADMIN_CONTACT) {
    cachedVapidKeys.admin_contact = process.env.VAPID_ADMIN_CONTACT;
  }
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
    payload: {
      data: {
        kind: 'jmap-state-change',
        accountLabel: record.accountLabel ?? '',
        changed: JSON.stringify(change.changed ?? {}),
      }
    },
    adminContact: keys.admin_contact,
    options: {
      ttl: 86400, // 24 hours in seconds
      urgency: "high",
      topic: "new-messages"
    }
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
