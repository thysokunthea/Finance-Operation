import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const deploymentHost =
  process.env.SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL;
const siteUrl = deploymentHost
  ? deploymentHost.startsWith('http')
    ? deploymentHost
    : `https://${deploymentHost}`
  : 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'LedgerFlow | Finance Operations',
  description: 'A controlled finance operations workspace for transactions, receivables, payables, approvals, documents, tasks, and reporting.',
  openGraph: {
    title: 'LedgerFlow | Finance Operations',
    description: 'Controlled finance operations, clearly in view.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'LedgerFlow finance operations workspace' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LedgerFlow | Finance Operations',
    description: 'Controlled finance operations, clearly in view.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}><ClerkProvider>{children}</ClerkProvider></body></html>;
}
