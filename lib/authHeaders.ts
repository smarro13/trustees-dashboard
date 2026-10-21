import { supabase } from './supabaseClient';

/** JSON request headers carrying the current user's access token, for API routes that check the caller. */
export const authJsonHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};
