/**
 * Route Handler: GET /api/weather/[dmaId]?days=7
 *
 * Server-side proxy to the live weather provider (Open-Meteo). The client never
 * calls Open-Meteo directly — it hits this handler, which runs the provider on
 * the server and returns normalized WeatherObservation/WeatherForecast JSON.
 *
 * This handler always uses the LIVE provider, because it's only invoked when the
 * user explicitly toggles "Live Weather" in the Weather Signal Lab. The global
 * WEATHER_PROVIDER env var governs server-rendered defaults elsewhere.
 */
import type { NextRequest } from 'next/server';
import { generateDMAs } from '@/lib/mockData';
import { OpenMeteoWeatherProvider } from '@/lib/weather';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/weather/[dmaId]'>) {
  const { dmaId } = await ctx.params;
  const dma = generateDMAs().find((d) => d.id === dmaId);
  if (!dma) {
    return Response.json({ error: `Unknown DMA: ${dmaId}` }, { status: 404 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(14, daysParam) : 7;

  const provider = new OpenMeteoWeatherProvider();
  try {
    const [current, forecast] = await Promise.all([
      provider.getCurrentConditions(dma),
      provider.getForecast(dma, days),
    ]);
    return Response.json({
      dmaId,
      dmaName: dma.name,
      lat: dma.lat,
      lon: dma.lon,
      current,
      forecast,
      source: 'open-meteo',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // The client falls back to its embedded mock forecast on a non-200.
    return Response.json(
      { error: 'Live weather fetch failed', detail: message },
      { status: 502 },
    );
  }
}
