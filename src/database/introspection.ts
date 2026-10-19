import type { Session } from "./connections";
import { SchemaSnapshotSchema, type SchemaSnapshot } from "../shared/browse";
export const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export async function introspect(session: Session): Promise<SchemaSnapshot> {
  // Catalog names and OIDs come only from the connected server. Per-column SELECT
  // privileges are required so browsing never attempts a hidden column.
  const query = `SELECT json_build_object('tables',coalesce(json_agg(t),'[]'::json))::text AS snapshot FROM (
    SELECT c.oid::text AS id,n.nspname AS schema,c.relname AS name,
      CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' WHEN 'f' THEN 'foreign table' ELSE 'table' END AS kind,
      c.relrowsecurity AS rls,
      c.relkind IN ('r','p') AND has_table_privilege(c.oid,'UPDATE') AND k.key IS NOT NULL AS editable,
      coalesce(k.key,'[]'::json) AS key,
      coalesce(ks.keys,'[]'::json) AS keys,
      (SELECT json_agg(json_build_object('name',a.attname,'typeOid',a.atttypid::bigint,'typeName',format_type(a.atttypid,a.atttypmod),'nullable',NOT a.attnotnull,'generated',a.attgenerated<>'','identity',a.attidentity<>'','editable',c.relkind IN ('r','p') AND k.key IS NOT NULL AND a.attgenerated='' AND a.attidentity<>'a' AND has_column_privilege(c.oid,a.attnum,'UPDATE')) ORDER BY a.attnum)
       FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(c.oid,a.attnum,'SELECT')) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN LATERAL (SELECT json_agg(json_build_object('name',x.name,'primary',x.primary,'columns',x.columns,'suitable',x.suitable)) AS keys FROM (
      SELECT ci.relname AS name,i.indisprimary AS primary,json_agg(a.attname ORDER BY ord.n) AS columns,
        i.indisvalid AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL AND bool_and(a.attnotnull AND op.opcdefault AND i.indcollation[ord.n::int-1]=a.attcollation AND has_column_privilege(c.oid,a.attnum,'SELECT')) AS suitable
      FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY ord(attnum,n)
      LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=ord.attnum
      JOIN pg_opclass op ON op.oid=i.indclass[ord.n::int-1]
      WHERE i.indrelid=c.oid AND i.indisunique AND ord.n<=i.indnkeyatts
      GROUP BY ci.relname,i.indisprimary,i.indisvalid,i.indimmediate,i.indpred,i.indexprs
    ) x) ks ON true
    LEFT JOIN LATERAL (SELECT x->'columns' AS key FROM json_array_elements(coalesce(ks.keys,'[]'::json)) x WHERE (x->>'suitable')::boolean AND (c.relkind<>'r' OR NOT EXISTS (SELECT FROM pg_inherits WHERE inhparent=c.oid)) ORDER BY (x->>'primary')::boolean DESC,x->>'name' LIMIT 1) k ON true
    WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast' AND n.nspname !~ '^pg_temp'
      AND EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(c.oid,a.attnum,'SELECT'))
    ORDER BY n.nspname,c.relname LIMIT 10001
  ) t`;
  const result = await session.client.query<{ snapshot: string }>(
    `SELECT CASE WHEN octet_length(snapshot)<=16777216 THEN snapshot ELSE NULL END AS snapshot FROM (${query}) bounded_catalog`,
  );
  const raw = result.rows[0]?.snapshot;
  if (!raw || Buffer.byteLength(raw) > 16 * 1024 * 1024)
    throw new Error("Schema exceeds supported limits.");
  return SchemaSnapshotSchema.parse(JSON.parse(raw));
}
