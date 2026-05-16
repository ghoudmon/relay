export interface SubscriptionRecord {
  fcmToken?: string | null;
  verificationCode: string | null;
  createdAt: number;
  lastPushAt: number | null;
  accountLabel?: string;
  subscription?: WebSubscription;
}

export interface WebSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushVerification {
  '@type': 'PushVerification';
  pushSubscriptionId: string;
  verificationCode: string;
}

export interface StateChange {
  '@type': 'StateChange';
  changed: Record<string, Record<string, string>>;
}

export type JmapPushBody = PushVerification | StateChange;
