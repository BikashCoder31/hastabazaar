'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function PrintDocumentButton() {
  return (
    <Button className="print:hidden" type="button" onClick={() => window.print()}>
      <Printer /> Print or save as PDF
    </Button>
  );
}
