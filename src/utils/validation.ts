import { z } from "zod";

export const emailSchema = z.string().trim().email("Enter a valid email address").max(255);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a number");

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(50, "Name must be less than 50 characters");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const profileSchema = z.object({ displayName: displayNameSchema });
export type ProfileValues = z.infer<typeof profileSchema>;

export const sellerApplicationSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is required").max(60),
  description: z.string().trim().min(20, "Please describe your shop (min 20 characters)").max(1000),
  phone: z.string().trim().min(6, "Enter a valid phone").max(30),
  addressLine: z.string().trim().min(3, "Address is required").max(200),
  city: z.string().trim().min(2, "City is required").max(80),
  country: z.string().trim().min(2, "Country is required").max(80),
});
export type SellerApplicationValues = z.infer<typeof sellerApplicationSchema>;

export const sellerSettingsSchema = z.object({
  shopName: z.string().trim().min(2).max(60),
  description: z.string().trim().min(0).max(1000),
  phone: z.string().trim().min(6).max(30),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
});
export type SellerSettingsValues = z.infer<typeof sellerSettingsSchema>;

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const productSchema = z.object({
  title: z.string().trim().min(2, "Title required").max(140),
  slug: z
    .string()
    .trim()
    .min(2, "Slug required")
    .max(80)
    .regex(slugRegex, "Use lowercase letters, numbers and dashes"),
  description: z.string().trim().min(10, "Description too short").max(4000),
  price: z.coerce.number().min(0.01, "Price must be greater than 0").max(1_000_000),
  compareAtPrice: z
    .union([z.coerce.number().min(0).max(1_000_000), z.literal(""), z.null()])
    .optional(),
  categoryId: z.string().min(1, "Select a category"),
  categorySlug: z.string().min(1),
  subcategoryId: z.string().optional().nullable(),
  subcategorySlug: z.string().optional().nullable(),
  stock: z.coerce.number().int().min(0, "Stock cannot be negative").max(1_000_000),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  tags: z.string().max(400).optional().or(z.literal("")),
  colors: z.string().max(400).optional().or(z.literal("")),
  sizes: z.string().max(400).optional().or(z.literal("")),
  featured: z.boolean().optional(),
  status: z.enum(["draft", "published", "archived"]),
});
export type ProductFormValues = z.infer<typeof productSchema>;

