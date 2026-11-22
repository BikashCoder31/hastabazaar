import assert from 'node:assert/strict';
import {publishedLiveMakerFixture} from './live-maker-offer-fixture';
import {addReviewedLiveClearance} from './live-clearance-fixture';
import {getManagedLiveActivationReview,activateManagedMakerLive,readManagedLiveEligibility} from '../../lib/managed-commerce/live-activation';
/** Fictional in-memory sources, actual intake/approval/clearance/activation APIs. */
export async function activatedLiveMakerFixture(tag='fictional-live-maker'){
 const f=await publishedLiveMakerFixture();try{
  const clearance=await addReviewedLiveClearance(f,tag),activationReview=await getManagedLiveActivationReview(f.db,'reviewer',f.sellerId);
  assert.equal(activationReview.readyForActivation,true,JSON.stringify(activationReview.blockers));
  const activation=await activateManagedMakerLive(f.db,f.ctx(tag+'-activate',String(activationReview.participationVersion)),{sellerId:f.sellerId,readinessDigest:activationReview.readinessDigest,clearanceId:clearance.clearanceId,reason:'Enable this independently cleared fictional live sale-linked scope using the actual protected decision.'});
  const liveEligibility=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(liveEligibility.enabled,true);assert.ok(liveEligibility.proof);
  return {...f,clearance,activationReview,activation,liveEligibility,liveProof:liveEligibility.proof};
 }catch(error){f.dispose();throw error;}
}
