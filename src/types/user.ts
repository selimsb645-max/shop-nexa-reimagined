export type UserRole = "customer" | "seller" | "admin";

export interface AppUserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}
