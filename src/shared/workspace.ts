import { z } from "zod";
const RecoveryTextSchema = z
  .string()
  .max(1024 * 1024)
  .refine(
    (text) => new TextEncoder().encode(text).byteLength <= 1024 * 1024,
    "Recovery text exceeds 1 MiB; copy this draft before closing.",
  );
// Drafts are deliberately copy-only: no session IDs, row targets or save capabilities.
export const RecoveryDraftSchema = z
  .object({
    id: z.string().max(160),
    kind: z.enum(["json", "cell", "table", "sql"]),
    label: z.string().max(256),
    text: RecoveryTextSchema,
  })
  .strict();
export const WorkspaceSchema = z
  .object({
    version: z.literal(1),
    recoveryEnabled: z.boolean(),
    layout: z
      .object({ sqlOpened: z.boolean(), showSql: z.boolean() })
      .strict()
      .default({ sqlOpened: false, showSql: false }),
    theme: z.enum(["system", "light", "dark"]),
    sql: z.array(RecoveryTextSchema).max(16),
    drafts: z.array(RecoveryDraftSchema).max(32),
  })
  .strict();
export type Workspace = z.infer<typeof WorkspaceSchema>;
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  recoveryEnabled: true,
  theme: "system",
  layout: { sqlOpened: false, showSql: false },
  sql: [],
  drafts: [],
});
