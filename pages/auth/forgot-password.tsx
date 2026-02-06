import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

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
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (err) throw err;

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Unable to send reset email. Please try again.');
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
            <span className="text-3xl">🔑</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 mb-2">
            Reset Password
          </h1>
          <p className="text-gray-600">
            Enter your email to receive a password reset link
          </p>
        </div>

        {/* Email Limit Warning */}
        <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <div className="flex items-start">
            <span className="text-xl mr-3">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-yellow-900 mb-1">Limited Email Service</p>
              <p className="text-sm text-yellow-800">
                We can only send <strong>2 password reset emails per hour</strong>. Please ensure your email address is correct before submitting. If you don't receive an email, check your spam folder or contact the Management Team.
              </p>
            </div>
          </div>
        </div>

        {success ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-6">
              <div className="flex items-start">
                <span className="text-xl mr-3">✓</span>
                <div>
                  <p className="text-sm font-medium text-green-800 mb-1">Check your email!</p>
                  <p className="text-sm text-green-700">
                    We've sent a password reset link to <strong>{email}</strong>
                  </p>
                </div>
              </div>
            </div>
            <Link
              href="/auth/login"
              className="block w-full text-center py-3 px-4 border border-gray-300 rounded-lg text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Back to Login
            </Link>
          </div>
        ) : (
          <form className="bg-white rounded-lg shadow-sm border border-gray-100 p-8" onSubmit={handleReset}>
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
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Error State */}
            {error && (
              <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-start">
                  <span className="text-xl mr-3">⚠️</span>
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full py-3 px-4 border border-transparent rounded-lg shadow-sm text-base font-semibold text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            {/* Back to Login */}
            <div className="mt-4 text-center">
              <Link
                href="/auth/login"
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                ← Back to Login
              </Link>
            </div>
          </form>
        )}

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-gray-600">
          Questions? Contact the Management Team{' '}
          <a href="mailto:info@aldwinians.co.uk" className="text-blue-600 hover:underline font-medium">
            info@aldwinians.co.uk
          </a>
        </p>
      </div>
    </div>
  );
}
