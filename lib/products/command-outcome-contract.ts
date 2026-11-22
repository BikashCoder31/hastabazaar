/** Opaque browser recovery references contain no command fields or private evidence. */
export const productOutcomeKinds=['publication_review','intake_review','availability','concern_report','concern_case','publication_owner','legacy_product','legacy_media','legacy_stock'] as const;
export type ProductOutcomeKind=typeof productOutcomeKinds[number];
export interface ProductCommandSource {kind:ProductOutcomeKind;sourceId:string;actorId:string;relatedId?:string}
export interface ProductCommandOutcome {requestId:string;status:'recorded'|'unconfirmed'}
