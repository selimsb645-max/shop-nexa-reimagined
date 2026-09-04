import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  listStructuredAddresses,
  saveStructuredAddress,
} from "@/services/firebase/structuredAddresses";
import { AddressCard } from "@/components/address/AddressCard";
import {
  StructuredAddressForm,
  type StructuredAddressFormValues,
} from "@/components/address/StructuredAddressForm";
import type { StructuredAddress, DeliveryAddressSnapshot } from "@/types/address";
import { toDeliverySnapshot } from "@/types/address";
import { Plus, X, MapPin, ChevronRight } from "lucide-react";

interface CheckoutAddressSelectorProps {
  onAddressSelected: (snapshot: DeliveryAddressSnapshot | null) => void;
  selectedAddressId: string;
  setSelectedAddressId: (id: string) => void;
}

export function CheckoutAddressSelector({
  onAddressSelected,
  selectedAddressId,
  setSelectedAddressId,
}: CheckoutAddressSelectorProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showSavedList, setShowSavedList] = useState(true);

  const { data: addresses = [] } = useQuery({
    queryKey: ["structured-addresses", user?.uid],
    queryFn: () => listStructuredAddresses(user!.uid),
    enabled: !!user?.uid,
  });

  const selected = addresses.find((a) => a.id === selectedAddressId);

  useEffect(() => {
    if (addresses.length > 0 && !selectedAddressId) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      setSelectedAddressId(def.id);
    }
  }, [addresses, selectedAddressId, setSelectedAddressId]);

  useEffect(() => {
    if (selected) {
      onAddressSelected(toDeliverySnapshot(selected));
    } else {
      onAddressSelected(null);
    }
  }, [selected, onAddressSelected]);

  const saveMutation = useMutation({
    mutationFn: (values: StructuredAddressFormValues) =>
      saveStructuredAddress(user!.uid, {
        label: values.label,
        addressType: values.addressType,
        fullName: values.fullName,
        phone: values.phone,
        alternativePhone: values.alternativePhone,
        location: values.location,
        house: values.house,
        road: values.road,
        block: values.block,
        floor: values.floor,
        landmark: values.landmark,
        villageArea: values.villageArea,
        detailedAddress: values.detailedAddress,
        deliveryInstructions: values.deliveryInstructions,
        latitude: null,
        longitude: null,
        isDefault: values.isDefault,
      }),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["structured-addresses"] });
      toast.success("Address saved");
      setShowForm(false);
      setSelectedAddressId(id);
    },
    onError: (err: Error) => toast.error("Failed: " + err.message),
  });

  if (selected && !showSavedList && !showForm) {
    const loc = selected.location;
    return (
      <div className="space-y-3">
        <div className="bg-orange-50/50 rounded-2xl border-2 border-orange-200 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-orange-500" />
              <div>
                <div className="font-semibold text-slate-800 text-sm">{selected.fullName}</div>
                <div className="text-xs text-slate-500">{selected.phone}</div>
              </div>
            </div>
            <button
              onClick={() => setShowSavedList(true)}
              className="text-xs text-orange-600 font-medium flex items-center gap-1"
            >
              Change <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2 pt-2 border-t border-orange-100 text-sm text-slate-600">
            {selected.detailedAddress}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {loc.unionEn}, {loc.upazilaEn} - {loc.postalCode}, {loc.districtEn}, {loc.divisionEn}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showForm && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-bold text-slate-800 text-sm">New Delivery Address</h4>
            <button
              onClick={() => setShowForm(false)}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <StructuredAddressForm
            onSubmit={(values) => saveMutation.mutate(values)}
            onCancel={() => setShowForm(false)}
            submitLabel="Save & Use This Address"
          />
        </div>
      )}

      {!showForm && (
        <>
          {addresses.length > 0 && showSavedList && (
            <div className="space-y-3">
              {addresses.map((addr) => (
                <AddressCard
                  key={addr.id}
                  address={addr}
                  selected={addr.id === selectedAddressId}
                  onSelect={() => {
                    setSelectedAddressId(addr.id);
                    setShowSavedList(false);
                  }}
                  showActions={false}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-orange-300 text-orange-600 font-semibold text-sm hover:bg-orange-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add New Address
          </button>
        </>
      )}
    </div>
  );
}
