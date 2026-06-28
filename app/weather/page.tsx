import { generateDMAs, generateWeatherForecast, generateWeatherForDMA, HISTORY_DAYS } from '@/lib/mockData';
import WeatherLab, { WeatherLabDMA } from '@/components/WeatherLab';

export default function WeatherPage() {
  const dmas = generateDMAs();
  const forecasts = generateWeatherForecast(dmas);
  const labDmas: WeatherLabDMA[] = dmas.slice(0, 24).map((d) => {
    const hist = generateWeatherForDMA(d, HISTORY_DAYS);
    const temperature = Math.round((hist.reduce((s, w) => s + w.temperature, 0) / hist.length) * 10) / 10;
    const precipitation = Math.round((hist.reduce((s, w) => s + w.precipitation, 0) / hist.length) * 10) / 10;
    return {
      id: d.id,
      name: d.name,
      region: d.region,
      marketNorm: { temperature, precipitation },
      forecast: forecasts.filter((f) => f.dma === d.id),
    };
  });
  return <WeatherLab dmas={labDmas} />;
}
