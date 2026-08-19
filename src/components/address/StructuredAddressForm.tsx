import { useState, useEffect } from "react";
import { BDLocationSelector } from "./BDLocationSelector";
import type { StructuredLocation, AddressType } from "@/types/address";
import { Home, Building2, MapPin, User, Phone, FileText, MessageSquare, Star } from "lucide-react";

export interface StructuredAddressFormValues {
  label: string;
  addressType: AddressType;
  fullName: string;
  phone: string;
  location: StructuredLocation;
  detailedAddress: string;
  deliveryInstructions: string;
  isDefault: boolean;
}

interface StructuredAddressFormProps {
  initialValues?: Partial<StructuredAddressFormValues>;
  onSubmit: (values: StructuredAddressFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
}

const EMPTY_LOCATION: StructuredLocation = {
  divisionId: "", divisionEn: "", divisionBn: "",
  districtId: "", districtEn: "", districtBn: "",
  upazilaId: "", upazilaEn: "", upazilaBn: "",
  thanaEn: "", thanaBn: "",
  unionId: "", unionEn: "", unionBn: "",
  postOfficeEn: "", postOfficeBn: "",
  postalCode: "",
};

const ADDRESS_TYPES: { value: AddressType; label: string; icon: typeof Home }[] = [
  { value: "HOME", label: "Home", icon: Home },
  { value: "OFFICE", label: "Office", icon: Building2 },
  { value: "OTHER", label: "Other", icon: MapPin },
];

export function StructuredAddressForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save Address",
}: StructuredAddressFormProps) {
  const [fullName, setFullName] = useState(initialValues?.fullName ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [addressType, setAddressType] = useState<AddressType>(initialValues?.addressType ?? "HOME");
  const [location, setLocation] = useState<Partial<StructuredLocation>>(
    initialValues?.location ?? {},
  );
  const [detailedAddress, setDetailedAddress] = useState(initialValues?.detailedAddress ?? "");
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    initialValues?.deliveryInstructions ?? "",
  );
  const [isDefault, setIsDefault] = useState(initialValues?.isDefault ?? false);
  const [label, setLabel] = useState(initialValues?.label ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-set label based on address type
  useEffect(() => {
    if (!label || label === "Home" || label === "Office" || label === "Other") {
      setLabel(addressType.charAt(0) + addressType.slice(1).toLowerCase());
    }
  }, [addressType]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!phone.trim() || phone.trim().length < 6) errs.phone = "Valid phone number is required";
    if (!location.divisionId) errs.division = "Please select a division";
    if (!location.districtId) errs.district = "Please select a district";
    if (!location.upazilaId) errs.upazila = "Please select an upazila";
    if (!detailedAddress.trim()) errs.detailedAddress = "Detailed address is required";
    if (!location.postalCode) errs.postalCode = "Postal code is required (select a post office)";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      label: label || addressType.charAt(0) + addressType.slice(1).toLowerCase(),
      addressType,
      fullName: fullName.trim(),
      phone: phone.trim(),
      location: location as StructuredLocation,
      detailedAddress: detailedAddress.trim(),
      deliveryInstructions: deliveryInstructions.trim(),
      isDefault,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Address Type */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2">Address Type</label>
        <div className="grid grid-cols-3 gap-2">
          {ADDRESS_TYPES.map(({ value, label: lbl, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setAddressType(value)}
              className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all
                ${addressType === value
                  ? "border-orange-400 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs font-medium">{lbl}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Full Name + Phone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Full Name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Selim SB"
              className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
            />
          </div>
          {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mobile Number</label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
            />
          </div>
          {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
        </div>
      </div>

      {/* Location Cascading Selector */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-slate-700">Select Your Location</span>
        </div>
        <BDLocationSelector
          value={location}
          onChange={(loc) => setLocation({ ...location, ...loc })}
        />
        {(errors.division || errors.district || errors.upazila || errors.postalCode) && (
          <div className="mt-2 p-2 rounded-lg bg-red-50 text-xs text-red-500">
            {errors.division || errors.district || errors.upazila || errors.postalCode}
          </div>
        )}
      </div>

      {/* Detailed Address */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Detailed Address <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <FileText className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <textarea
            value={detailedAddress}
            onChange={(e) => setDetailedAddress(e.target.value)}
            placeholder="House / Flat / Road / Block / Building / Landmark. e.g. House 12, Road 5, Near Central Mosque"
            rows={3}
            className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white resize-none"
          />
        </div>
        {errors.detailedAddress && <p className="text-xs text-red-500 mt-1">{errors.detailedAddress}</p>}
      </div>

      {/* Delivery Instructions */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          Delivery Instructions <span className="text-slate-400">(optional)</span>
        </label>
        <div className="relative">
          <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <textarea
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            placeholder="e.g. Please call before delivery"
            rows={2}
            className="w-full pl-9 pr-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white resize-none"
          />
        </div>
      </div>

      {/* Set as Default */}
      <label className="flex items-center gap-2 cursor-pointer">
        <button
          type="button"
          onClick={() => setIsDefault(!isDefault)}
          className={`relative w-11 h-6 rounded-full transition-colors ${isDefault ? "bg-orange-500" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isDefault ? "translate-x-5" : ""}`} />
        </button>
        <span className="text-sm text-slate-600 flex items-center gap-1">
          <Star className="w-3.5 h-3.5 text-slate-400" />
          Set as default address
        </span>
      </label>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold text-sm shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-shadow"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-xl border-2 border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
