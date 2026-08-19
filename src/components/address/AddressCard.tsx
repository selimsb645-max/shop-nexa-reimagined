import type { StructuredAddress } from "@/types/address";
import { Home, Building2, MapPin, Phone, Star, Pencil, Trash2, Check } from "lucide-react";

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

const TYPE_ICONS = {
  HOME: Home,
  OFFICE: Building2,
  OTHER: MapPin,
} as const;

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
  const Icon = TYPE_ICONS[address.addressType] ?? MapPin;
  const loc = address.location;

  const locationText = [
    loc.unionEn && `${loc.unionEn},`,
    loc.upazilaEn,
    loc.postOfficeEn && `- ${loc.postOfficeEn}`,
    `${loc.districtEn} - ${loc.postalCode}`,
    loc.divisionEn,
  ].filter(Boolean).join(" ");

  return (
    <div
      className={`relative rounded-2xl border-2 transition-all cursor-pointer overflow-hidden
        ${selected
          ? "border-orange-400 bg-orange-50/30 ring-2 ring-orange-100"
          : "border-slate-200 bg-white hover:border-orange-200"
        }`}
      onClick={onSelect}
    >
      {/* Selected indicator */}
      {selected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`p-4 ${compact ? "py-3" : "py-4"}`}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
            ${address.isDefault ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-500"}`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm truncate">
                {address.fullName}
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
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="pl-13 ml-[52px]">
          <div className="text-sm text-slate-600 font-medium mb-1">
            {address.detailedAddress}
          </div>
          <div className="text-xs text-slate-400 leading-relaxed">
            {locationText}
          </div>
          <div className="text-xs text-slate-300 mt-0.5">Bangladesh</div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
            {!address.isDefault && onSetDefault && (
              <button
                onClick={(e) => { e.stopPropagation(); onSetDefault(); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-orange-600 transition-colors"
              >
                <Star className="w-3.5 h-3.5" />
                Set Default
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors ml-auto"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
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
