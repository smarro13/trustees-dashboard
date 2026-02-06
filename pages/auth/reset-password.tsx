import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Check if we have a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Invalid or expired reset link. Please request a new one.');
      }
    };
    checkSession();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter a new password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { error: err } = await supabase.auth.updateUser({
        password: password,
      });

      if (err) throw err;

      setSuccess(true);
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/auth/login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Unable to reset password. Please try again.');
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
            Set New Password
          </h1>
          <p className="text-gray-600">
            Enter your new password below
          </p>
        </div>

        {success ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-8">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 mb-6">
              <div className="flex items-start">
                <span className="text-xl mr-3">✓</span>
                <div>
                  <p className="text-sm font-medium text-green-800 mb-1">Password updated!</p>
                  <p className="text-sm text-green-700">
                    Your password has been successfully reset. Redirecting to login...
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form className="bg-white rounded-lg shadow-sm border border-gray-100 p-8" onSubmit={handleReset}>
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-900 mb-2">
                New Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Enter new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                disabled={loading}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-colors disabled:bg-gray-50 disabled:cursor-not-allowed"
              />
            </div>

            <div className="mt-4">
              <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-900 mb-2">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
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
              {loading ? 'Updating...' : 'Update Password'}
            </button>
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
