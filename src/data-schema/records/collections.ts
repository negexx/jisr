import type { z } from "zod";

import { AdmissionRouteRecordSchema } from "./admission-route";
import { ApplicationChannelRecordSchema } from "./application-channel";
import { CostProfileRecordSchema } from "./cost-profile";
import { CountryRecordSchema } from "./country";
import { CredentialTypeRecordSchema } from "./credential-type";
import { FieldRecordSchema } from "./field";
import { GradeConversionRecordSchema } from "./grade-conversion";
import { GradingScaleRecordSchema } from "./grading-scale";
import { InstitutionRecordSchema } from "./institution";
import { LanguageCertificateRecordSchema } from "./language-certificate";
import { ProgramRecordSchema } from "./program";
import { ScholarshipRecordSchema } from "./scholarship";
import { SubjectRecordSchema } from "./subject";

export const COLLECTIONS = {
  countries: { schema: CountryRecordSchema, idKey: "code" },
  fields: { schema: FieldRecordSchema, idKey: "slug" },
  subjects: { schema: SubjectRecordSchema, idKey: "slug" },
  "language-certificates": { schema: LanguageCertificateRecordSchema, idKey: "slug" },
  "grading-scales": { schema: GradingScaleRecordSchema, idKey: "slug" },
  "grade-conversions": { schema: GradeConversionRecordSchema, idKey: "slug" },
  "credential-types": { schema: CredentialTypeRecordSchema, idKey: "slug" },
  "application-channels": { schema: ApplicationChannelRecordSchema, idKey: "slug" },
  "admission-routes": { schema: AdmissionRouteRecordSchema, idKey: "slug" },
  institutions: { schema: InstitutionRecordSchema, idKey: "slug" },
  programs: { schema: ProgramRecordSchema, idKey: "slug" },
  "cost-profiles": { schema: CostProfileRecordSchema, idKey: "slug" },
  scholarships: { schema: ScholarshipRecordSchema, idKey: "slug" },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;
export type RecordOf<C extends CollectionName> = z.output<(typeof COLLECTIONS)[C]["schema"]>;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export function isCollectionName(value: string): value is CollectionName {
  return Object.hasOwn(COLLECTIONS, value);
}
