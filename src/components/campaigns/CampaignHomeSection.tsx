/**
 * AVENTA SHOP — Campaign Home Section (storefront wiring, Prompt 05 §5/§12)
 *
 * The homepage's live campaign strip. Data comes ONLY from
 * `getPublicCampaignHome` — the sanitized server function that
 * lazily advances campaign state on the SERVER clock. The countdown
 * merely *displays* time against the server-provided anchor; the
 * engine, prices and stock remain server-authoritative (§4, §12).
 *
 * Additive component: renders nothing when no campaign is ACTIVE,
 * so the homepage is pixel-identical to before until marketing
 * schedules a campaign. A campaign error can never break the page —
 * the server fn already degrades to an empty payload.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Megaphone, Timer } from "lucide-react";
import { getPublicCampaignHome } from "@/lib/campaigns/campaigns.functions";

function useCountdown(endsAt: number): {
  d: number;
  h: number;
  m: number;
  s: number;
  over: boolean;
} {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const ms = Math.max(0, endsAt - now);
    return {
      d: Math.floor(ms / 86_400_000),
      h: Math.floor((ms % 86_400_000) / 3_600_000),
      m: Math.floor((ms % 3_600_000) / 60_000),
      s: Math.floor((ms % 60_000) / 1000),
      over: ms === 0,
    };
  }, [endsAt, now]);
}

function CountdownChip({ endsAt }: { endsAt: number }) {
  const { d, h, m, s } = useCountdown(endsAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold tracking-wide text-white shadow-sm sm:text-sm"
      suppressHydrationWarning
    >
      <Timer className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {d > 0 ? `${d}d ` : ""}
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

export function CampaignHomeSection() {
  const { data } = useQuery({
    queryKey: ["public-campaign-home"],
    queryFn: () => getPublicCampaignHome(),
    staleTime: 60_000,
    retry: 1,
  });

  const campaign = data?.campaign ?? null;
  const banner = campaign?.banner;

  if (!campaign) return null;

  const body = (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white shadow-lg">
      {banner?.imageUrl ? (
        <img
          src={banner.imageUrl}
          alt={banner.title ?? campaign.name}
          className="absolute inset-0 h-full w-full object-cover opacity-45"
          loading="lazy"
        />
      ) : null}
      <div className="relative flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 shadow-md sm:h-12 sm:w-12">
            <Megaphone className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-red-300 sm:text-base">
              {banner?.title ?? "Live Campaign"}
            </p>
            <h2 className="text-lg font-extrabold leading-tight sm:text-2xl">{campaign.name}</h2>
            {campaign.description ? (
              <p className="mt-0.5 line-clamp-2 max-w-xl text-xs text-slate-200 sm:text-sm">
                {campaign.description}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <CountdownChip endsAt={campaign.endsAt} />
          <Link
            to="/flash-sales"
            className="rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-slate-100 sm:text-sm"
          >
            Shop Deals
          </Link>
        </div>
      </div>
    </div>
  );

  const wrap = banner?.link ? (
    <a href={banner.link} className="block focus:outline-none">
      {body}
    </a>
  ) : (
    body
  );
  return <div className="mt-3 sm:mt-4">{wrap}</div>;
}
