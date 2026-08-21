/**
 * Client-side verification service.
 *
 * Calls the server functions that handle OTP generation and verification.
 * The client NEVER sees the OTP (except in mock/dev mode).
 */

import { requestOtpFn, verifyOtpFn } from "@/lib/verification.functions";

export interface RequestOtpInput {
  idToken: string;
  phoneNumber: string;
  cartItems: Array<{ productId: string; quantity: number }>;
  orderTotal: number;
  itemCount: number;
  deliveryLocation: string;
}

export interface RequestOtpOutput {
  sessionId: string;
  expiresAt: number;
  resendAvailableAt: number;
  remainingResends: number;
  mockOtp?: string;
}

export interface VerifyOtpInput {
  idToken: string;
  sessionId: string;
  otp: string;
}

export interface VerifyOtpOutput {
  success: boolean;
  message: string;
  remainingAttempts: number;
  verified: boolean;
}

export async function requestOtp(input: RequestOtpInput): Promise<RequestOtpOutput> {
  const result = await requestOtpFn({ data: input });
  return result as RequestOtpOutput;
}

export async function verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpOutput> {
  const result = await verifyOtpFn({ data: input });
  return result as VerifyOtpOutput;
}

/** Mask phone number for display: 01******789 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  const prefix = digits.slice(0, 2);
  const suffix = digits.slice(-3);
  const masked = "*".repeat(Math.max(digits.length - 5, 4));
  return `${prefix}${masked}${suffix}`;
}
