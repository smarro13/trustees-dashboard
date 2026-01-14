import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (err) throw err;

      setSent(true);
      setEmail('');
    } catch {
      setError('Unable to send access link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        {/* Logo/Icon Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">
            Welcome Back
          </h1>
          <p className="text-gray-600">
            Access the Aldwinians RUFC dashboard
          </p>
        </div>

        {/* Form Section */}
        <form className="mt-8 space-y-6 bg-white rounded-lg shadow-sm border border-gray-100 p-8" onSubmit={login}>
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
              disabled={loading || sent}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-500"
            />
          </div>

          {/* Error State */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 animate-in slide-in-from-top">
              <div className="flex items-start">
                <span className="text-xl mr-3">⚠️</span>
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Success State */}
          {sent && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 animate-in slide-in-from-top">
              <div className="flex items-start">
                <span className="text-xl mr-3">✓</span>
                <div>
                  <p className="text-sm font-semibold text-green-900 mb-1">Check your email!</p>
                  <p className="text-sm text-green-800">
                    If your email is registered, you'll receive an access link shortly. Don't forget to check your spam folder.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || sent}
            className="w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </span>
            ) : sent ? (
              '✓ Link sent!'
            ) : (
              'Send access link'
            )}
          </button>

          {/* Helper Text */}
          <p className="text-xs text-gray-500 text-center">
            This is a secure area. We'll send a magic link to your email.
          </p>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-600">
          Questions? Contact the Management Team<a href="mailto:info@aldwinians.co.uk" className="text-blue-600 hover:underline font-medium">info@aldwinians.co.uk</a>
        </p>
      </div>
    </div>
  );
}
