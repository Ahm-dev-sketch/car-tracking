export interface LocationUpdateData {
  vehicleId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  recordedAt: string;
  receivedAt: string;
  movement: string;
  driverName?: string | null;
  driverPhone?: string | null;
  plateNumber?: string | null;
  tripOrigin?: string | null;
  tripDestination?: string | null;
}

export interface BookingUpdateData {
  bookingId: string;
  status: string;
  userId?: string | null;
}

export interface NotificationEventData {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
}

export interface OfferEventData {
  offerId: string;
  bookingId: string;
  etaSeconds: number | null;
  etaEstimated: boolean;
  pickupLocation: string;
  destination: string;
  expiresAt: string;
}

export type ServerRealtimeEvent =
  | { type: 'location:update'; data: LocationUpdateData }
  | { type: 'booking:update'; data: BookingUpdateData }
  | { type: 'notification'; data: NotificationEventData }
  | { type: 'offer'; data: OfferEventData };

export type ClientAuthMessage = {
  type: 'auth';
  token: string;
};

export type ClientSubscribeMessage = {
  type: 'subscribe';
  vehicles?: string[];
  all?: boolean;
};

export type ClientRealtimeMessage = ClientAuthMessage | ClientSubscribeMessage;

export type ServerErrorMessage = {
  type: 'error';
  code: string;
  message?: string;
};

export type ServerAuthSuccessMessage = {
  type: 'auth:success';
  userId: string;
  role: string;
};

export type ServerSubscribedMessage = {
  type: 'subscribed';
  vehicles: string[];
  all: boolean;
};

export type ServerRealtimeMessage =
  | ServerRealtimeEvent
  | ServerErrorMessage
  | ServerAuthSuccessMessage
  | ServerSubscribedMessage;
