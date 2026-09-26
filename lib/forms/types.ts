export type FormId = string;
export type FormMode = 'collection' | 'transaction' | 'identity' | 'operation' | 'query' | 'system';
export type FormAudience = 'public' | 'customer' | 'seller' | 'rider' | 'staff' | 'super_admin';
export type BaseFieldCapability = 'protected' | 'display_editable' | 'configurable';
export type CustomFieldType = 'short_text' | 'long_text' | 'number' | 'date' | 'single_choice' | 'multiple_choice' | 'checkbox' | 'email' | 'phone';

export interface BaseFieldDefinition {
  readonly key: string;
  readonly type: string;
  readonly label: string;
  readonly capability: BaseFieldCapability;
  readonly explanation: string;
}

export interface FormCapabilities {
  readonly explanation: string;
  readonly customFieldTypes: readonly CustomFieldType[];
  readonly answerBehavior: 'record' | 'query' | 'none';
}

export interface FormDefinition {
  readonly id: FormId;
  readonly audience: FormAudience;
  readonly mode: FormMode;
  readonly route: string;
  readonly baseFields: readonly BaseFieldDefinition[];
  readonly capabilities: FormCapabilities;
  readonly adapterId: string;
}

export interface ConfiguredField {
  readonly id: string;
  readonly key: string;
  readonly type: CustomFieldType;
  readonly label: string;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly required: boolean;
  readonly order: number;
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  readonly status: 'active' | 'archived';
}

export interface FormConfigDraft {
  readonly formId: FormId;
  readonly fields: readonly ConfiguredField[];
}

export interface PublishedFormConfig extends FormConfigDraft {
  readonly version: number;
  readonly publishedAt: number;
}

export interface FormAnswerSnapshot {
  readonly formId: FormId;
  readonly version: number;
  readonly answers: readonly { readonly fieldId: string; readonly label: string; readonly type: CustomFieldType; readonly value: unknown }[];
}
