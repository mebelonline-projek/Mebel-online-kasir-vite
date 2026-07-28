export type UserRole = "OWNER" | "KARYAWAN" | "GUDANG";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
}

export interface ActionState<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface NavItem {
  title: string;
  href: string;
  roles?: UserRole[];
  ownerOnly?: boolean;
  hideForGudang?: boolean;
}
