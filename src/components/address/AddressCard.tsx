import type { StructuredAddress, AddressType } from "@/types/address";
import { ADDRESS_TYPE_META } from "@/types/address";
import { MapPin, Phone, Star, Pencil, Trash2, Check } from "lucide-react";

interface AddressCardProps {
  address: StructuredAddress;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onSetDefault?: () => void;
  showActions?: boolean;
  compact?: boolean;
}

export function AddressCard({
  address,
  selected,
  onSelect,
  onEdit,
  onDelete,
  onSetDefault,
  showActions = true,
  compact = false,
}: AddressCardProps) {
  const meta = ADDRESS_TYPE_META[address.addressType as AddressType] ?? ADDRESS_TYPE_META.OTHER;
  const loc = address.location;

  const locationText = [
    loc.unionEn && `${loc.unionEn},`,
    loc.upazilaEn,
    loc.postOfficeEn && `- ${loc.postOfficeEn}`,
    `${loc.districtEn} - ${loc.postalCode}`,
    loc.divisionEn,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all cursor-pointer overflow-hidden
        ${
          selected
            ? "border-orange-400 bg-orange-50/30 ring-2 ring-orange-100"
            : "border-slate-200 bg-white hover:border-orange-200"
        }`}
      onClick={onSelect}
    >
      {selected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`p-4 ${compact ? "py-3" : "py-4"}`}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg
            ${address.isDefault ? "bg-orange-100" : "bg-slate-100"}`}
          >
            {meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm truncate">
                {address.fullName}
              </span>
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-medium">
                {meta.labelEn}
              </span>
              {address.isDefault && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold">
                  DEFAULT
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
              <Phone className="w-3 h-3" />
              {address.phone}
              {address.alternativePhone && (
                <span className="text-slate-300">| {address.alternativePhone}</span>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="ml-[52px]">
          {address.villageArea && (
            <div className="text-sm text-slate-700 font-semibold mb-1">{address.villageArea}</div>
          )}
          <div className="text-sm text-slate-600 font-medium mb-1">
            {address.detailedAddress || `${address.house}, ${address.road}`}
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">{locationText}</div>
          <div className="text-xs text-slate-300 mt-0.5">Bangladesh</div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
            {!address.isDefault && onSetDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSetDefault();
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600 transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
                Set Default
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors ml-auto"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
