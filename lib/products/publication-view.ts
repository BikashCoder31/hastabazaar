import type {ProductPublication} from './publication-contract';
import type {IntakeSnapshot} from './intake-workspace';
/** Public facts only: never reconstruct private stock intent or review evidence. */
export function publicPublicationSnapshot(value:ProductPublication):IntakeSnapshot{
 return {categoryId:value.categoryId,answers:{...value.details,occasionIds:value.occasionIds},offers:{axes:value.axes,offers:value.offers.map(({pricePaisa:_,compareAtPricePaisa:__,...row})=>({...row,stockIntent:''}))},mediaIds:value.mediaIds,privateReview:{},formContext:null};
}
