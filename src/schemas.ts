import { z } from 'zod';

// Accept only http(s) URLs; anything else (javascript:, data:, missing, null)
// becomes '' so it can never be used as a link href or media source. Defensive
// against crowd-sourced radio-browser records.
const httpUrl = z
  .string()
  .catch('')
  .transform((u) => (/^https?:\/\//i.test(u) ? u : ''));

// radio-browser records are loosely typed and occasionally omit or null out
// fields. Each field falls back to a safe default (via `.catch()` / coercion)
// so one messy record never throws; unknown keys are stripped.
export const StationSchema = z.object({
  stationuuid: z.string().catch(''),
  name: z.string().catch(''),
  url_resolved: httpUrl,
  tags: z.string().catch(''),
  country: z.string().catch(''),
  codec: z.string().catch(''),
  bitrate: z.coerce.number().catch(0),
  clickcount: z.coerce.number().catch(0),
  votes: z.coerce.number().catch(0),
  favicon: httpUrl,
});
export type Station = z.infer<typeof StationSchema>;

// Validate each element independently so a single malformed record is dropped
// rather than discarding the whole list. Non-array payloads become [].
export const StationsSchema = z
  .array(z.unknown())
  .catch([])
  .transform((arr) =>
    arr.flatMap((item) => {
      const parsed = StationSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    })
  );

export const StatsSchema = z
  .object({ stations: z.coerce.number().catch(0) })
  .catch({ stations: 0 });
export type Stats = z.infer<typeof StatsSchema>;
