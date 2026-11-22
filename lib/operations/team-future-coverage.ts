import {can,type Permission} from '../marketplace/permissions';
type RecordRow=Record<string,unknown>;
/** Projection of recorded intervals only; never a promise of future bank or staffing capacity. */
export function upcomingTeamCoverage(now:number,availability:RecordRow[],handoffs:RecordRow[],duties:{id:string;label:string;primaryId:string|null;permission:Permission;reserved:boolean}[],people:{id:string;staffRole:string;accountStatus:string;permissions:readonly Permission[]}[]){
 const result=[];
 for(const row of availability){if(row.available!==0)continue;const start=Math.max(now,Number(row.startsAt)),end=Number(row.endsAt);if(end<=start)continue;
  const records=availability.filter(value=>value.userId===row.userId),points=[...new Set([start,end,...records.flatMap(value=>[Number(value.startsAt),Number(value.endsAt)]).filter(value=>value>start&&value<end)])].sort((a,b)=>a-b),segments:{startsAt:number;endsAt:number}[]=[];
  for(let index=0;index<points.length-1;index++){const at=points[index],latest=records.filter(value=>Number(value.startsAt)<=at&&Number(value.endsAt)>at).sort((a,b)=>Number(b.revision)-Number(a.revision))[0];if(latest?.id===row.id)segments.push({startsAt:at,endsAt:points[index+1]});}
  if(!segments.length)continue;
  const affected=duties.filter(duty=>duty.primaryId===row.userId||handoffs.some(h=>h.dutyId===duty.id&&h.toUserId===row.userId&&h.state==='accepted'&&segments.some(segment=>Number(h.startsAt)<segment.endsAt&&Number(h.endsAt)>segment.startsAt)));
  result.push({absenceId:row.id,userId:row.userId,startsAt:segments[0].startsAt,endsAt:segments.at(-1)!.endsAt,segments,duties:affected.map(duty=>({id:duty.id,label:duty.label,acceptedCover:segments.every(segment=>handoffs.some(h=>{if(h.dutyId!==duty.id||h.toUserId===row.userId||h.state!=='accepted'||Number(h.startsAt)>segment.startsAt||Number(h.endsAt)<segment.endsAt)return false;const person=people.find(value=>value.id===h.toUserId);if(!person||person.accountStatus!=='active'||person.staffRole!=='super_admin'&&(duty.reserved||person.staffRole!=='admin'||!can({role:'admin',permissions:person.permissions},duty.permission)))return false;const target=availability.filter(value=>value.userId===h.toUserId),boundaries=[segment.startsAt,...target.flatMap(value=>[Number(value.startsAt),Number(value.endsAt)]).filter(value=>value>segment.startsAt&&value<segment.endsAt)];return boundaries.every(at=>target.filter(value=>Number(value.startsAt)<=at&&Number(value.endsAt)>at).sort((a,b)=>Number(b.revision)-Number(a.revision))[0]?.available!==0);} ))}))});
 }
 return result;
}
