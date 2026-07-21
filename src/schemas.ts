import { z } from 'zod';

// radio-browser records are loosely typed and occasionally omit or null out
// fields. Each field falls back to a safe default via `.catch()` so one messy
// record never throws; unknown keys are stripped.
export const StationSchema = z.object({
  stationuuid: z.string().catch(''),
  name: z.string().catch(''),
  url_resolved: z.string().catch(''),
  tags: z.string().catch(''),
  country: z.string().catch(''),
  codec: z.string().catch(''),
  bitrate: z.number().catch(0),
  clickcount: z.number().catch(0),
  votes: z.number().catch(0),
  favicon: z.string().catch(''),
});
export type Station = z.infer<typeof StationSchema>;

// If the payload isn't an array at all, fall back to an empty list.
export const StationsSchema = z.array(StationSchema).catch([]);

export const StatsSchema = z
  .object({ stations: z.number().catch(0) })
  .catch({ stations: 0 });
export type Stats = z.infer<typeof StatsSchema>;
