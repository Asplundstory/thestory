import { useEffect, useMemo, useRef, useState } from 'react';
import './styles/App.css';

const FALLBACK_DATA_URL = '/sample-data.json';
const FALLBACK_VALUE_INSIGHTS_URL = '/sample-value-insights.json';
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
const FIRECRAWL_API_KEY = ((import.meta.env.VITE_FIRECRAWL_API_KEY as string | undefined) ?? '').trim() || undefined;
const FIRECRAWL_BASE_URL = (() => {
  const raw = (import.meta.env.VITE_FIRECRAWL_BASE_URL as string | undefined)?.trim();
  if (!raw) {
    return 'https://api.firecrawl.dev';
  }
  return raw.replace(/\/$/, '');
})();
const FIRECRAWL_TARGET_LIMIT = (() => {
  const raw = (import.meta.env.VITE_FIRECRAWL_MAX_RESULTS as string | undefined)?.trim();
  if (!raw) {
    return 6;
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 6;
  }
  return parsed;
})();

type FirecrawlStatus = 'idle' | 'loading' | 'ready' | 'error';

interface FirecrawlSummaryState {
  status: FirecrawlStatus;
  sourceUrl: string;
  title?: string;
  summary?: string;
  error?: string;
}

export interface WineValueInsight {
  id: string;
  wineSearcherUrl?: string;
  averageMarketPrice?: number;
  benchmarkPrice?: number;
  twelveMonthChangePercent?: number;
  fiveYearChangePercent?: number;
  analystNote?: string;
  valueScore?: 'exceptionell' | 'stark' | 'neutral' | 'svag';
}

export interface WineProduct {
  id: string;
  name: string;
  category?: string;
  subCategory?: string;
  style?: string;
  country?: string;
  origin?: string;
  grapes?: string[];
  supplier?: string;
  vintage?: string;
  price: number;
  volumeMl?: number;
  alcoholPercent?: number;
  sugarContent?: number;
  organic?: boolean;
  ethical?: boolean;
  sustainableChoice?: boolean;
  description?: string;
  usage?: string;
  drinkFromYear?: number;
  drinkToYear?: number;
  storagePotentialYears?: number;
  storageNote?: string;
  valueInsight?: WineValueInsight;
}

interface FilterState {
  search: string;
  category: string;
  country: string;
  minPrice: string;
  maxPrice: string;
  minAlcohol: string;
  maxAlcohol: string;
  onlyOrganic: boolean;
  onlyEthical: boolean;
  onlySustainable: boolean;
  drinkWindowFrom: string;
  drinkWindowTo: string;
  minStorageYears: string;
  maxStorageYears: string;
  sortBy: 'relevance' | 'price-asc' | 'price-desc' | 'alcohol-desc';
}

const DEFAULT_FILTERS: FilterState = {
  search: '',
  category: 'alla',
  country: 'alla',
  minPrice: '',
  maxPrice: '',
  minAlcohol: '',
  maxAlcohol: '',
  onlyOrganic: false,
  onlyEthical: false,
  onlySustainable: false,
  drinkWindowFrom: '',
  drinkWindowTo: '',
  minStorageYears: '',
  maxStorageYears: '',
  sortBy: 'relevance'
};

const parseNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalised = value.replace(/[^0-9.,-]/g, '').replace(',', '.');
    if (normalised.includes('-')) {
      const parts = normalised.split('-').map((part) => Number.parseFloat(part));
      const filtered = parts.filter((part) => !Number.isNaN(part));
      if (filtered.length > 0) {
        return filtered[filtered.length - 1];
      }
    }
    const parsed = Number.parseFloat(normalised);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
};

const parseYearRange = (value: unknown): { from?: number; to?: number } => {
  const years: number[] = [];

  if (typeof value === 'number' && value >= 1000 && value <= 9999) {
    years.push(value);
  } else if (typeof value === 'string') {
    const matches = value.match(/\d{4}/g);
    if (matches) {
      matches.forEach((match) => {
        const year = Number.parseInt(match, 10);
        if (!Number.isNaN(year)) {
          years.push(year);
        }
      });
    }
  } else if (Array.isArray(value)) {
    value.forEach((item) => {
      const { from, to } = parseYearRange(item);
      if (from) years.push(from);
      if (to) years.push(to);
    });
  }

  if (years.length === 0) {
    return {};
  }

  const sorted = [...new Set(years)].sort((a, b) => a - b);

  return {
    from: sorted[0],
    to: sorted.length > 1 ? sorted[sorted.length - 1] : undefined
  };
};

const parseStoragePotential = (value: unknown): { years?: number; note?: string } => {
  if (value === null || value === undefined) {
    return {};
  }

  if (typeof value === 'number') {
    return { years: value };
  }

  if (typeof value === 'string') {
    const numberMatch = value.match(/\d+/g);
    if (numberMatch && numberMatch.length > 0) {
      const years = Number.parseInt(numberMatch[numberMatch.length - 1] ?? '', 10);
      if (!Number.isNaN(years)) {
        return { years, note: value };
      }
    }
    return { note: value };
  }

  return {};
};

const toArray = (value: unknown): string[] | undefined => {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
};

const markdownToPlainText = (value: string): string =>
  value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(?:^|\n)[-+*]\s+/g, ' ')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const summariseFirecrawlContent = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  const plain = markdownToPlainText(value);
  if (!plain) {
    return undefined;
  }
  if (plain.length <= 600) {
    return plain;
  }
  return `${plain.slice(0, 600).trim()}…`;
};

const normaliseValueScore = (value: unknown): WineValueInsight['valueScore'] | undefined => {
  if (!value) return undefined;
  const normalised = String(value).trim().toLowerCase();
  switch (normalised) {
    case 'exceptionell':
    case 'exceptional':
      return 'exceptionell';
    case 'stark':
    case 'strong':
      return 'stark';
    case 'neutral':
      return 'neutral';
    case 'svag':
    case 'weak':
      return 'svag';
    default:
      return undefined;
  }
};

const normaliseValueInsight = (raw: Record<string, unknown>): WineValueInsight | null => {
  const id =
    (raw.id as string | undefined) ??
    (raw.productId as string | undefined) ??
    (raw.ProductId as string | undefined) ??
    (raw.articleId as string | undefined) ??
    (raw.ArticleId as string | undefined);

  if (!id) {
    return null;
  }

  const averageMarketPrice = parseNumber(
    raw.averageMarketPrice ?? raw.AverageMarketPrice ?? raw.marketPrice ?? raw.MarketPrice ?? raw.Price
  );
  const benchmarkPrice = parseNumber(
    raw.benchmarkPrice ?? raw.BenchmarkPrice ?? raw.globalAveragePrice ?? raw.GlobalAveragePrice
  );
  const twelveMonthChangePercent = parseNumber(
    raw.twelveMonthChangePercent ?? raw.TwelveMonthChangePercent ?? raw['12MonthChange'] ?? raw.YoyChange
  );
  const fiveYearChangePercent = parseNumber(
    raw.fiveYearChangePercent ?? raw.FiveYearChangePercent ?? raw['5YearChange'] ?? raw.FiveYearTrend
  );

  const analystNote =
    (raw.analystNote as string | undefined) ??
    (raw.AnalystNote as string | undefined) ??
    (raw.summary as string | undefined) ??
    (raw.Summary as string | undefined) ??
    (raw.Comment as string | undefined);

  const wineSearcherUrl =
    (raw.wineSearcherUrl as string | undefined) ??
    (raw.WineSearcherUrl as string | undefined) ??
    (raw.url as string | undefined) ??
    (raw.Url as string | undefined);

  const valueScore = normaliseValueScore(raw.valueScore ?? raw.ValueScore ?? raw.rating ?? raw.Rating);

  return {
    id,
    wineSearcherUrl,
    averageMarketPrice: averageMarketPrice ?? undefined,
    benchmarkPrice: benchmarkPrice ?? undefined,
    twelveMonthChangePercent: twelveMonthChangePercent ?? undefined,
    fiveYearChangePercent: fiveYearChangePercent ?? undefined,
    analystNote,
    valueScore
  };
};

const fetchValueInsights = async (productIds: string[]): Promise<Record<string, WineValueInsight>> => {
  if (!productIds.length) {
    return {};
  }

  const uniqueIds = Array.from(new Set(productIds));

  const extract = (data: unknown): Record<string, WineValueInsight> => {
    const rawList: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { insights?: unknown[] } | undefined)?.insights)
        ? (((data as { insights?: unknown[] }).insights ?? []) as Record<string, unknown>[])
        : [];

    return rawList.reduce<Record<string, WineValueInsight>>((accumulator, item) => {
      const insight = normaliseValueInsight(item);
      if (insight) {
        accumulator[insight.id] = insight;
      }
      return accumulator;
    }, {});
  };

  try {
    const params = new URLSearchParams();
    params.set('ids', uniqueIds.join(','));
    const url = `${API_BASE_URL.replace(/\/$/, '')}/value-insights?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Misslyckades att hämta värdeinsikter (${response.status})`);
    }
    const data = await response.json();
    return extract(data);
  } catch (apiError) {
    console.warn('Värdeinsikter via API misslyckades, använder reservdata', apiError);
    const fallbackResponse = await fetch(FALLBACK_VALUE_INSIGHTS_URL, {
      headers: { Accept: 'application/json' }
    });
    if (!fallbackResponse.ok) {
      throw new Error('Kunde inte läsa reservinsikter');
    }
    const fallbackData = await fallbackResponse.json();
    return extract(fallbackData);
  }
};

const mergeWithValueInsights = async (products: WineProduct[]): Promise<WineProduct[]> => {
  if (!products.length) {
    return products;
  }

  try {
    const insights = await fetchValueInsights(products.map((product) => product.id));
    if (!Object.keys(insights).length) {
      return products;
    }

    return products.map((product) => ({
      ...product,
      valueInsight: insights[product.id]
    }));
  } catch (error) {
    console.warn('Kunde inte koppla värdeinsikter', error);
    return products;
  }
};

const normaliseProduct = (raw: Record<string, unknown>): WineProduct | null => {
  const id =
    (raw.id as string | undefined) ??
    (raw.productId as string | undefined) ??
    (raw.ProductId as string | undefined) ??
    (raw.ProductNumber as string | undefined) ??
    (typeof raw.ArticleNumber === 'number' ? String(raw.ArticleNumber) : (raw.ArticleNumber as string | undefined));

  if (!id) {
    return null;
  }

  const boldName =
    (raw.name as string | undefined) ??
    (raw.productNameBold as string | undefined) ??
    (raw.ProductNameBold as string | undefined) ??
    (raw.ProductName as string | undefined) ??
    (raw.ProductTitle as string | undefined);
  const thinName =
    (raw.productNameThin as string | undefined) ??
    (raw.ProductNameThin as string | undefined) ??
    (raw.SubTitle as string | undefined);

  const displayName = [boldName, thinName].filter(Boolean).join(' ').trim();

  const category =
    (raw.category as string | undefined) ??
    (raw.Category as string | undefined) ??
    (raw.CategoryLevel1 as string | undefined) ??
    (raw.CategoryLevel as string | undefined);

  const subCategory =
    (raw.categoryLevel2 as string | undefined) ??
    (raw.CategoryLevel2 as string | undefined) ??
    (raw.CategoryLevel3 as string | undefined) ??
    (raw.SubCategory as string | undefined);

  const style =
    (raw.categoryLevel3 as string | undefined) ??
    (raw.CategoryLevel3 as string | undefined) ??
    (raw.Style as string | undefined);

  const country = (raw.country as string | undefined) ?? (raw.Country as string | undefined);
  const origin =
    (raw.origin as string | undefined) ??
    (raw.OriginLevel1 as string | undefined) ??
    (raw.Region as string | undefined) ??
    (raw.District as string | undefined);

  const grapes = toArray(raw.grapes ?? raw.Grapes ?? raw.GrapeSort ?? raw.GrapeSorts);

  const supplier =
    (raw.supplierName as string | undefined) ??
    (raw.SupplierName as string | undefined) ??
    (raw.ProducerName as string | undefined);

  const price =
    parseNumber(raw.price ?? raw.Price ?? raw.PriceIncludingVAT) ??
    (raw.SystembolagetPrice && Array.isArray(raw.SystembolagetPrice)
      ? parseNumber((raw.SystembolagetPrice as unknown[])[0])
      : undefined) ??
    0;

  const volumeMl =
    parseNumber(raw.volume ?? raw.Volume ?? raw.BottleVolume ?? raw.VolumeInMilliliter) ??
    (parseNumber(raw.VolumeInCentiliter) !== undefined
      ? (parseNumber(raw.VolumeInCentiliter) as number) * 10
      : undefined);

  const alcoholPercent =
    parseNumber(raw.alcoholPercent ?? raw.AlcoholPercent ?? raw.AlcoholContent ?? raw.Alcohol) ?? undefined;

  const sugarContent = parseNumber(raw.sugarContent ?? raw.SugarContent ?? raw.Sugar);

  const organic = Boolean(raw.organic ?? raw.Organic ?? raw.IsOrganic);
  const ethical = Boolean(raw.ethical ?? raw.Ethical ?? raw.EthicalLabel ?? raw.IsEthical);
  const sustainableChoice = Boolean(raw.sustainableChoice ?? raw.IsSustainableChoice ?? raw.Sustainable);

  const description =
    (raw.taste as string | undefined) ??
    (raw.Taste as string | undefined) ??
    (raw.Description as string | undefined) ??
    (raw.Character as string | undefined);

  const usage = (raw.Usage as string | undefined) ?? (raw.UsageOfProduct as string | undefined);

  const vintage = (raw.vintage as string | undefined) ?? (raw.Vintage as string | undefined);

  const drinkWindowSources = [
    raw.drinkWindow,
    raw.DrinkWindow,
    raw.drinkRange,
    raw.DrinkRange,
    raw.drinkability,
    raw.Drinkability,
    raw.drinkYears,
    raw.DrinkYears,
    raw.drinkDates,
    raw.DrinkDates,
    raw.drinkFromYear,
    raw.drinkToYear,
    raw.DrinkFromYear,
    raw.DrinkToYear,
    raw.BestBefore,
    raw.BestAfter,
    raw.ReadyToDrink,
    raw.ReadyToDrinkYear
  ].filter((item) => item !== undefined && item !== null);

  const { from: drinkFromYear, to: drinkToYear } = parseYearRange(
    drinkWindowSources.length === 0 ? undefined : drinkWindowSources.length === 1 ? drinkWindowSources[0] : drinkWindowSources
  );

  const storageRaw =
    raw.storagePotential ??
    raw.StoragePotential ??
    raw.storage ??
    raw.Storage ??
    raw.storageRecommendation ??
    raw.StorageRecommendation ??
    raw.storageNote ??
    raw.StorageNote ??
    raw.AgingPotential ??
    raw.CellarPotential ??
    raw.CellaringPotential ??
    raw.Maturity ??
    raw.StorageComment;

  const parsedStorage = parseStoragePotential(storageRaw);

  const storagePotentialYears =
    parsedStorage.years ??
    parseNumber(
      raw.storageYears ??
        raw.StorageYears ??
        raw.storageTime ??
        raw.StorageTime ??
        raw.maximumStorage ??
        raw.MaximumStorage ??
        raw.MaxStorageYears
    );

  const storageNote =
    parsedStorage.note ??
    (typeof storageRaw === 'string' ? storageRaw : undefined) ??
    (raw.StorageComment as string | undefined);

  return {
    id,
    name: displayName || id,
    category: category ?? undefined,
    subCategory: subCategory ?? undefined,
    style: style ?? undefined,
    country: country ?? undefined,
    origin: origin ?? undefined,
    grapes,
    supplier,
    vintage,
    price,
    volumeMl,
    alcoholPercent,
    sugarContent,
    organic,
    ethical,
    sustainableChoice,
    description,
    usage,
    drinkFromYear,
    drinkToYear,
    storagePotentialYears: storagePotentialYears ?? undefined,
    storageNote
  };
};

const buildQuery = (filters: FilterState): string => {
  const params = new URLSearchParams();

  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.category !== 'alla') params.set('category', filters.category);
  if (filters.country !== 'alla') params.set('country', filters.country);
  if (filters.minPrice) params.set('minPrice', filters.minPrice);
  if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
  if (filters.minAlcohol) params.set('minAlcohol', filters.minAlcohol);
  if (filters.maxAlcohol) params.set('maxAlcohol', filters.maxAlcohol);
  if (filters.onlyOrganic) params.set('organic', 'true');
  if (filters.onlyEthical) params.set('ethical', 'true');
  if (filters.onlySustainable) params.set('sustainable', 'true');
  if (filters.drinkWindowFrom) params.set('drinkFrom', filters.drinkWindowFrom);
  if (filters.drinkWindowTo) params.set('drinkTo', filters.drinkWindowTo);
  if (filters.minStorageYears) params.set('minStorageYears', filters.minStorageYears);
  if (filters.maxStorageYears) params.set('maxStorageYears', filters.maxStorageYears);
  if (filters.sortBy !== 'relevance') params.set('sort', filters.sortBy);

  return params.toString();
};

const useWineProducts = (filters: FilterState) => {
  const [products, setProducts] = useState<WineProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);

      try {
        const query = buildQuery(filters);
        const url = `${API_BASE_URL.replace(/\/$/, '')}/products${query ? `?${query}` : ''}`;
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Misslyckades att hämta data (${response.status})`);
        }

        const data = await response.json();
        const rawList: Record<string, unknown>[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
            ? (data.products as Record<string, unknown>[])
            : [];

        const normalised = rawList.map(normaliseProduct).filter(Boolean) as WineProduct[];
        let enriched = normalised;
        if (!cancelled) {
          enriched = await mergeWithValueInsights(normalised);
        }

        if (!cancelled) {
          setProducts(enriched);
        }
      } catch (fetchError) {
        console.warn('API-förfrågan misslyckades, försöker reservdata', fetchError);
        try {
          const fallbackResponse = await fetch(FALLBACK_DATA_URL, {
            headers: { Accept: 'application/json' }
          });
          if (!fallbackResponse.ok) {
            throw new Error('Kunde inte läsa reservdata');
          }
          const fallbackData = (await fallbackResponse.json()) as Record<string, unknown>[];
          const normalisedFallback = fallbackData.map(normaliseProduct).filter(Boolean) as WineProduct[];
          let enrichedFallback = normalisedFallback;
          if (!cancelled) {
            enrichedFallback = await mergeWithValueInsights(normalisedFallback);
          }
          if (!cancelled) {
            setProducts(enrichedFallback);
          }
        } catch (fallbackError) {
          if (!cancelled) {
            setError(
              fetchError instanceof Error
                ? fetchError.message
                : 'Det gick inte att hämta vininformation just nu.'
            );
            console.error('Reservdata misslyckades', fallbackError);
          }
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, [filters]);

  return { products, loading, error };
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(price);

const formatVolume = (volume?: number) => {
  if (!volume) return 'okänd volym';
  if (volume >= 1000) {
    return `${(volume / 1000).toFixed(volume % 1000 === 0 ? 0 : 1)} l`;
  }
  return `${volume} ml`;
};

const formatAlcohol = (alcohol?: number) => {
  if (alcohol === undefined) return 'okänd alkohol';
  return `${alcohol.toFixed(1)}%`;
};

const formatDrinkWindow = (from?: number, to?: number) => {
  if (from && to) {
    return `${from}–${to}`;
  }
  if (from) {
    return `från ${from}`;
  }
  if (to) {
    return `till ${to}`;
  }
  return 'uppgift saknas';
};

const formatStorageInfo = (years?: number, note?: string) => {
  const parts: string[] = [];
  if (years !== undefined) {
    parts.push(`upp till ${years} år`);
  }
  if (note) {
    const trimmed = note.trim();
    if (trimmed) {
      if (parts.length > 0 && trimmed.toLowerCase().startsWith('upp till')) {
        return trimmed;
      }
      parts.push(trimmed);
    }
  }
  if (!parts.length) {
    return undefined;
  }
  return parts
    .map((fragment, index) => (index === 0 ? fragment.charAt(0).toUpperCase() + fragment.slice(1) : fragment))
    .join('. ');
};

const formatPercentChange = (value: number) => {
  const precision = Math.abs(value) >= 10 ? 0 : 1;
  const formatted = value.toFixed(precision);
  return `${value > 0 ? '+' : ''}${formatted}%`;
};

const translateValueScore = (score?: WineValueInsight['valueScore']) => {
  switch (score) {
    case 'exceptionell':
      return 'Exceptionell potential';
    case 'stark':
      return 'Stark potential';
    case 'neutral':
      return 'Neutral utveckling';
    case 'svag':
      return 'Svag utveckling';
    default:
      return undefined;
  }
};

const FilterTag = ({ label, onRemove }: { label: string; onRemove?: () => void }) => (
  <button className="filter-tag" type="button" onClick={onRemove} aria-label={`Ta bort filtret ${label}`}>
    <span>{label}</span>
    {onRemove && <span aria-hidden="true">×</span>}
  </button>
);

const App = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { products, loading, error } = useWineProducts(filters);
  const firecrawlEnabled = Boolean(FIRECRAWL_API_KEY);
  const [firecrawlSummaries, setFirecrawlSummaries] = useState<Record<string, FirecrawlSummaryState>>({});
  const firecrawlSummariesRef = useRef(firecrawlSummaries);

  useEffect(() => {
    firecrawlSummariesRef.current = firecrawlSummaries;
  }, [firecrawlSummaries]);

  const activeFilters = useMemo(() => {
    const tags: { key: keyof FilterState; label: string }[] = [];
    if (filters.search) tags.push({ key: 'search', label: `Sök: "${filters.search}"` });
    if (filters.category !== 'alla') tags.push({ key: 'category', label: filters.category });
    if (filters.country !== 'alla') tags.push({ key: 'country', label: filters.country });
    if (filters.minPrice) tags.push({ key: 'minPrice', label: `Min ${filters.minPrice} kr` });
    if (filters.maxPrice) tags.push({ key: 'maxPrice', label: `Max ${filters.maxPrice} kr` });
    if (filters.minAlcohol) tags.push({ key: 'minAlcohol', label: `Min ${filters.minAlcohol}%` });
    if (filters.maxAlcohol) tags.push({ key: 'maxAlcohol', label: `Max ${filters.maxAlcohol}%` });
    if (filters.onlyOrganic) tags.push({ key: 'onlyOrganic', label: 'Endast ekologiskt' });
    if (filters.onlyEthical) tags.push({ key: 'onlyEthical', label: 'Endast etiskt' });
    if (filters.onlySustainable) tags.push({ key: 'onlySustainable', label: 'Hållbart val' });
    if (filters.drinkWindowFrom) tags.push({ key: 'drinkWindowFrom', label: `Drickfönster från ${filters.drinkWindowFrom}` });
    if (filters.drinkWindowTo) tags.push({ key: 'drinkWindowTo', label: `Drickfönster till ${filters.drinkWindowTo}` });
    if (filters.minStorageYears) tags.push({ key: 'minStorageYears', label: `Lagring minst ${filters.minStorageYears} år` });
    if (filters.maxStorageYears) tags.push({ key: 'maxStorageYears', label: `Lagring max ${filters.maxStorageYears} år` });
    return tags;
  }, [filters]);

  const filteredProducts = useMemo(() => {
    const list = [...products];

    const matches = list.filter((product) => {
      const text = filters.search.toLowerCase();
      const haystack = [product.name, product.category, product.country, product.origin, product.supplier]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (text && !haystack.includes(text)) {
        return false;
      }

      if (filters.category !== 'alla' && product.category !== filters.category) {
        return false;
      }

      if (filters.country !== 'alla' && product.country !== filters.country) {
        return false;
      }

      const price = product.price;
      if (filters.minPrice && price < Number(filters.minPrice)) {
        return false;
      }
      if (filters.maxPrice && price > Number(filters.maxPrice)) {
        return false;
      }

      const alcohol = product.alcoholPercent ?? null;
      if (filters.minAlcohol && (alcohol === null || alcohol < Number(filters.minAlcohol))) {
        return false;
      }
      if (filters.maxAlcohol && (alcohol === null || alcohol > Number(filters.maxAlcohol))) {
        return false;
      }

      if (filters.onlyOrganic && !product.organic) {
        return false;
      }

      if (filters.onlyEthical && !product.ethical) {
        return false;
      }

      if (filters.onlySustainable && !product.sustainableChoice) {
        return false;
      }

      const drinkFrom = product.drinkFromYear ?? product.drinkToYear;
      const drinkTo = product.drinkToYear ?? product.drinkFromYear;

      if (filters.drinkWindowFrom) {
        const desiredFrom = Number(filters.drinkWindowFrom);
        if (!Number.isNaN(desiredFrom)) {
          if (drinkTo === undefined || drinkTo < desiredFrom) {
            return false;
          }
        }
      }

      if (filters.drinkWindowTo) {
        const desiredTo = Number(filters.drinkWindowTo);
        if (!Number.isNaN(desiredTo)) {
          if (drinkFrom === undefined || drinkFrom > desiredTo) {
            return false;
          }
        }
      }

      if (filters.minStorageYears) {
        const minStorage = Number(filters.minStorageYears);
        if (!Number.isNaN(minStorage)) {
          if (product.storagePotentialYears === undefined || product.storagePotentialYears < minStorage) {
            return false;
          }
        }
      }

      if (filters.maxStorageYears) {
        const maxStorage = Number(filters.maxStorageYears);
        if (!Number.isNaN(maxStorage)) {
          if (product.storagePotentialYears === undefined || product.storagePotentialYears > maxStorage) {
            return false;
          }
        }
      }

      return true;
    });

    switch (filters.sortBy) {
      case 'price-asc':
        return matches.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return matches.sort((a, b) => b.price - a.price);
      case 'alcohol-desc':
        return matches.sort((a, b) => (b.alcoholPercent ?? 0) - (a.alcoholPercent ?? 0));
      default:
        return matches;
    }
  }, [filters, products]);

  const firecrawlTargets = useMemo(() => {
    if (!firecrawlEnabled) {
      return [] as string[];
    }
    const urls = filteredProducts
      .map((product) => product.valueInsight?.wineSearcherUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0);
    return Array.from(new Set(urls)).slice(0, FIRECRAWL_TARGET_LIMIT);
  }, [filteredProducts, firecrawlEnabled]);

  useEffect(() => {
    if (!firecrawlEnabled || !FIRECRAWL_API_KEY) {
      return;
    }
    if (!firecrawlTargets.length) {
      return;
    }

    let isActive = true;

    const fetchSummaries = async () => {
      for (const url of firecrawlTargets) {
        if (!isActive) {
          break;
        }

        const existing = firecrawlSummariesRef.current[url];
        if (existing && (existing.status === 'loading' || existing.status === 'ready')) {
          continue;
        }

        setFirecrawlSummaries((prev) => ({
          ...prev,
          [url]: {
            status: 'loading',
            sourceUrl: url
          }
        }));

        try {
          const response = await fetch(`${FIRECRAWL_BASE_URL}/v1/scrape`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`
            },
            body: JSON.stringify({
              url,
              formats: ['markdown', 'extract', 'text']
            })
          });

          if (!response.ok) {
            throw new Error(`Firecrawl svarade med status ${response.status}`);
          }

          const payload = await response.json();
          const data = payload?.data ?? payload ?? {};
          const content =
            (typeof data?.markdown === 'string' && data.markdown) ||
            (typeof data?.extract === 'string' && data.extract) ||
            (typeof data?.text === 'string' && data.text) ||
            (typeof data?.content === 'string' && data.content) ||
            undefined;
          const summary = summariseFirecrawlContent(content);
          const title = typeof data?.title === 'string' ? data.title : undefined;

          if (!isActive) {
            return;
          }

          setFirecrawlSummaries((prev) => ({
            ...prev,
            [url]: {
              status: 'ready',
              sourceUrl: url,
              title,
              summary
            }
          }));
        } catch (fetchError) {
          if (!isActive) {
            return;
          }

          setFirecrawlSummaries((prev) => ({
            ...prev,
            [url]: {
              status: 'error',
              sourceUrl: url,
              error: fetchError instanceof Error ? fetchError.message : 'Okänt fel'
            }
          }));
        }
      }
    };

    fetchSummaries();

    return () => {
      isActive = false;
    };
  }, [firecrawlTargets, firecrawlEnabled]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => {
      if (product.category) {
        set.add(product.category);
      }
    });
    return Array.from(set).sort();
  }, [products]);

  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((product) => {
      if (product.country) {
        set.add(product.country);
      }
    });
    return Array.from(set).sort();
  }, [products]);

  const averagePrice = useMemo(() => {
    if (!filteredProducts.length) return 0;
    const total = filteredProducts.reduce((sum, product) => sum + product.price, 0);
    return Math.round(total / filteredProducts.length);
  }, [filteredProducts]);

  const valueSummary = useMemo(() => {
    const withInsights = filteredProducts.filter((product) => product.valueInsight);
    if (!withInsights.length) {
      return null;
    }

    const collectValues = (selector: (product: WineProduct) => number | undefined) =>
      withInsights
        .map(selector)
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;

    const twelveMonthValues = collectValues((product) => product.valueInsight?.twelveMonthChangePercent);
    const fiveYearValues = collectValues((product) => product.valueInsight?.fiveYearChangePercent);

    const bestTwelveMonth = withInsights.reduce<
      { product: WineProduct; change: number } | undefined
    >((best, product) => {
      const change = product.valueInsight?.twelveMonthChangePercent;
      if (typeof change !== 'number' || Number.isNaN(change)) {
        return best;
      }
      if (!best || change > best.change) {
        return { product, change };
      }
      return best;
    }, undefined);

    const bestFiveYear = withInsights.reduce<
      { product: WineProduct; change: number } | undefined
    >((best, product) => {
      const change = product.valueInsight?.fiveYearChangePercent;
      if (typeof change !== 'number' || Number.isNaN(change)) {
        return best;
      }
      if (!best || change > best.change) {
        return { product, change };
      }
      return best;
    }, undefined);

    return {
      avgTwelveMonth: average(twelveMonthValues),
      avgFiveYear: average(fiveYearValues),
      bestTwelveMonth,
      bestFiveYear
    };
  }, [filteredProducts]);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="page">
      <header className="page__header">
        <h1>Vinguide</h1>
        <p>Sök och filtrera i Systembolagets datamängder.</p>
      </header>

      <section className="filters">
        <div className="filters__group">
          <label htmlFor="search">Sök</label>
          <input
            id="search"
            type="search"
            placeholder="Sök på namn, land, producent..."
            value={filters.search}
            onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
          />
        </div>

        <div className="filters__row">
          <div className="filters__group">
            <label htmlFor="category">Kategori</label>
            <select
              id="category"
              value={filters.category}
              onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="alla">Alla kategorier</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="filters__group">
            <label htmlFor="country">Land</label>
            <select
              id="country"
              value={filters.country}
              onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value }))}
            >
              <option value="alla">Alla länder</option>
              {countryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="filters__group">
            <label htmlFor="sortBy">Sortering</label>
            <select
              id="sortBy"
              value={filters.sortBy}
              onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value as FilterState['sortBy'] }))}
            >
              <option value="relevance">Relevans</option>
              <option value="price-asc">Pris, lägst först</option>
              <option value="price-desc">Pris, högst först</option>
              <option value="alcohol-desc">Alkoholhalt, högst först</option>
            </select>
          </div>
        </div>

        <div className="filters__row">
          <div className="filters__group filters__group--inline">
            <label htmlFor="minPrice">Prisintervall</label>
            <div className="filters__inputs-inline">
              <input
                id="minPrice"
                type="number"
                min={0}
                placeholder="Min"
                value={filters.minPrice}
                onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))}
              />
              <span className="filters__separator">–</span>
              <input
                id="maxPrice"
                type="number"
                min={0}
                placeholder="Max"
                value={filters.maxPrice}
                onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))}
              />
            </div>
          </div>

          <div className="filters__group filters__group--inline">
            <label htmlFor="minAlcohol">Alkohol %</label>
            <div className="filters__inputs-inline">
              <input
                id="minAlcohol"
                type="number"
                min={0}
                step={0.1}
                placeholder="Min"
                value={filters.minAlcohol}
                onChange={(event) => setFilters((current) => ({ ...current, minAlcohol: event.target.value }))}
              />
              <span className="filters__separator">–</span>
              <input
                id="maxAlcohol"
                type="number"
                min={0}
                step={0.1}
                placeholder="Max"
                value={filters.maxAlcohol}
                onChange={(event) => setFilters((current) => ({ ...current, maxAlcohol: event.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="filters__row">
          <div className="filters__group filters__group--inline">
            <label htmlFor="drinkWindowFrom">Drickfönster (år)</label>
            <div className="filters__inputs-inline">
              <input
                id="drinkWindowFrom"
                type="number"
                min={1900}
                max={2100}
                placeholder="Från"
                value={filters.drinkWindowFrom}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, drinkWindowFrom: event.target.value }))
                }
              />
              <span className="filters__separator">–</span>
              <input
                id="drinkWindowTo"
                type="number"
                min={1900}
                max={2100}
                placeholder="Till"
                value={filters.drinkWindowTo}
                onChange={(event) => setFilters((current) => ({ ...current, drinkWindowTo: event.target.value }))}
              />
            </div>
          </div>

          <div className="filters__group filters__group--inline">
            <label htmlFor="minStorageYears">Lagringspotential (år)</label>
            <div className="filters__inputs-inline">
              <input
                id="minStorageYears"
                type="number"
                min={0}
                placeholder="Min"
                value={filters.minStorageYears}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, minStorageYears: event.target.value }))
                }
              />
              <span className="filters__separator">–</span>
              <input
                id="maxStorageYears"
                type="number"
                min={0}
                placeholder="Max"
                value={filters.maxStorageYears}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, maxStorageYears: event.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <div className="filters__checkboxes">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.onlyOrganic}
              onChange={(event) => setFilters((current) => ({ ...current, onlyOrganic: event.target.checked }))}
            />
            <span>Endast ekologiskt</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.onlyEthical}
              onChange={(event) => setFilters((current) => ({ ...current, onlyEthical: event.target.checked }))}
            />
            <span>Endast etiskt märkta</span>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={filters.onlySustainable}
              onChange={(event) =>
                setFilters((current) => ({ ...current, onlySustainable: event.target.checked }))
              }
            />
            <span>Hållbart val</span>
          </label>
        </div>

        <div className="filters__footer">
          <div className="filters__tags" aria-live="polite">
            {activeFilters.length > 0 ? (
              activeFilters.map((item) => (
                <FilterTag
                  key={item.key}
                  label={item.label}
                  onRemove={() => setFilters((current) => ({ ...current, [item.key]: DEFAULT_FILTERS[item.key] }))}
                />
              ))
            ) : (
              <span>Inga aktiva filter</span>
            )}
          </div>
          <button className="button button--ghost" type="button" onClick={clearFilters} disabled={activeFilters.length === 0}>
            Rensa alla filter
          </button>
        </div>
      </section>

      <section className="results" aria-live="polite">
        <header className="results__header">
          <h2>Träffar</h2>
          <div className="results__meta">
            {loading ? 'Hämtar data...' : `${filteredProducts.length} av ${products.length} produkter`}
            {filteredProducts.length > 0 && (
              <span className="results__average">Snittpris: {formatPrice(averagePrice)}</span>
            )}
          </div>
        </header>

        {valueSummary && (
          <aside className="results__insights" aria-live="polite">
            <h3>Wine-Searcher analys</h3>
            <dl className="results__insights-stats">
              {valueSummary.avgTwelveMonth !== undefined && (
                <div>
                  <dt>Snitt 12 mån</dt>
                  <dd>{formatPercentChange(valueSummary.avgTwelveMonth)}</dd>
                </div>
              )}
              {valueSummary.avgFiveYear !== undefined && (
                <div>
                  <dt>Snitt 5 år</dt>
                  <dd>{formatPercentChange(valueSummary.avgFiveYear)}</dd>
                </div>
              )}
            </dl>
            {(valueSummary.bestTwelveMonth || valueSummary.bestFiveYear) && (
              <ul className="results__insights-leaders">
                {valueSummary.bestTwelveMonth && (
                  <li>
                    Bäst 12 månader: <strong>{valueSummary.bestTwelveMonth.product.name}</strong>{' '}
                    ({formatPercentChange(valueSummary.bestTwelveMonth.change)})
                  </li>
                )}
                {valueSummary.bestFiveYear && (
                  <li>
                    Bäst 5 år: <strong>{valueSummary.bestFiveYear.product.name}</strong>{' '}
                    ({formatPercentChange(valueSummary.bestFiveYear.change)})
                  </li>
                )}
              </ul>
            )}
          </aside>
        )}

        {error && (
          <div className="results__error" role="alert">
            <strong>Något gick fel:</strong> {error}
          </div>
        )}

        {!loading && filteredProducts.length === 0 && !error && (
          <p className="results__empty">Inga produkter matchade dina filter. Justera och försök igen.</p>
        )}

        <ul className="results__grid">
          {filteredProducts.map((product) => {
            const storageInfo = formatStorageInfo(product.storagePotentialYears, product.storageNote);
            const valueScoreLabel = translateValueScore(product.valueInsight?.valueScore);
            const firecrawlUrl = product.valueInsight?.wineSearcherUrl;
            const firecrawlSummary = firecrawlUrl ? firecrawlSummaries[firecrawlUrl] : undefined;
            const firecrawlScheduled = firecrawlUrl ? firecrawlTargets.includes(firecrawlUrl) : false;
            const firecrawlHeading = firecrawlSummary?.title?.trim() || 'Firecrawl-insikt';
            return (
              <li key={product.id} className="card">
                <div className="card__header">
                  <h3>{product.name}</h3>
                  <span className="card__price">{formatPrice(product.price)}</span>
                </div>
                <dl className="card__details">
                  {product.category && (
                    <div>
                      <dt>Kategori</dt>
                      <dd>{product.category}</dd>
                    </div>
                  )}
                  {product.country && (
                    <div>
                      <dt>Ursprung</dt>
                      <dd>
                        {product.country}
                        {product.origin ? ` – ${product.origin}` : ''}
                      </dd>
                    </div>
                  )}
                  {product.vintage && (
                    <div>
                      <dt>Årgång</dt>
                      <dd>{product.vintage}</dd>
                    </div>
                  )}
                  {(product.drinkFromYear || product.drinkToYear) && (
                    <div>
                      <dt>Drickfönster</dt>
                      <dd>{formatDrinkWindow(product.drinkFromYear, product.drinkToYear)}</dd>
                    </div>
                  )}
                  {storageInfo && (
                    <div>
                      <dt>Lagring</dt>
                      <dd>{storageInfo}</dd>
                    </div>
                  )}
                  {product.volumeMl && (
                    <div>
                      <dt>Volym</dt>
                      <dd>{formatVolume(product.volumeMl)}</dd>
                    </div>
                  )}
                  {product.alcoholPercent !== undefined && (
                    <div>
                      <dt>Alkoholhalt</dt>
                      <dd>{formatAlcohol(product.alcoholPercent)}</dd>
                    </div>
                  )}
                  {product.grapes && product.grapes.length > 0 && (
                    <div>
                      <dt>Druvor</dt>
                      <dd>{product.grapes.join(', ')}</dd>
                    </div>
                  )}
                  {product.supplier && (
                    <div>
                      <dt>Producent</dt>
                      <dd>{product.supplier}</dd>
                    </div>
                  )}
                </dl>
                {(product.organic || product.ethical || product.sustainableChoice) && (
                  <div className="card__badges">
                    {product.organic && <span className="badge">Ekologisk</span>}
                    {product.ethical && <span className="badge">Etisk</span>}
                    {product.sustainableChoice && <span className="badge">Hållbart val</span>}
                  </div>
                )}
                {product.description && <p className="card__description">{product.description}</p>}
                {product.valueInsight && (
                  <div className="card__analysis">
                    <div className="card__analysis-header">
                      <h4>Wine-Searcher</h4>
                      {valueScoreLabel && (
                        <span
                          className={`badge badge--value ${
                            product.valueInsight.valueScore
                              ? `badge--value-${product.valueInsight.valueScore}`
                              : ''
                          }`.trim()}
                        >
                          {valueScoreLabel}
                        </span>
                      )}
                    </div>
                    <dl>
                      {product.valueInsight.twelveMonthChangePercent !== undefined && (
                        <div>
                          <dt>12 mån värde</dt>
                          <dd>{formatPercentChange(product.valueInsight.twelveMonthChangePercent)}</dd>
                        </div>
                      )}
                      {product.valueInsight.fiveYearChangePercent !== undefined && (
                        <div>
                          <dt>5 år värde</dt>
                          <dd>{formatPercentChange(product.valueInsight.fiveYearChangePercent)}</dd>
                        </div>
                      )}
                      {product.valueInsight.averageMarketPrice !== undefined && (
                        <div>
                          <dt>Marknadspris</dt>
                          <dd>{formatPrice(product.valueInsight.averageMarketPrice)}</dd>
                        </div>
                      )}
                      {product.valueInsight.benchmarkPrice !== undefined && (
                        <div>
                          <dt>Benchmark</dt>
                          <dd>{formatPrice(product.valueInsight.benchmarkPrice)}</dd>
                        </div>
                      )}
                    </dl>
                    {product.valueInsight.analystNote && (
                      <p className="card__analysis-note">{product.valueInsight.analystNote}</p>
                    )}
                    {product.valueInsight.wineSearcherUrl && (
                      <div className="card__analysis-firecrawl">
                        <h5>{firecrawlHeading}</h5>
                        {!firecrawlEnabled && (
                          <p className="card__analysis-firecrawl-note">
                            Lägg till <code>VITE_FIRECRAWL_API_KEY</code> för att visa automatiska sammanfattningar.
                          </p>
                        )}
                        {firecrawlEnabled && firecrawlScheduled && (!firecrawlSummary || firecrawlSummary.status === 'loading') && (
                          <p className="card__analysis-firecrawl-status">Hämtar analys från Firecrawl…</p>
                        )}
                        {firecrawlEnabled && firecrawlSummary?.status === 'ready' && firecrawlSummary.summary && (
                          <p className="card__analysis-firecrawl-summary">{firecrawlSummary.summary}</p>
                        )}
                        {firecrawlEnabled && firecrawlSummary?.status === 'ready' && !firecrawlSummary.summary && (
                          <p className="card__analysis-firecrawl-note">
                            Firecrawl kunde inte extrahera någon sammanfattning för denna länk.
                          </p>
                        )}
                        {firecrawlEnabled && firecrawlSummary?.status === 'error' && (
                          <p className="card__analysis-firecrawl-error">Firecrawl-fel: {firecrawlSummary.error}</p>
                        )}
                        {firecrawlEnabled && firecrawlUrl && !firecrawlScheduled && !firecrawlSummary && (
                          <p className="card__analysis-firecrawl-note">
                            Firecrawl köar sammanfattningar för de första {FIRECRAWL_TARGET_LIMIT} träffarna. Förfina filtren
                            för att inkludera denna länk.
                          </p>
                        )}
                      </div>
                    )}
                    {product.valueInsight.wineSearcherUrl && (
                      <a
                        className="card__analysis-link"
                        href={product.valueInsight.wineSearcherUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Se detaljer på Wine-Searcher
                      </a>
                    )}
                  </div>
                )}
                {product.usage && <p className="card__usage">Passar till: {product.usage}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default App;
