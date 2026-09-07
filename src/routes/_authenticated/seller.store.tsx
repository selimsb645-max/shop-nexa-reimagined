/**
 * AVENTA SHOP — Seller Store Page
 *
 * Route: /seller/store
 * Reuses existing infrastructure:
 * - SellerProfile type + useSellerProfile hook
 * - updateSellerProfile (sellers service)
 * - uploadShopLogo (storage service)
 * - SellerGate for auth + seller authorization
 *
 * Shows: Store profile + store preview + edit form
 * Store URL: based on existing shopSlug
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { toast } from "sonner";
import {
  Store,
  ImageUp,
  Loader,
  ExternalLink,
  CheckCircle2,
  MapPin,
  Phone,
  Globe,
  Star,
  Package,
  Users,
} from "lucide-react";
import { SellerGate } from "@/components/seller/SellerGate";
import { useAuth } from "@/context/AuthContext";
import { updateSellerProfile } from "@/services/firebase/sellers";
import { uploadShopLogo } from "@/services/firebase/storage";
import { SELLER_STATUS_CONFIG } from "@/types/seller";
import type { SellerProfile } from "@/types/seller";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/_authenticated/seller/store")({
  ssr: false,
  component: () => <SellerGate>{(profile) => <StorePage profile={profile} />}</SellerGate>,
  head: () => ({ meta: [{ title: "Store — AVENTA SHOP Seller" }] }),
});

function StorePage({ profile }: { profile: SellerProfile }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [shopName, setShopName] = useState(profile.shopName);
  const [description, setDescription] = useState(profile.description);
  const [phone, setPhone] = useState(profile.phone);
  const [addressLine, setAddressLine] = useState(profile.addressLine);
  const [city, setCity] = useState(profile.city);
  const [area, setArea] = useState(profile.area ?? "");
  const [country, setCountry] = useState(profile.country);
  const [logoUrl, setLogoUrl] = useState<string | null>(profile.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusConfig = SELLER_STATUS_CONFIG[profile.status] ?? SELLER_STATUS_CONFIG.draft;
  const storeUrl = `/store/${profile.shopSlug}`;

  const onLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setUploading(true);
    try {
      const url = await uploadShopLogo(user.uid, f);
      setLogoUrl(url);
      await updateSellerProfile(user.uid, { logoUrl: url });
      toast.success("Store logo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSave = async () => {
    if (!shopName.trim() || shopName.trim().length < 2) {
      toast.error("Shop name must be at least 2 characters");
      return;
    }
    if (!phone.trim() || phone.trim().length < 6) {
      toast.error("Valid phone number required");
      return;
    }
    setSaving(true);
    try {
      await updateSellerProfile(profile.uid, {
        shopName: shopName.trim(),
        description: description.trim(),
        phone: phone.trim(),
        addressLine: addressLine.trim(),
        city: city.trim(),
        area: area.trim() || null,
        country: country.trim(),
      });
      toast.success("Store profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save store");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    shopName !== profile.shopName ||
    description !== profile.description ||
    phone !== profile.phone ||
    addressLine !== profile.addressLine ||
    city !== profile.city ||
    area !== (profile.area ?? "") ||
    country !== profile.country;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">Store</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your store profile and appearance</p>
      </div>

      {/* Store Status + URL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <span
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ backgroundColor: statusConfig.bgColor }}
          >
            <span className="text-lg">{statusConfig.icon}</span>
          </span>
          <div>
            <div className="text-xs font-medium text-slate-500">Store Status</div>
            <div className="text-sm font-bold" style={{ color: statusConfig.color }}>
              {statusConfig.label}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-100">
            <ExternalLink className="w-5 h-5 text-slate-500" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-500">Store URL</div>
            <Link
              to={storeUrl as string}
              className="text-sm font-medium text-[#f57224] truncate hover:underline"
            >
              {storeUrl}
            </Link>
          </div>
        </div>
      </div>

      {/* Store Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-bold text-[#0f172a]">Store Preview</h2>
          <p className="text-xs text-slate-400 mt-0.5">How customers see your store</p>
        </div>
        <div className="p-4">
          {/* Banner area */}
          <div className="h-24 rounded-lg bg-gradient-to-r from-[#0f172a] to-[#1e293b] mb-4 relative">
            {logoUrl && (
              <div className="absolute -bottom-6 left-4">
                <div className="w-16 h-16 rounded-xl bg-white border-2 border-white shadow-md overflow-hidden">
                  <img src={logoUrl} alt="Store logo" className="w-full h-full object-cover" />
                </div>
              </div>
            )}
          </div>
          <div className={`flex items-start justify-between ${logoUrl ? "mt-8" : "mt-2"}`}>
            <div>
              <h3 className="text-lg font-bold text-[#0f172a]">{shopName || "Your Store Name"}</h3>
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                {description || "No description yet"}
              </p>
            </div>
            {profile.verified && (
              <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
          {/* Store stats */}
          <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" /> {profile.totalProducts} products
            </span>
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> {profile.followers} followers
            </span>
            {profile.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />{" "}
                {profile.rating.toFixed(1)} ({profile.ratingCount})
              </span>
            )}
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> {city || "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h2 className="text-sm font-bold text-[#0f172a] mb-4">Edit Store Profile</h2>

        {/* Logo upload */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {logoUrl ? (
              <img src={logoUrl} alt="Store logo" className="h-full w-full object-cover" />
            ) : (
              <Store className="h-7 w-7 text-slate-300" />
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              {uploading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <ImageUp className="w-4 h-4" />
              )}
              Change logo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onLogo}
            />
            <p className="text-xs text-slate-400 mt-1">Max 5MB · PNG, JPG</p>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Shop Name</label>
            <input
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Your shop name"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell customers about your store..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors resize-none"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Contact phone"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Address Line</label>
            <input
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder="Full address"
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Area</label>
              <input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="Area (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#f57224] transition-colors"
              />
            </div>
          </div>

          <button
            onClick={onSave}
            disabled={saving || !hasChanges}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#f57224] px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
