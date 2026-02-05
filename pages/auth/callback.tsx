// pages/auth/callback.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Exchange the code for a session
    const handleCallback = async () => {
      // Check if we have a code in the URL (from magic link)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        // Set the session from the tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error('Auth error:', error);
          router.replace('/auth/login?error=authentication_failed');
          return;
        }

        // Successfully authenticated
        router.replace('/');
      } else {
        // No tokens found, check if already has session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth error:', error);
          router.replace('/auth/login?error=authentication_failed');
          return;
        }

        if (session) {
          // Already authenticated
          router.replace('/');
        } else {
          // No session, redirect to login
          router.replace('/auth/login');
        }
      }
    };

    // Only run when router is ready
    if (router.isReady) {
      handleCallback();
    }
  }, [router, router.isReady]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Signing you in…</p>
      </div>
    </div>
  );
}
