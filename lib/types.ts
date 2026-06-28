// Core domain types for Geo Demand Engine

export type Region =
  | 'Northeast'
  | 'Midwest'
  | 'South'
  | 'West'
  | 'Pacific Northwest'
  | 'Southwest';

export type ProductCategory =
  | 'At-Home Beauty'
  | 'Outerwear'
  | 'Footwear'
  | 'Hydration'
  | 'Baby Care'
  | 'Wellness';

export type Channel =
  | 'Meta'
  | 'Google Search'
  | 'TikTok'
  | 'YouTube'
  | 'CTV'
  | 'Pinterest'
  | 'Amazon/RMN';

export type FunnelStage = 'TOF' | 'MOF' | 'BOF' | 'Retention';

export type WeatherRegime =
  | 'Normal'
  | 'Cold Snap'
  | 'Heat Wave'
  | 'Rainy Weekend'
  | 'Snow Event'
  | 'High UV'
  | 'Poor Air Quality'
  | 'Severe Storm'
  | 'First Warm Weekend'
  | 'First Cold Snap';

export type Action = 'Act' | 'Test' | 'Monitor' | 'Ignore' | 'Suppress';

export interface ClimateProfile {
  baseTempC: number; // annual mean temperature
  seasonalAmplitude: number; // peak-to-mean seasonal swing
  basePrecip: number; // baseline daily precip likelihood/amount
  snowProne: boolean;
  uvProne: boolean;
  airQualityRisk: number; // 0-1
}

export interface DMA {
  id: string;
  name: string;
  region: Region;
  population: number;
  baselineIndex: number; // relative demand index (~100 baseline)
  climate: ClimateProfile;
}

export interface WeatherObservation {
  date: string;
  dma: string;
  temperature: number; // celsius
  temp_anomaly: number; // deviation from market norm
  precipitation: number; // mm
  snow: number; // cm
  humidity: number; // 0-100
  uv_index: number; // 0-11+
  air_quality: number; // AQI
  severe_weather_flag: boolean;
  regime: WeatherRegime;
}

export interface WeatherForecast extends WeatherObservation {
  confidence: number; // 0-1 forecast confidence (decays with horizon)
  horizonDays: number;
}

export interface SalesObservation {
  date: string;
  dma: string;
  product_category: ProductCategory;
  revenue: number;
  orders: number;
  new_customers: number;
  returning_customers: number;
  margin: number; // contribution margin fraction 0-1
}

export interface MediaObservation {
  date: string;
  dma: string;
  channel: Channel;
  funnel_stage: FunnelStage;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface PromoObservation {
  date: string;
  promo_name: string;
  discount_level: number; // 0-1
  product_category: ProductCategory;
  dma: string;
}

export type InventoryStatus = 'Healthy' | 'Constrained' | 'Out of Stock';

export interface InventoryObservation {
  date: string;
  dma: string;
  product_category: ProductCategory;
  inventory_status: InventoryStatus;
  stock_level: number; // 0-1 fraction of target
}

export type CreativeFormat = 'Static' | 'Video' | 'Carousel' | 'UGC' | 'Story';

export interface CreativeObservation {
  creative_id: string;
  channel: Channel;
  funnel_stage: FunnelStage;
  message_angle: string;
  product_category: ProductCategory;
  format: CreativeFormat;
  launch_date: string;
}

export interface DecompositionResult {
  baseline: number;
  weatherLift: number;
  mediaLift: number;
  interactionLift: number;
  promoLift: number;
  inventoryEffect: number;
  seasonality: number;
  noise: number;
  observed: number;
}

export interface Recommendation {
  id: string;
  dma: string;
  dmaName: string;
  region: Region;
  product_category: ProductCategory;
  regime: WeatherRegime;
  action: Action;
  confidence: number; // 0-1
  opportunityScore: number; // 0-100
  expectedRevenueLift: number; // $
  expectedMarginImpact: number; // $
  recommendedBudgetShift: number; // $
  marginalRoas: number;
  weatherShare: number; // fraction of lift attributable to weather (0-1)
  riskFlags: string[];
  rationale: string;
  topChannel: Channel;
  funnelFocus: FunnelStage;
  urgency: number; // 0-100
}

export interface ScenarioInput {
  dma: string;
  product_category: ProductCategory;
  regime: WeatherRegime;
  timeWindow: 'pre' | 'during' | 'post';
  currentBudget: number;
  proposedBudgetChange: number; // delta $
  channelMix: Partial<Record<Channel, number>>; // weights sum ~1
  funnelMix: Partial<Record<FunnelStage, number>>;
  marginAssumption: number; // 0-1
  cacTarget: number;
  merTarget: number;
  inventoryReady: boolean;
  creativeReady: boolean;
}

export interface ScenarioOutput {
  expectedRevenueLift: number;
  expectedRevenueLow: number;
  expectedRevenueHigh: number;
  newCustomers: number;
  cac: number;
  mer: number;
  contributionMargin: number;
  confidence: number;
  action: Action;
  riskLevel: 'Low' | 'Medium' | 'High';
  explanation: string;
}

export interface OptimizerConstraint {
  totalBudget: number;
  maxShiftPerDma: number; // fraction 0-1
  maxShiftPerChannel: number; // fraction 0-1
  minSpendPerChannel: number; // $
  priorityKpi: 'Revenue' | 'New Customers' | 'Contribution Margin' | 'MER';
  riskTolerance: 'Conservative' | 'Balanced' | 'Aggressive';
  includedChannels: Channel[];
  includedRegions: Region[];
  inventoryConstraint: boolean;
  creativeReadiness: boolean;
}

export interface AllocationRow {
  dma: string;
  dmaName: string;
  channel: Channel;
  region: Region;
  currentSpend: number;
  recommendedSpend: number;
  delta: number;
  marginalRoas: number;
  expectedRevenue: number;
  saturationFlag: boolean;
  action: Action;
}

export interface CreativeBrief {
  id: string;
  dma: string;
  dmaName: string;
  region: Region;
  regime: WeatherRegime;
  product_category: ProductCategory;
  weatherContext: string;
  consumerMindset: string;
  messageAngle: string;
  hooks: string[];
  cta: string;
  landingPageRec: string;
  channelGuidance: { channel: Channel; funnel: FunnelStage; note: string }[];
  measurementPlan: string;
  format: CreativeFormat;
}

export interface ExperimentDesign {
  id: string;
  type: string;
  objective: string;
  treatmentMarkets: string[];
  controlMarkets: string[];
  durationDays: number;
  primaryKpi: string;
  secondaryKpis: string[];
  mde: string;
  measurementRisk: string;
  recommendedReadout: string;
}

export interface MatchedMarket {
  dma: string;
  dmaName: string;
  region: Region;
  similarity: number; // 0-1, higher = better match
  distance: number;
}
