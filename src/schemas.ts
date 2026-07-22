import { z } from 'zod';

const httpUrl = z
  .string()
  .catch('')
  .transform((u) => (/^https?:\/\//i.test(u) ? u : ''));

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
