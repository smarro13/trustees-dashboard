// pages/auth/callback.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // Exchange the code for a session
    const handleCallback = async () => {
      // The exchangeCodeForSession happens automatically with Supabase
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Auth error:', error);
        router.replace('/auth/login?error=authentication_failed');
        return;
      }

      if (session) {
        // Successfully authenticated
        const redirectTo = router.query.redirect as string || '/';
        router.replace(redirectTo);
      } else {
        router.replace('/auth/login');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">Signing you in…</p>
      </div>
    </div>
  );
}
