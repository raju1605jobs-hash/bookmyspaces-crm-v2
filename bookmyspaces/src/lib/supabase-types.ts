import type { CookieOptions } from '@supabase/ssr';

export interface CookieItem {
  name: string;
  value: string;
  options?: CookieOptions;
}
