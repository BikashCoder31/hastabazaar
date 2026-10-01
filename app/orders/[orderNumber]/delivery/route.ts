// Keep guest delivery requests inside the receipt cookie's existing /orders scope.
export {GET} from '@/app/api/orders/[orderNumber]/delivery/route';
export const dynamic='force-dynamic';
