import type {ConfiguredField,FormConfigDraft} from './types';
import {FormValidationError} from './validation';

export class FormEditorPolicyError extends FormValidationError{
  constructor(message:string,fieldId:string){super('invalid_draft',message,fieldId);this.name='FormEditorPolicyError';}
}

export function questionRetirementReason(formId:string,field:Pick<ConfiguredField,'key'>):string|null{
  return formId==='seller.application'&&field.key.replaceAll(/[^a-z0-9]/gi,'').toLowerCase()==='contacttime'
    ?'This contact-time question is retired. Keep it archived; earlier questions and answers remain in history.'
    :null;
}

/** New changes follow current policy; historical reads and exact saved retries retain their original facts. */
export function assertQuestionPublicationPolicy(config:FormConfigDraft):void{
  for(const field of config.fields){const reason=questionRetirementReason(config.formId,field);if(field.status==='active'&&reason)throw new FormEditorPolicyError(reason,field.id);}
}
