import { handleDocumentUpload } from '@/lib/sellers/document-upload';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  return handleDocumentUpload(request,context,'reviewed');
}
