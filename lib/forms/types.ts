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
  // A built-in can be presented through the catalog only when its adapter
  // declares the existing semantics to preserve.
  readonly required?: boolean;
  readonly status?: 'active' | 'archived';
  readonly choices?: readonly { readonly value: string; readonly label: string }[];
  readonly min?: number;
  readonly max?: number;
  readonly integerOnly?: boolean;
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
  readonly min?: number;
  readonly max?: number;
  readonly integerOnly?: boolean;
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
  /** Original displayed definition when a compatible submission uses a newer one. */
  readonly presentedVersion?: number;
  /** Server-owned domain data; only product submission snapshots may contain it. */
  readonly productIdentity?: { readonly sellerSku: string | null; readonly revision?: number };
  readonly formId: FormId;
  readonly version: number;
  readonly answers: readonly { readonly fieldId: string; readonly label: string; readonly type: CustomFieldType; readonly value: unknown }[];
}
