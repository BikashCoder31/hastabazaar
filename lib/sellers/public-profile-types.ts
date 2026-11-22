import type {CraftExperience,MakerSocialLinks} from './participation';
export const publicProfileCooldownMs=168*60*60_000;
export interface PublicProfileValues{
 publicName:string;publicCity:string;about:string;specialties:string;
 craftExperience:readonly CraftExperience[];socialLinks:MakerSocialLinks;
 media:readonly {mediaId:string;caption:string}[];
}
export class PublicProfileError extends Error{constructor(message:string,readonly status=409){super(message);}}
export class PublicProfileAuthorityError extends PublicProfileError{constructor(message:string){super(message,403);}}
export type ProfileCommand={sellerId:string;actorId:string;requestId:string;now:number};
