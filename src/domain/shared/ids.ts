/**
 * Branded identifier types (design §6). Each id is a `string` at runtime but a
 * distinct nominal type at compile time, so a `FamilyId` can never be passed
 * where a `MemberId` is expected. The brand is a phantom property carrying a
 * unique tag; the smart constructors are identity casts.
 */
declare const brand: unique symbol;
type Branded<Tag extends string> = string & { readonly [brand]: Tag };

export type FamilyId = Branded<"FamilyId">;
export type MemberId = Branded<"MemberId">;
export type TemplateId = Branded<"TemplateId">;
export type InstanceId = Branded<"InstanceId">;
export type SubmissionId = Branded<"SubmissionId">;

export const familyId = (value: string): FamilyId => value as FamilyId;
export const memberId = (value: string): MemberId => value as MemberId;
export const templateId = (value: string): TemplateId => value as TemplateId;
export const instanceId = (value: string): InstanceId => value as InstanceId;
export const submissionId = (value: string): SubmissionId =>
  value as SubmissionId;
