/**
 * AVENTA SHOP — Admin Commission Setup Page
 *
 * Route: /admin/commission-setup
 *
 * One-time setup page to seed all 20 categories and 134 subcategories
 * with approved AVENTA commission rates (50% of Daraz New Rate).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { AdminShell } from "@/components/admin/AdminShell";
import { seedAventaCategories } from "@/lib/seed-categories.functions";

export const Route = createFileRoute("/_authenticated/admin/commission-setup")({
  component: CommissionSetupPage,
});

interface SeedResult {
  categoriesCreated: number;
  subcategoriesCreated: number;
  categoriesUpdated: number;
  subcategoriesUpdated: number;
  errors: string[];
}

function CommissionSetupPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSeed() {
    if (!user) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const idToken = await user.getIdToken();
      const res = (await seedAventaCategories({
        data: { idToken },
      })) as SeedResult;
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-6 text-2xl font-bold">Commission Setup</h1>

        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-2 text-lg font-semibold">AVENTA Commission Configuration</h2>
          <p className="mb-4 text-sm text-gray-600">
            Seeds all 20 approved categories and 134 subcategories with AVENTA commission rates.
            Each rate is exactly 50% of the Daraz New Commission Rate (PK Commission Rates - May
            2026).
          </p>
          <p className="mb-4 text-sm text-gray-600">
            Safe to run multiple times — existing categories are updated, new ones created.
          </p>
          <button
            onClick={handleSeed}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Seeding..." : "Seed Categories & Commissions"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <h2 className="mb-2 text-lg font-semibold text-green-800">Seeding Complete</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                Categories Created: <strong>{result.categoriesCreated}</strong>
              </div>
              <div>
                Categories Updated: <strong>{result.categoriesUpdated}</strong>
              </div>
              <div>
                Subcategories Created: <strong>{result.subcategoriesCreated}</strong>
              </div>
              <div>
                Subcategories Updated: <strong>{result.subcategoriesUpdated}</strong>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-red-700">Errors ({result.errors.length}):</p>
                <ul className="mt-1 text-xs text-red-600">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
