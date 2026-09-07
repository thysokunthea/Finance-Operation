import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6">
      <SignIn fallbackRedirectUrl="/" />
    </main>
  );
}
