// pages/auth/callback.tsx
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  useEffect(() => {
    const handleCallback = async () => {
      try {
        addLog('Starting authentication callback...');
        
        // Get the full URL and check for hash or query params
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const queryParams = new URLSearchParams(window.location.search);
        
        addLog(`Hash params: ${JSON.stringify(Object.fromEntries(hashParams))}`);
        addLog(`Query params: ${JSON.stringify(Object.fromEntries(queryParams))}`);

        // Check for tokens in hash (OAuth flow)
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        // Check for error in query params
        const errorParam = queryParams.get('error');
        const errorDescription = queryParams.get('error_description');

        if (errorParam) {
          addLog(`Error in URL: ${errorParam} - ${errorDescription}`);
          setError(errorDescription || errorParam);
          setTimeout(() => router.replace('/auth/login'), 3000);
          return;
        }

        if (accessToken && refreshToken) {
          addLog('Tokens found, setting session...');
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setError) {
            addLog(`Error setting session: ${setError.message}`);
            setError(setError.message);
            setTimeout(() => router.replace('/auth/login'), 3000);
            return;
          }

          addLog('Session set successfully! Redirecting to home...');
          router.replace('/');
          return;
        }

        // If no tokens in URL, check current session
        addLog('No tokens found in URL, checking existing session...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          addLog(`Session error: ${sessionError.message}`);
          setError(sessionError.message);
          setTimeout(() => router.replace('/auth/login'), 3000);
          return;
        }

        if (session) {
          addLog('Existing session found! Redirecting to home...');
          router.replace('/');
        } else {
          addLog('No session found. Redirecting to login...');
          setTimeout(() => router.replace('/auth/login'), 2000);
        }
      } catch (err: any) {
        addLog(`Unexpected error: ${err?.message || err}`);
        setError('An unexpected error occurred');
        setTimeout(() => router.replace('/auth/login'), 3000);
      }
    };

    if (router.isReady) {
      handleCallback();
    }
  }, [router, router.isReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-6">
          {error ? (
            <div>
              <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Error</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <p className="text-sm text-gray-500">Redirecting to login...</p>
            </div>
          ) : (
            <div>
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-gray-600">Signing you in…</p>
            </div>
          )}
        </div>

        {/* Debug Logs */}
        <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-96">
          <div className="mb-2 text-gray-400 font-bold">Debug Logs:</div>
          {logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
          {logs.length === 0 && <div className="text-gray-500">Waiting for logs...</div>}
        </div>
      </div>
    </div>
  );
}
