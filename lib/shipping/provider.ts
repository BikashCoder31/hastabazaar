import type { MoneyPaisa } from '../marketplace/types';

export type ShippingPaymentMode = 'cod' | 'prepaid';
export type ShipmentStatus =
  | 'pending'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'return_to_origin'
  | 'returned'
  | 'cancelled';

export interface NepalAddress {
  location?: import('../delivery/validation').DeliveryLocation;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  municipality: string;
  ward?: string;
  locality: string;
  landmark?: string;
  postalCode?: string;
}

export interface Parcel {
  weightGrams: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface ShippingQuoteRequest {
  origin: NepalAddress;
  destination: NepalAddress;
  parcel: Parcel;
  paymentMode: ShippingPaymentMode;
  codAmountPaisa?: MoneyPaisa;
}

export interface ShippingQuote {
  provider: string;
  serviceCode: string;
  chargePaisa: MoneyPaisa;
  estimatedDeliveryDays: readonly [number, number];
  expiresAt: string;
}

export interface CreateShipmentRequest extends ShippingQuoteRequest {
  orderReference: string;
  quote: ShippingQuote;
}

export interface Shipment {
  provider: string;
  providerShipmentId: string;
  trackingCode: string;
  status: ShipmentStatus;
  labelUrl?: string;
}

export interface ShipmentEvent {
  status: ShipmentStatus;
  occurredAt: string;
  location?: string;
  note?: string;
}

export interface ShippingProvider {
  readonly key: string;
  checkServiceability(address: NepalAddress): Promise<boolean>;
  getQuote(request: ShippingQuoteRequest): Promise<ShippingQuote>;
  createShipment(request: CreateShipmentRequest): Promise<Shipment>;
  schedulePickup(providerShipmentId: string): Promise<void>;
  cancelShipment(providerShipmentId: string): Promise<void>;
  getTracking(providerShipmentId: string): Promise<readonly ShipmentEvent[]>;
}
