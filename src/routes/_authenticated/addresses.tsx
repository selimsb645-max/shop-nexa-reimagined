import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin, Plus, X } from "lucide-react";
import { ServicePageLayout } from "@/components/common/ServicePageLayout";
import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/i18n/I18nContext";
import {
  listStructuredAddresses,
  saveStructuredAddress,
  deleteStructuredAddress,
  setDefaultStructuredAddress,
} from "@/services/firebase/structuredAddresses";
import { AddressCard } from "@/components/address/AddressCard";
import {
  StructuredAddressForm,
  type StructuredAddressFormValues,
} from "@/components/address/StructuredAddressForm";
import type { StructuredAddress } from "@/types/address";

export const Route = createFileRoute("/_authenticated/addresses")({
  component: AddressesPage,
});

function AddressesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StructuredAddress | null>(null);

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["structured-addresses", user?.uid],
    queryFn: () => listStructuredAddresses(user!.uid),
    enabled: !!user?.uid,
  });

  const saveMutation = useMutation({
    mutationFn: (values: StructuredAddressFormValues) =>
      saveStructuredAddress(
        user!.uid,
        {
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
        },
        editing?.id,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["structured-addresses"] });
      toast.success(editing ? "Address updated" : "Address saved");
      setShowForm(false);
      setEditing(null);
    },
    onError: (err: Error) => toast.error("Failed to save: " + err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStructuredAddress(user!.uid, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["structured-addresses"] });
      toast.success(t("addresses.addressDeleted"));
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) => setDefaultStructuredAddress(user!.uid, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["structured-addresses"] });
      toast.success(t("addresses.defaultUpdated"));
    },
  });

  return (
    <ServicePageLayout title={t("addresses.title")} subtitle={t("addresses.subtitle")}>
      <div className="max-w-2xl mx-auto px-4 pb-24 space-y-4">
        {!showForm && (
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-orange-300 text-orange-600 font-semibold text-sm hover:bg-orange-50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            {t("addresses.addNew")}
          </button>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-orange-500" />
                {editing ? "Edit Address" : "New Address"}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <StructuredAddressForm
              initialValues={
                editing
                  ? {
                      label: editing.label,
                      addressType: editing.addressType,
                      fullName: editing.fullName,
                      phone: editing.phone,
                      alternativePhone: editing.alternativePhone,
                      location: editing.location,
                      house: editing.house,
                      road: editing.road,
                      block: editing.block,
                      floor: editing.floor,
                      landmark: editing.landmark,
                      deliveryInstructions: editing.deliveryInstructions,
                      isDefault: editing.isDefault,
                    }
                  : undefined
              }
              onSubmit={(values) => saveMutation.mutate(values)}
              onCancel={() => {
                setShowForm(false);
                setEditing(null);
              }}
              submitLabel={editing ? "Update Address" : "Save Address"}
            />
          </div>
        )}

        {isLoading && !addresses.length ? (
          <div className="text-center py-12 text-slate-400 text-sm">{t("addresses.loading")}</div>
        ) : addresses.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <MapPin className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">{t("addresses.empty")} yet</p>
            <p className="text-slate-300 text-xs mt-1">{t("addresses.addFirst")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {addresses.map((addr) => (
              <AddressCard
                key={addr.id}
                address={addr}
                onEdit={() => {
                  setEditing(addr);
                  setShowForm(true);
                }}
                onDelete={() => deleteMutation.mutate(addr.id)}
                onSetDefault={() => defaultMutation.mutate(addr.id)}
              />
            ))}
          </div>
        )}
      </div>
    </ServicePageLayout>
  );
}
