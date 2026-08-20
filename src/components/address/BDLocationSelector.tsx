import { useState, useMemo, useEffect, useCallback } from "react";
import {
  divisions,
  districts,
  upazilas,
  unions,
  postOffices,
  getDistrictsByDivision,
  getUpazilasByDistrict,
  getUnionsByUpazila,
  getPostOfficesForUpazila,
  type BDDivision,
  type BDDistrict,
  type BDUpazila,
  type BDUnion,
  type BDPostOffice,
} from "@/data/bd-locations";
import type { StructuredLocation } from "@/types/address";
import { ChevronDown, Search, MapPin, Check, Lock } from "lucide-react";

interface BDLocationSelectorProps {
  value: Partial<StructuredLocation>;
  onChange: (loc: Partial<StructuredLocation>) => void;
  showLabels?: boolean;
}

// Debounced search hook
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Searchable Select Field with Bengali + English support ──
function SelectField({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  getKey,
  getLabel,
  getSubLabel,
  getSearchText,
  disabled,
}: {
  items: Array<Record<string, unknown>>;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  getKey: (item: Record<string, unknown>) => string;
  getLabel: (item: Record<string, unknown>) => string;
  getSubLabel?: (item: Record<string, unknown>) => string;
  getSearchText?: (item: Record<string, unknown>) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);

  const filtered = useMemo(() => {
    if (!debouncedSearch) return items;
    const q = debouncedSearch.toLowerCase();
    const qBn = debouncedSearch;
    return items.filter((item) => {
      const en = getLabel(item).toLowerCase();
      const bn = (item.nameBn as string)?.toLowerCase() ?? "";
      const extra = getSearchText?.(item)?.toLowerCase() ?? "";
      return en.includes(q) || bn.includes(q) || bn.includes(qBn) || extra.includes(q);
    });
  }, [items, debouncedSearch, getLabel, getSearchText]);

  const selectedItem = items.find((item) => getKey(item) === value);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 transition-all
          ${disabled
            ? "border-slate-100 bg-slate-50 cursor-not-allowed"
            : open
            ? "border-orange-400 bg-white ring-2 ring-orange-100"
            : value
            ? "border-slate-200 bg-white hover:border-orange-300"
            : "border-slate-200 bg-white hover:border-orange-300"
          }`}
      >
        <div className="flex items-center gap-2 flex-1 text-left min-w-0">
          {disabled ? (
            <Lock className="w-4 h-4 shrink-0 text-slate-300" />
          ) : (
            <MapPin className={`w-4 h-4 shrink-0 ${value ? "text-orange-500" : "text-slate-300"}`} />
          )}
          <span className={`truncate text-sm ${disabled ? "text-slate-300" : value ? "text-slate-800 font-medium" : "text-slate-400"}`}>
            {selectedItem ? getLabel(selectedItem) : placeholder}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {selectedItem && !disabled && (
            <Check className="w-4 h-4 text-orange-500" />
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border-2 border-slate-200 shadow-xl max-h-72 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-orange-400 focus:bg-white"
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 px-1">
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </div>
            </div>
            <div className="overflow-y-auto flex-1 overscroll-contain">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-400">No matches found</div>
              ) : (
                filtered.map((item) => {
                  const key = getKey(item);
                  const label = getLabel(item);
                  const subLabel = getSubLabel?.(item);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        onChange(key);
                        setSearch("");
                        setOpen(false);
                      }}
                      className={`w-full px-4 py-3 text-left text-sm hover:bg-orange-50 transition-colors border-b border-slate-50 last:border-0
                        ${value === key ? "bg-orange-50 text-orange-700 font-medium" : "text-slate-700"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{label}</span>
                        {value === key && <Check className="w-4 h-4 text-orange-500 shrink-0" />}
                      </div>
                      {(item as Record<string, unknown>).nameBn ? (
                        <span className="text-xs text-slate-400">{String((item as Record<string, unknown>).nameBn)}</span>
                      ) : null}
                      {subLabel ? (
                        <span className="text-xs text-slate-400 block mt-0.5">Postal: {subLabel}</span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function BDLocationSelector({ value, onChange, showLabels = true }: BDLocationSelectorProps) {
  const [divisionId, setDivisionId] = useState(value.divisionId ?? "");
  const [districtId, setDistrictId] = useState(value.districtId ?? "");
  const [upazilaId, setUpazilaId] = useState(value.upazilaId ?? "");
  const [unionId, setUnionId] = useState(value.unionId ?? "");
  const [postOfficeIdx, setPostOfficeIdx] = useState("");

  // Sync external value changes (e.g. editing existing address)
  useEffect(() => {
    setDivisionId(value.divisionId ?? "");
    setDistrictId(value.districtId ?? "");
    setUpazilaId(value.upazilaId ?? "");
    setUnionId(value.unionId ?? "");
  }, [value.divisionId, value.districtId, value.upazilaId, value.unionId]);

  // ── Division ──
  const onDivisionChange = useCallback((id: string) => {
    setDivisionId(id);
    // Reset all children
    setDistrictId("");
    setUpazilaId("");
    setUnionId("");
    setPostOfficeIdx("");
    const div = divisions.find((d) => d.id === id);
    if (div) {
      onChange({
        divisionId: div.id,
        divisionEn: div.nameEn,
        divisionBn: div.nameBn,
        districtId: "", districtEn: "", districtBn: "",
        upazilaId: "", upazilaEn: "", upazilaBn: "",
        thanaEn: "", thanaBn: "",
        unionId: "", unionEn: "", unionBn: "",
        postOfficeEn: "", postOfficeBn: "",
        postalCode: "",
      });
    }
  }, [onChange]);

  // ── District ──
  const availableDistricts = useMemo(
    () => divisionId ? getDistrictsByDivision(divisionId) : [],
    [divisionId],
  );

  const onDistrictChange = useCallback((id: string) => {
    setDistrictId(id);
    // Reset children
    setUpazilaId("");
    setUnionId("");
    setPostOfficeIdx("");
    const dist = districts.find((d) => d.id === id);
    const div = divisions.find((d) => d.id === divisionId);
    if (dist && div) {
      onChange({
        divisionId: div.id, divisionEn: div.nameEn, divisionBn: div.nameBn,
        districtId: dist.id, districtEn: dist.nameEn, districtBn: dist.nameBn,
        upazilaId: "", upazilaEn: "", upazilaBn: "",
        thanaEn: "", thanaBn: "",
        unionId: "", unionEn: "", unionBn: "",
        postOfficeEn: "", postOfficeBn: "",
        postalCode: "",
      });
    }
  }, [divisionId, onChange]);

  // ── Upazila ──
  const availableUpazilas = useMemo(
    () => districtId ? getUpazilasByDistrict(districtId) : [],
    [districtId],
  );

  const onUpazilaChange = useCallback((id: string) => {
    setUpazilaId(id);
    // Reset children
    setUnionId("");
    setPostOfficeIdx("");
    const upz = upazilas.find((u) => u.id === id);
    const dist = districts.find((d) => d.id === districtId);
    const div = divisions.find((d) => d.id === divisionId);
    if (upz && dist && div) {
      onChange({
        divisionId: div.id, divisionEn: div.nameEn, divisionBn: div.nameBn,
        districtId: dist.id, districtEn: dist.nameEn, districtBn: dist.nameBn,
        upazilaId: upz.id, upazilaEn: upz.nameEn, upazilaBn: upz.nameBn,
        thanaEn: upz.nameEn, thanaBn: upz.nameBn,
        unionId: "", unionEn: "", unionBn: "",
        postOfficeEn: "", postOfficeBn: "",
        postalCode: "",
      });
    }
  }, [divisionId, districtId, onChange]);

  // ── Union ──
  const availableUnions = useMemo(
    () => upazilaId ? getUnionsByUpazila(upazilaId) : [],
    [upazilaId],
  );

  const onUnionChange = useCallback((id: string) => {
    setUnionId(id);
    setPostOfficeIdx("");
    const unn = unions.find((u) => u.id === id);
    const upz = upazilas.find((u) => u.id === upazilaId);
    const dist = districts.find((d) => d.id === districtId);
    const div = divisions.find((d) => d.id === divisionId);
    if (unn && upz && dist && div) {
      onChange({
        divisionId: div.id, divisionEn: div.nameEn, divisionBn: div.nameBn,
        districtId: dist.id, districtEn: dist.nameEn, districtBn: dist.nameBn,
        upazilaId: upz.id, upazilaEn: upz.nameEn, upazilaBn: upz.nameBn,
        thanaEn: upz.nameEn, thanaBn: upz.nameBn,
        unionId: unn.id, unionEn: unn.nameEn, unionBn: unn.nameBn,
        postOfficeEn: "", postOfficeBn: "",
        postalCode: "",
      });
    }
  }, [divisionId, districtId, upazilaId, onChange]);

  // ── Post Office + Postal Code ──
  const availablePostOffices = useMemo(() => {
    if (!upazilaId || !districtId) return [];
    const dist = districts.find((d) => d.id === districtId);
    const upz = upazilas.find((u) => u.id === upazilaId);
    if (!dist || !upz) return [];
    return getPostOfficesForUpazila(dist.nameEn, upz.nameEn);
  }, [upazilaId, districtId]);

  const onPostOfficeChange = useCallback((idx: string) => {
    setPostOfficeIdx(idx);
    const po = availablePostOffices[parseInt(idx, 10)];
    if (po) {
      const unn = unions.find((u) => u.id === unionId);
      const upz = upazilas.find((u) => u.id === upazilaId);
      const dist = districts.find((d) => d.id === districtId);
      const div = divisions.find((d) => d.id === divisionId);
      if (dist && div) {
        onChange({
          divisionId: div.id, divisionEn: div.nameEn, divisionBn: div.nameBn,
          districtId: dist.id, districtEn: dist.nameEn, districtBn: dist.nameBn,
          upazilaId: upz?.id ?? "", upazilaEn: upz?.nameEn ?? "", upazilaBn: upz?.nameBn ?? "",
          thanaEn: po.thanaEn, thanaBn: po.thanaBn,
          unionId: unn?.id ?? "", unionEn: unn?.nameEn ?? "", unionBn: unn?.nameBn ?? "",
          postOfficeEn: po.subofficeEn, postOfficeBn: po.subofficeBn,
          postalCode: po.postcode,
        });
      }
    }
  }, [availablePostOffices, unionId, upazilaId, districtId, divisionId, onChange]);

  // Auto-select if only one post office
  useEffect(() => {
    if (availablePostOffices.length === 1 && !postOfficeIdx) {
      onPostOfficeChange("0");
    }
  }, [availablePostOffices, postOfficeIdx, onPostOfficeChange]);

  // ── Selected Location Summary ──
  const hasSelection = divisionId && districtId;
  const summaryParts: string[] = [];
  if (value.divisionEn) summaryParts.push(value.divisionEn);
  if (value.districtEn) summaryParts.push(value.districtEn);
  if (value.upazilaEn) summaryParts.push(value.upazilaEn);
  if (value.unionEn) summaryParts.push(value.unionEn);
  if (value.postOfficeEn) summaryParts.push(value.postOfficeEn);
  if (value.postalCode) summaryParts.push(`- ${value.postalCode}`);

  return (
    <div className="space-y-3">
      {/* Country (auto: Bangladesh) */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl bg-green-50 border-2 border-green-200">
        <span className="text-2xl">🇧🇩</span>
        <div>
          <div className="text-sm font-semibold text-slate-800">Bangladesh</div>
          <div className="text-xs text-slate-500">বাংলাদেশ (auto-selected)</div>
        </div>
        <Check className="w-5 h-5 text-green-500 ml-auto" />
      </div>

      {/* Division */}
      <div>
        {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">বিভাগ / Division</label>}
        <SelectField
          items={divisions as unknown as Array<Record<string, unknown>>}
          value={divisionId}
          onChange={onDivisionChange}
          placeholder="বিভাগ নির্বাচন করুন / Select Division"
          searchPlaceholder="Search division... (Bengali or English)"
          getKey={(item) => String(item.id)}
          getLabel={(item) => String(item.nameEn)}
        />
      </div>

      {/* District */}
      <div>
        {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">জেলা / District</label>}
        <SelectField
          items={availableDistricts as unknown as Array<Record<string, unknown>>}
          value={districtId}
          onChange={onDistrictChange}
          placeholder="জেলা নির্বাচন করুন / Select District"
          searchPlaceholder="Search district... (Bengali or English)"
          getKey={(item) => String(item.id)}
          getLabel={(item) => String(item.nameEn)}
          disabled={!divisionId}
        />
      </div>

      {/* Upazila */}
      <div>
        {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">উপজেলা / থানা / Upazila</label>}
        <SelectField
          items={availableUpazilas as unknown as Array<Record<string, unknown>>}
          value={upazilaId}
          onChange={onUpazilaChange}
          placeholder="উপজেলা নির্বাচন করুন / Select Upazila"
          searchPlaceholder="Search upazila... (Bengali or English)"
          getKey={(item) => String(item.id)}
          getLabel={(item) => String(item.nameEn)}
          disabled={!districtId}
        />
      </div>

      {/* Union */}
      <div>
        {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">ইউনিয়ন / Union</label>}
        <SelectField
          items={availableUnions as unknown as Array<Record<string, unknown>>}
          value={unionId}
          onChange={onUnionChange}
          placeholder="ইউনিয়ন নির্বাচন করুন / Select Union"
          searchPlaceholder="Search union... (Bengali or English)"
          getKey={(item) => String(item.id)}
          getLabel={(item) => String(item.nameEn)}
          disabled={!upazilaId}
        />
      </div>

      {/* Post Office + Postal Code */}
      {availablePostOffices.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">পোস্ট অফিস / Post Office</label>}
            <SelectField
              items={availablePostOffices.map((po, idx) => ({ ...po, _idx: idx })) as unknown as Array<Record<string, unknown>>}
              value={postOfficeIdx}
              onChange={onPostOfficeChange}
              placeholder="পোস্ট অফিস নির্বাচন করুন"
              searchPlaceholder="Search post office..."
              getKey={(item) => String(item._idx ?? 0)}
              getLabel={(item) => String(item.subofficeEn)}
              getSubLabel={(item) => String(item.postcode)}
              disabled={!upazilaId}
            />
          </div>
          <div>
            {showLabels && <label className="block text-xs font-semibold text-slate-600 mb-1.5">পোস্ট কোড / Postal</label>}
            <input
              type="text"
              readOnly
              value={value.postalCode ?? ""}
              placeholder="Auto"
              className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 cursor-not-allowed"
            />
          </div>
        </div>
      )}

      {/* Selected Location Summary */}
      {hasSelection && (
        <div className="p-3 rounded-xl bg-orange-50 border-2 border-orange-200">
          <div className="flex items-center gap-2 mb-1.5">
            <MapPin className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-semibold text-orange-700">Selected Location</span>
          </div>
          <div className="text-sm text-slate-700">
            {summaryParts.join(" → ")}
          </div>
        </div>
      )}
    </div>
  );
}
