export type UserRow = {
  id: string;
  full_name: string | null;
  platform_role: string;
  active: boolean;
};

export type Company = {
  id: string;
  name: string;
};

export type ApiResponse = {
  success: boolean;
  message: string;
};