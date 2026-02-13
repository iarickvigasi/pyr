export interface Guest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: 'en' | 'de';
  dietaryNeeds: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface GuestCreate {
  name: string;
  email?: string | null;
  phone?: string | null;
  language?: 'en' | 'de';
  dietaryNeeds?: string | null;
  source?: string | null;
  tags?: string[];
  notes?: string | null;
}

export interface GuestUpdate {
  name?: string;
  email?: string | null;
  phone?: string | null;
  language?: 'en' | 'de';
  dietaryNeeds?: string | null;
  source?: string | null;
  tags?: string[];
  notes?: string | null;
}
