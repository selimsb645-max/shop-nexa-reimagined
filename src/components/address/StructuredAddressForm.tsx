import { useState, useEffect } from "react";
import { BDLocationSelector } from "./BDLocationSelector";
import type { StructuredLocation, AddressType } from "@/types/address";
import { ADDRESS_TYPE_META, isValidBDPhone, normalizeBDPhone, buildDetailedAddress } from "@/types/address";
import { User, Phone, FileText, MessageSquare, Star, Home as HomeIcon, MapPin } from "lucide-react";

export interface StructuredAddressFormValues {
  label: string;
  addressType: AddressType;
  fullName: string;
  phone: string;
  alternativePhone: string | null;
  location: StructuredLocation;
  house: string;
  road: string;
  block: string | null;
  floor: string | null;
  landmark: string | null;
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

const ALL_ADDRESS_TYPES = Object.keys(ADDRESS_TYPE_META) as AddressType[];

export function StructuredAddressForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel = "Save Address",
}: StructuredAddressFormProps) {
  const [fullName, setFullName] = useState(initialValues?.fullName ?? "");
  const [phone, setPhone] = useState(initialValues?.phone ?? "");
  const [altPhone, setAltPhone] = useState(initialValues?.alternativePhone ?? "");
  const [addressType, setAddressType] = useState<AddressType>(initialValues?.addressType ?? "HOME");
  const [location, setLocation] = useState<Partial<StructuredLocation>>(
    initialValues?.location ?? {},
  );
  const [house, setHouse] = useState(initialValues?.house ?? "");
  const [road, setRoad] = useState(initialValues?.road ?? "");
  const [block, setBlock] = useState(initialValues?.block ?? "");
  const [floor, setFloor] = useState(initialValues?.floor ?? "");
  const [landmark, setLandmark] = useState(initialValues?.landmark ?? "");
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    initialValues?.deliveryInstructions ?? "",
  );
  const [isDefault, setIsDefault] = useState(initialValues?.isDefault ?? false);
  const [label, setLabel] = useState(initialValues?.label ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-set label based on address type
  useEffect(() => {
    const prevLabels = ["Home", "Office", "Other"];
    if (!label || prevLabels.includes(label)) {
      setLabel(ADDRESS_TYPE_META[addressType].labelEn);
    }
  }, [addressType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build detailed address from individual fields
  const detailedAddress = buildDetailedAddress(house, road, block || null, floor || null, landmark || null);

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!fullName.trim()) errs.fullName = "নাম লিখুন / Full name is required";
    if (!phone.trim()) {
      errs.phone = "মোবাইল নম্বর দিন / Phone number is required";
    } else if (!isValidBDPhone(phone)) {
      errs.phone = "সঠিক নম্বর দিন (01XXXXXXXXX) / Invalid phone format";
    }
    if (altPhone.trim() && !isValidBDPhone(altPhone)) {
      errs.altPhone = "সঠিক নম্বর দিন / Invalid alternative phone";
    }
    if (!location.divisionId) errs.division = "বিভাগ নির্বাচন করুন / Select division";
    if (!location.districtId) errs.district = "জেলা নির্বাচন করুন / Select district";
    if (!location.upazilaId) errs.upazila = "উপজেলা নির্বাচন করুন / Select upazila";
    if (!house.trim()) errs.house = "বাড়ি/ফ্ল্যাট নম্বর দিন / House/Flat no. is required";
    if (!road.trim()) errs.road = "রাস্তা দিন / Road is required";
    if (!location.postalCode) errs.postalCode = "পোস্ট অফিস নির্বাচন করুন / Select a post office";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const normalizedPhone = normalizeBDPhone(phone) ?? phone;
    const normalizedAlt = altPhone.trim() ? normalizeBDPhone(altPhone) : null;

    onSubmit({
      label: label || ADDRESS_TYPE_META[addressType].labelEn,
      addressType,
      fullName: fullName.trim(),
      phone: normalizedPhone,
      alternativePhone: normalizedAlt,
      location: location as StructuredLocation,
      house: house.trim(),
      road: road.trim(),
      block: block.trim() || null,
      floor: floor.trim() || null,
      landmark: landmark.trim() || null,
      detailedAddress,
      deliveryInstructions: deliveryInstructions.trim(),
      isDefault,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Address Type Cards */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2">
          "Where should we deliver?" — ঠিকানার ধরন
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_ADDRESS_TYPES.map((type) => {
            const meta = ADDRESS_TYPE_META[type];
            const isSelected = addressType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => setAddressType(type)}
                className={`flex items-center gap-2 px-3 py-3 rounded-xl border-2 transition-all text-left
                  ${isSelected
                    ? "border-orange-400 bg-orange-50 text-orange-700"
                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
              >
                <span className="text-xl shrink-0">{meta.icon}</span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{meta.labelEn}</div>
                  <div className="text-[10px] text-slate-400 truncate">{meta.labelBn}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Customer Info */}
      <div className="space-y-3">
        {/* Full Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">
            পুরো নাম / Full Name <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Selim SB"
              className="w-full pl-9 pr-3 py-3.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
            />
          </div>
          {errors.fullName && <p className="text-xs text-red-500 mt-1">{errors.fullName}</p>}
        </div>

        {/* Phone + Alt Phone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              মোবাইল নম্বর / Phone <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full pl-9 pr-3 py-3.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
            </div>
            {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              বিকল্প নম্বর / Alt Phone <span className="text-slate-400">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                className="w-full pl-9 pr-3 py-3.5 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
            </div>
            {errors.altPhone && <p className="text-xs text-red-500 mt-1">{errors.altPhone}</p>}
          </div>
        </div>
      </div>

      {/* Location Cascading Selector */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-slate-700">আপনার এলাকা নির্বাচন করুন / Select Your Location</span>
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

      {/* Detailed Delivery Address */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <HomeIcon className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-semibold text-slate-700">
            বিস্তারিত ঠিকানা / Detailed Delivery Address
          </span>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          এখানে আপনার বাসা/অফিস/দোকানের সঠিক ঠিকানা লিখুন।
        </p>

        <div className="space-y-3">
          {/* House + Road */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                বাড়ি/ফ্ল্যাট/হোল্ডিং নং <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={house}
                onChange={(e) => setHouse(e.target.value)}
                placeholder="House / Flat / Holding No."
                className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
              {errors.house && <p className="text-xs text-red-500 mt-1">{errors.house}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                রাস্তা/সড়ক/লেন <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={road}
                onChange={(e) => setRoad(e.target.value)}
                placeholder="Road / Street / Lane"
                className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
              {errors.road && <p className="text-xs text-red-500 mt-1">{errors.road}</p>}
            </div>
          </div>

          {/* Block + Floor (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                ব্লক/সেক্টর <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={block}
                onChange={(e) => setBlock(e.target.value)}
                placeholder="Block / Sector"
                className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                ফ্লোর/ইউনিট <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                placeholder="Apartment / Floor / Unit"
                className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
              />
            </div>
          </div>

          {/* Landmark (optional) */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              ল্যান্ডমার্ক / Landmark <span className="text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="Near Central Mosque / Beside City Hospital"
              className="w-full px-3 py-3 rounded-xl border-2 border-slate-200 text-sm focus:outline-none focus:border-orange-400 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Delivery Notes */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1.5">
          ডেলিভারি নোট / Delivery Notes <span className="text-slate-400">(optional)</span>
        </label>
        <div className="relative">
          <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
          <textarea
            value={deliveryInstructions}
            onChange={(e) => setDeliveryInstructions(e.target.value)}
            placeholder="যেমন: গেটের সামনে কল করবেন, ৩য় তলায়, দোকানের পাশের গলি ইত্যাদি।"
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
          Set as default delivery address
        </span>
      </label>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold text-sm shadow-lg shadow-orange-200 hover:shadow-orange-300 transition-shadow"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3.5 rounded-xl border-2 border-slate-200 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
