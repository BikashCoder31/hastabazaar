import type { DeliveryMailService, MailDeliveryReceipt } from '../../lib/email/delivery-attempts';

/** Isolated test-only provider. Successful fake calls explicitly attest acceptance;
 * this helper never imports a real provider or silently classifies thrown errors. */
export function fakeProviderMail(fake: DeliveryMailService): DeliveryMailService {
  return {
    ...fake,
    handoffAware:true,
    transport:'provider',
    async send(message,context):Promise<MailDeliveryReceipt> {
      await context?.beforeHandoff();
      const result=await fake.send(message,context);
      return result??{outcome:'accepted',transport:'provider',receipt:`fake:${context?.attemptId??'immediate'}`};
    },
  };
}
