import { CURRENCY_CODES, PRICE_BASIS_LABELS } from "@/lib/pricing/constants";
import { emptyCatalog } from "@/lib/pricing/defaults";
import { buildPriceSheet, fromPrice } from "@/lib/pricing/engine";
import { formatMoney } from "@/lib/pricing/money";
import type {
  CurrencyCode,
  CurrencySettings,
  DisplayMode,
  PackageCommercial,
  Promotion,
  Season,
} from "@/lib/pricing/types";

const AUDIENCE: Readonly<Record<CurrencyCode, string>> = { USD: "International visitors", KES: "Visitors in Kenya" };
const SHORT_NAME: Readonly<Record<CurrencyCode, string>> = { USD: "dollar", KES: "shilling" };

/** The public "From" price for each audience, computed with the same engine as the website. */
export default function PricePreview({
  slug,
  commercial,
  visible,
  display,
  currency,
  seasons,
  promotions,
  today,
}: {
  slug: string;
  commercial: PackageCommercial | null;
  visible: boolean;
  display: DisplayMode;
  currency: CurrencySettings | null;
  seasons: Season[];
  promotions: Promotion[];
  today: string;
}) {
  if (!visible) return <p className="adm-hint">This package is hidden, so visitors won&apos;t see it.</p>;
  if (display === "enquire") {
    return (
      <div className="adm-preview" data-testid="price-preview">
        <div className="adm-preview-row">
          <span className="adm-preview-label">All visitors</span>
          <span className="adm-preview-price">Chat with a Bueno Leisure agent</span>
        </div>
      </div>
    );
  }
  const sheet =
    commercial === null
      ? null
      : buildPriceSheet({ slug, pkg: commercial, catalog: { ...emptyCatalog(), currency, seasons, promotions }, today });
  if (sheet === null) return <p className="adm-hint">Enter valid prices to see a preview.</p>;

  const available = CURRENCY_CODES.filter((code) => sheet.currencies[code] !== undefined);
  return (
    <div className="adm-preview" data-testid="price-preview">
      {CURRENCY_CODES.map((code) => {
        const price = fromPrice(sheet, code);
        const fallback = available.find((other) => other !== code);
        return (
          <div key={code} className="adm-preview-row">
            <span className="adm-preview-label">{AUDIENCE[code]}</span>
            {price === null ? (
              <span className="adm-preview-price">
                {fallback === undefined ? "Not shown" : `Sees the ${SHORT_NAME[fallback]} price`}
              </span>
            ) : (
              <span className="adm-preview-price">
                {sheet.promotion !== null && price.original !== null && (
                  <span className="adm-preview-badge">{sheet.promotion.label}</span>
                )}
                {price.original !== null && <span className="adm-money-was">{formatMoney(price.original, code)}</span>}
                <span>
                  From {formatMoney(price.amount, code)}
                  {sheet.basis === null ? "" : ` ${PRICE_BASIS_LABELS[sheet.basis]}`}
                </span>
              </span>
            )}
          </div>
        );
      })}
      {currency === null && <p className="adm-preview-note">Shilling conversions stay hidden until the exchange rate is set.</p>}
    </div>
  );
}
