import {handleSecurityAction} from '@/lib/security/controller';
export function POST(request:Request){return handleSecurityAction(request,'bootstrap');}
