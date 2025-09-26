import { useEffect, useMemo, useState } from 'react';
import './styles/App.css';

const FALLBACK_DATA_URL = '/sample-data.json';
const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

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
    const normalised = value.replace(/[^0-9.,]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(normalised);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
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
    usage
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

        if (!cancelled) {
          setProducts(normalised);
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
          if (!cancelled) {
            setProducts(normalisedFallback);
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

const FilterTag = ({ label, onRemove }: { label: string; onRemove?: () => void }) => (
  <button className="filter-tag" type="button" onClick={onRemove} aria-label={`Ta bort filtret ${label}`}>
    <span>{label}</span>
    {onRemove && <span aria-hidden="true">×</span>}
  </button>
);

const App = () => {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { products, loading, error } = useWineProducts(filters);

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

        {error && (
          <div className="results__error" role="alert">
            <strong>Något gick fel:</strong> {error}
          </div>
        )}

        {!loading && filteredProducts.length === 0 && !error && (
          <p className="results__empty">Inga produkter matchade dina filter. Justera och försök igen.</p>
        )}

        <ul className="results__grid">
          {filteredProducts.map((product) => (
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
              {product.usage && <p className="card__usage">Passar till: {product.usage}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default App;
