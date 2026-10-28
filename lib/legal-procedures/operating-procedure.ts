import { LEGAL_SECTIONS, type LegalSection } from './model';

// This is a completed reusable procedure. Adoption is a separate, attributed action.
// Current commercial amounts are read from their saved agreements, never copied here.
const bodies: Record<(typeof LEGAL_SECTIONS)[number][0], string> = {
  launch: `Use this procedure for daily marketplace operations, customer cases, evidence, incidents and legal requests. The active version is the one shown in Staff procedure with its approval, effective time and version history. A working version is not an instruction to staff until it has been approved and activated.

Use the recorded company details and PAN shown with this version. Before any new service, claim, registration disclosure or regulated product is offered, Super Admin must check the required business permission, evidence and operational capability. Publish contact and listing details only when they have been confirmed from the business and the relevant issuing record.

Existing customer policies and each order's recorded agreement remain authoritative. This internal procedure cannot impose a fee, reduce a refund right, activate a reserve or replace an accepted agreement. Use current saved terms for a new transaction and its own recorded terms for an existing transaction. A fixed-price Managed Maker supply retains its agreed supplier amount; do not add a percentage deduction.`,
  responsibility: `Super Admin is accountable for this procedure and for any task that has not yet been assigned to an existing authorized operator. Assign work through the existing case or operational workflow. A task assignment does not grant a new permission. The person making a decision must have current access to that action.

Customer care owns complaint acknowledgement, case references, evidence requests and customer updates. Finance owns payment reconciliation, refund execution, settlement explanations and payout evidence. Marketplace operations owns listing review, seller follow-up and product safety. The authorized technology/privacy operator owns access review, security containment and data-rights handling. Super Admin handles unresolved assignments, high-value approvals, legal notices and escalation between functions.

The assigned operator checks open work each working day and records the next action. Super Admin checks unassigned, approaching-deadline and overdue work each working day and assigns cover for absence. Do not wait for a regular review when a legal deadline, safety issue, suspected data exposure or overdue refund needs immediate action.

Use the published support route and existing case communications. Verify business-controlled phone numbers and the grievance contact before publishing them. Do not invent an appointment, use a private phone without authorization or claim a legal adviser has reviewed a matter unless that review occurred.`,
  evidence: `Open or locate the existing case, order or incident record before taking action. Record the original receipt time, reference, affected parties, order/item identifiers, issue, material dates, current owner, evidence location and next action. Preserve the original message and uploads. Link related records instead of creating conflicting copies.

Keep the exact accepted document or immutable document reference, version, fingerprint, actual language, commercial terms, actor and time. Use each order's recorded prices, commission and policy context. A later page or setting change must not replace that evidence. Describe a missing or unreliable historical field honestly; do not reconstruct consent, overwrite original terms or backdate a correction.

Request only evidence needed for the case. Use protected, authorized storage and access. Do not place identity documents, payment details, account tokens or private customer evidence in public pages, chat groups or unrestricted exports. Record who reviewed the evidence, the decision and its reason. Corrections must retain the original and a traceable explanation.`,
  complaints: `Register a complaint when received, give immediate acknowledgement and a reference, and retain the original receipt time. Use Returns and complaints in the admin workspace. Assign an existing authorized operator; until assigned, Super Admin remains responsible. Record the issue, requested remedy, evidence, original receipt time, owner and next review.

Follow the current public complaint commitment: provide a written decision with reasons within 15 calendar days of receipt. Record the due date in Nepal time using the original receipt. A request for more evidence, a staff transfer or reopening an investigation does not restart the original clock. Check any earlier legal or refund deadline and act by that earlier obligation.

Investigate both customer and seller evidence fairly. An unboxing video is not compulsory. Missing packaging alone does not remove a remedy for a defect, wrong supply or misdescription. Explain the outcome, evidence relied on, remedy and review route in the recorded customer communication. Escalate a likely missed deadline to Super Admin immediately, retain the reason and record the corrective action.

Use the existing assignment, investigation, escalation and resolution actions. Marking a complaint resolved does not prove a refund was paid. Keep refund execution and any continued follow-up separate. Customers retain access to competent consumer authorities and courts.`,
  refunds: `Read the order's recorded terms and the current applicable customer protections before deciding a cancellation, return or refund. A custom-made or non-returnable label does not remove remedies for defective, wrongly supplied or misdescribed goods. Do not deduct marketplace commission or an unsupported charge from a valid customer refund. Do not force wallet credit instead of money.

Preserve the existing public refund commitment: process without undue delay and no later than 7 calendar days after an accepted cancellation or receipt of an eligible return. When no return is required, count from confirmation of refund entitlement. An earlier applicable legal deadline prevails. Record the triggering event and due date separately from the complaint deadline. An internal approval, seller dispute or payment-provider delay does not extend the commitment; escalate and record the response.

Use the existing permitted refund workflow, required authorization and payment reconciliation. Confirm recipient, amount, currency, payment method and prior refunds to prevent duplicates. Record approval separately from actual payment and keep the provider or bank reference. A request or prepared payment is not a completed refund.

For seller or maker settlements, use the transaction's recorded commercial model, accepted commission or fixed supply amount, holds, reserve evidence and ledger entries. Explain gross sales, commission, adjustments, held amounts, eligible funds and recorded payment separately. Do not apply today's settings to an old transaction or activate an unsupported reserve, minimum or payout schedule. Release undisputed funds under the applicable terms; suspension does not forfeit earnings or cancel refunds.`,
  penalties: `This procedure creates no automatic fine, delay charge, commission change, forfeiture or deduction. A dashboard instruction or internal note cannot introduce a new commercial obligation. Use the accepted agreement and existing authorized adjustments only.

Before proposing an assessment, identify the accepted obligation, relevant order, deadline, permitted value base, actual delay, responsibility and excluded causes such as a carrier failure. Preserve the evidence and give the affected person a reasonable opportunity to respond. Obtain the required legal/commercial review and current financial authorization before any permitted action.

Record the reasoned decision, calculation, reviewer, notification and available review route. Do not treat silence as admission, compound an assessment without an agreed basis or recover the same loss twice. Retain reduced, reversed and disputed assessments with their original history. If no accepted or lawful basis can be established, do not impose the charge.`,
  incidents: `Protect people first. For a credible safety, fraud, service or security incident, notify Super Admin immediately and assign an authorized incident owner. Record when the issue was discovered, affected services and records, known facts, uncertainty, immediate risk and actions already taken.

Contain only what is necessary through existing permitted controls. Preserve logs, messages, original files, order history and relevant configurations before changing a system where practical. Do not erase evidence, reset the database, import a backup, publish an accusation or admit liability as an improvised response.

Maintain a time-stamped action log with actor, reason, evidence and outcome. Identify customer, seller, financial, privacy and legal obligations. Super Admin coordinates urgent specialist review and approved communications. Record recovery checks, remaining risk, the owner of follow-up work and the basis for closure. A closed incident does not remove an outstanding refund, complaint, legal hold or payment obligation.`,
  'legal-notices': `Send a legal notice, regulator request, court document or formal complaint received by any channel to Super Admin immediately. Preserve the complete original, attachments, delivery evidence, receipt time and stated deadline. Do not ignore it because it arrived outside the usual support channel.

Verify the sender, authority, scope and deadline through a trusted route. Seek qualified Nepal legal advice for the matter where needed. Record the actual adviser or reviewer and advice reference; do not claim an appointment or approval that has not occurred. Preserve relevant records while scope and obligations are assessed.

Only an authorized representative may issue the response or disclose records. Review relevance, privilege, confidentiality, third-party data and the permitted disclosure route. Keep a record of what was sent, to whom, under which authority, when and with whose approval. A preservation request is not authority to make unrelated disclosures. Escalate uncertainty or a short deadline immediately.`,
  retention: `Retain records for documented service, financial, consumer, security and legal purposes under the applicable retention obligations. Restrict access to existing authorized roles that need the information. Use the current data-rights and legal-hold workflows; do not perform bulk deletion or anonymization from this procedure.

For each retention decision, identify the record category, purpose, applicable verified obligation, retention trigger and period, accountable owner, access restriction and any open claim or hold. Use qualified legal/accounting review to establish statutory periods rather than guessing one period for all records. Preserve the decision and its evidence. Until a disposal basis and required authority are established, do not discard potentially required evidence.

For a legal hold, record the matter, scope, authority, owner, review point and release approval in the existing restricted workflow. Keep affected evidence intact while the hold applies. Releasing a hold permits a fresh retention review; it is not an automatic deletion instruction. Review holds so they are not left without an accountable owner.

Verify identity and scope for access, correction or deletion requests. Protect third-party information, explain any lawful limitation and record the outcome. Account closure must not silently erase accepted agreements, financial evidence, unresolved case records or information subject to a preservation hold.`,
  recalls: `Treat a credible dangerous, counterfeit, prohibited or materially misdescribed product report as urgent. Notify Super Admin and the authorized marketplace/safety operator. Record the product, seller, affected order or batch identifiers, evidence and immediate risk. Preserve listing and order snapshots.

Use existing authorized controls to stop further exposure where justified. Do not remove the evidence when restricting a listing. Identify affected customers and stock and arrange the necessary qualified review, supplier follow-up and authority contact through approved channels.

Record a clear customer instruction, remedy and safe return or disposal arrangement where needed. Do not charge a customer for the return of a damaged, defective, wrong or misdescribed item under the current policy. Track notifications, refunds, supplier action and any remaining affected items. Super Admin records the basis for closure and any conditions before a product can return to sale.`,
  'data-incidents': `Report suspected unauthorized access, loss, misdelivery or exposure of personal data to Super Admin and the authorized technology/privacy operator immediately. Record discovery time, source, affected systems, likely data categories, people affected, evidence and current uncertainty. Keep the record restricted.

Contain access through authorized controls and preserve relevant logs and original evidence. Do not copy personal data into general chat, contact affected people without an approved message, erase logs or make unsupported claims that the event is harmless or fully resolved.

Assess impact, ongoing exposure, contractual and legal notification duties, recipients and applicable deadlines with appropriate qualified review. Do not invent a universal notification period. Record the basis for every notify/do-not-notify decision, approver, communications and containment actions. Verify recovery and access restrictions, assign follow-up improvements and preserve any legal hold before closure.`,
  providers: `Before using a supplier, carrier, payment provider or other processor, verify the responsible business, permitted service, contract, relevant registration or permission, contact route, data access and incident/claim process. Super Admin must confirm that the service and any credentials are approved for the relevant environment.

Use only the agreed service and current authorized workflow. A delivery estimate is not proof that an address is serviceable. A payment request or payout preparation is not evidence of a completed transfer. Keep actual shipment, bank/provider, refund, invoice and settlement references with the related records.

Review loss, delay, insurance and recovery evidence under the actual contract. Do not advertise coverage, guaranteed delivery, a payout schedule or a liability waiver that has not been verified. A provider dispute does not remove customer remedies or extend an earlier refund deadline. Record contract changes prospectively and preserve the agreement and evidence applicable to older transactions.`,
  changes: `Super Admin edits and saves a working version with a reason. Every save retains a separate attributed snapshot and the earlier history. Review the complete text, company disclosure, public policy commitments, financial boundaries, existing workflows and staff responsibilities before approving that exact saved version.

Approval records the version, fingerprint, approving account, time and reason. Activation is a separate action. Choose Activate now or a future date and time in Nepal time; do not backdate. Staff must use the active version shown by the system. A scheduled version takes effect only at its recorded time. Saving later edits does not change the approved, scheduled or active snapshot.

If an active instruction must stop, Super Admin withdraws it with a reason. Withdrawal stops the active version and cancels pending activations; earlier versions remain in history. Review and explicitly approve/activate a suitable new version before replacing it. A retry must retain the same request and content so an uncertain response does not create duplicate approval actions.

This process adopts an internal operating procedure only. It does not publish website agreements, certify legal compliance, alter permissions, change commission or rewards settings, issue notices, transfer money, change accepted orders or create a reserve. A material public or commercial policy change needs its own authorized review, version, notice/acceptance process and supported implementation. Keep all earlier accepted terms and policy archives.`,
  'incident-record': `For each case or incident, use the appropriate existing restricted record and retain:

1. Original receipt/discovery time, reference, channel and reporting person.
2. Account, order, item, product/batch and related case identifiers where relevant.
3. Issue, known facts, uncertainty, immediate risk and requested remedy.
4. Applicable agreement/policy versions and original commercial terms.
5. Evidence locations, access restrictions and any preservation hold.
6. Assigned authorized owner, approvals needed and cover/escalation contact.
7. Separate complaint, refund, legal and other applicable deadlines in Nepal time.
8. Time-stamped actions, actors, reasons, evidence requests and customer updates.
9. Decision, reasons, reviewer, remedy, notification and review route.
10. Actual refund/payment/shipment references, remaining obligations, next review and closure basis.

Do not use a checkmark as proof that an action occurred. Keep the actual evidence or reference. Super Admin reviews unassigned or overdue obligations and retains responsibility until an authorized operator is assigned.`,
};

export function completedOperatingSections(): LegalSection[] {
  return LEGAL_SECTIONS.map(([id]) => ({ id, body: bodies[id] }));
}
