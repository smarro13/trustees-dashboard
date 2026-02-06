// pages/auth/callback.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if user is authenticated
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          // User is authenticated, redirect to home
          router.replace('/');
        } else {
          // No session, redirect to login
          router.replace('/auth/login');
        }
      } catch (err) {
        // On error, redirect to login
        router.replace('/auth/login');
      }
    };

    if (router.isReady) {
      handleCallback();
    }
  }, [router, router.isReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mb-4"></div>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  );
}
