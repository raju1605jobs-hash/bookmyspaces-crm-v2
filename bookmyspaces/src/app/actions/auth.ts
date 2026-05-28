'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function login(formData: FormData): Promise<void> {
  const supabase = createSupabaseServerClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect('/error');
  }

  redirect('/');
}

export async function logout(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
