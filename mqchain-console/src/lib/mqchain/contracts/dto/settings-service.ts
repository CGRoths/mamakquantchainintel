export type SettingsUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  hasPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export declare function listSettingsUsers(): Promise<SettingsUser[]>;
export declare function createSettingsUser(input: unknown): Promise<SettingsUser>;
export declare function updateSettingsUserAccess(input: unknown): Promise<SettingsUser>;
