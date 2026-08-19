import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  divisions,
  districts,
  upazilas,
  unions,
  postOffices,
  getDatasetSummary,
} from "@/data/bd-locations";
import { validateLocationData } from "@/lib/locationValidation";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { Database, Search, AlertCircle, CheckCircle2, MapPin, Globe, Building, Layers } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/locations")({
  component: AdminLocationsPage,
  head: () => ({ meta: [{ title: "Location Master — Admin" }] }),
});

const TYPE_ICONS = {
  divisions: Globe,
  districts: Building,
  upazilas: Layers,
  unions: MapPin,
  postOffices: Building,
};

const TYPE_LABELS = {
  divisions: "Divisions",
  districts: "Districts",
  upazilas: "Upazilas",
  unions: "Unions",
  postOffices: "Post Offices",
};

function AdminLocationsPage() {
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState<string>("divisions");
  const [validationRan, setValidationRan] = useState(false);

  const summary = getDatasetSummary();
  const validation = useMemo(() => validationRan ? validateLocationData() : null, [validationRan]);

  // Build the active dataset based on selected type
  const activeData = useMemo(() => {
    const dataMap: Record<string, Array<Record<string, unknown>>> = {
      divisions: divisions as unknown as Array<Record<string, unknown>>,
      districts: districts as unknown as Array<Record<string, unknown>>,
      upazilas: upazilas as unknown as Array<Record<string, unknown>>,
      unions: unions as unknown as Array<Record<string, unknown>>,
      postOffices: postOffices as unknown as Array<Record<string, unknown>>,
    };
    return dataMap[activeType] ?? [];
  }, [activeType]);

  const filtered = useMemo(() => {
    if (!search) return activeData.slice(0, 100);
    const q = search.toLowerCase();
    return activeData
      .filter((item) =>
        String(item.nameEn ?? item.subofficeEn ?? "").toLowerCase().includes(q) ||
        String(item.nameBn ?? item.subofficeBn ?? "").toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [activeData, search]);

  const typeKeys = Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>;

  return (
    <ServicePageLayout title="Location Master" >
      <div className="max-w-4xl mx-auto px-4 pb-24 space-y-5">
        {/* Dataset Summary */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-slate-800">Dataset Summary</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {typeKeys.map((key) => {
              const Icon = TYPE_ICONS[key];
              return (
                <div key={key} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <Icon className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <div className="text-lg font-bold text-slate-800">
                      {summary[key as keyof typeof summary]}
                    </div>
                    <div className="text-xs text-slate-400">{TYPE_LABELS[key]}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Version: {summary.version} · Source: {summary.source}
          </div>
        </div>

        {/* Validation */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800">Data Validation</h3>
            <button
              onClick={() => setValidationRan(true)}
              className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
            >
              Run Validation
            </button>
          </div>
          {validation && (
            <div className="space-y-2">
              <div className={`flex items-center gap-2 p-3 rounded-xl ${validation.passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {validation.passed ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm font-medium">
                  {validation.passed ? "All checks passed" : `${validation.errors.length} errors found`}
                </span>
                <span className="text-xs text-slate-400 ml-auto">{validation.warnings.length} warnings</span>
              </div>
              {validation.errors.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {validation.errors.slice(0, 20).map((err, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-red-600 p-2 rounded-lg bg-red-50">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-mono">{err.type}:{err.id}</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {validation.warnings.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {validation.warnings.slice(0, 20).map((w, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-amber-600 p-2 rounded-lg bg-amber-50">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="font-mono">{w.type}:{w.id}</span>
                      <span>{w.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Location Browser */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-orange-500" />
            <h3 className="font-bold text-slate-800">Browse Locations</h3>
          </div>

          {/* Type Tabs */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {typeKeys.map((key) => (
              <button
                key={key}
                onClick={() => { setActiveType(key); setSearch(""); }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all
                  ${activeType === key
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
              >
                {TYPE_LABELS[key]} ({summary[key as keyof typeof summary]})
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name (English or Bengali)..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-orange-400"
            />
          </div>

          {/* Results */}
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {filtered.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 border border-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {String(item.nameEn ?? item.subofficeEn ?? "—")}
                  </div>
                  <div className="text-xs text-slate-400">
                    {String(item.nameBn ?? item.subofficeBn ?? "")}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {item.postcode ? <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{String(item.postcode)}</span> : null}
                  {item.divisionId ? <span className="text-slate-300">Div: {String(item.divisionId)}</span> : null}
                  {item.districtId ? <span className="text-slate-300">Dist: {String(item.districtId)}</span> : null}
                  {item.upazilaId ? <span className="text-slate-300">Upz: {String(item.upazilaId)}</span> : null}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">No results found</div>
            )}
          </div>
          {!search && activeData.length > 100 && (
            <div className="text-xs text-slate-400 text-center mt-2">
              Showing first 100 of {activeData.length} records. Use search to find specific locations.
            </div>
          )}
        </div>
      </div>
    </ServicePageLayout>
  );
}
