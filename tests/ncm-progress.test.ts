import assert from 'node:assert/strict';
import test from 'node:test';
import { ncmConfirmedStage } from '../lib/delivery/ncm-progress';

void test('bulk-confirmed NCM statuses map to the documented parcel progress and staff work', () => {
  const mapped = {
    pickup_completed:'picked_up', dropoff_collected:'picked_up', order_dispatched:'in_transit', order_arrived:'in_transit',
    sent_for_delivery:'out_for_delivery', delivery_completed:'delivered', returned_to_warehouse:'delivery_failed',
    order_marked_rtv:'returning', send_to_vendor:'returning', rtv_delivery:'returned',
    refund_initiated:'refund_initiated', exchange_initiated:'exchange_initiated',
    'Pickup Complete':'picked_up', 'Dispatched to Kathmandu':'in_transit', 'Arrived at Tinkune':'in_transit',
    'Sent for Delivery':'out_for_delivery', Delivered:'delivered', 'Returned to Warehouse':'delivery_failed',
    'Order Marked Return':'returning', 'Sent to Vendor':'returning', 'RTV Delivered':'returned',
    'Refund Initiated':'refund_initiated','Exchange Initiated':'exchange_initiated',
  };
  for (const [status,expected] of Object.entries(mapped)) assert.equal(ncmConfirmedStage(status),expected,status);
  assert.equal(ncmConfirmedStage('delivered by some other company'),null);
  assert.equal(ncmConfirmedStage('Pickup Order Created'),null);
});
