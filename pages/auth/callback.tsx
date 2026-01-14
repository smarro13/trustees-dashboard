import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      // Get the code from the URL
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Error during auth callback:', error);
        router.push('/auth/login?error=authentication_failed');
        return;
      }

      if (data.session) {
        // Successfully authenticated, redirect to meetings page
        router.push('/meeting');
      } else {
        // No session, redirect back to login
        router.push('/auth/login');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}
