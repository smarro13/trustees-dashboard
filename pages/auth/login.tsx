import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const resendInvite = async () => {
    await fetch('/api/auth/resend-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setSent(true);
  };

  return (
    <div>
      <h1>Access the dashboard</h1>

      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <button onClick={resendInvite}>
        Send / Resend access link
      </button>

      {sent && (
        <p>
          If you're invited, you'll receive an email shortly.
        </p>
      )}
    </div>
  );
}
