import type { FormDefinition } from '../forms/types';

export const SUPPORT_ASSISTANT_FORM: FormDefinition = Object.freeze({
  id: 'system.support-assistant',
  adapterId: 'system.support-assistant',
  audience: 'public',
  route: '/contact-us',
  mode: 'system',
  baseFields: [
    {
      key: 'question',
      label: 'Help question',
      type: 'existing',
      capability: 'protected',
      explanation:
        'Local FAQ matching only; the question is not sent or saved.',
    },
  ],
  capabilities: {
    customFieldTypes: [],
    answerBehavior: 'none',
    explanation:
      'The browser matches published help topics locally. No server submission, custom questions or generic answer records.',
  },
} satisfies FormDefinition);
