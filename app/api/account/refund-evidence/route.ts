import {financeEvidenceUpload,financeEvidenceRead} from '@/lib/payments/refund-evidence-http';
export async function POST(request:Request){return financeEvidenceUpload(request,'customer');}
export async function GET(request:Request){return financeEvidenceRead(request,'customer');}
