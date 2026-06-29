import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import TopHeader from '@/components/TopHeader';
import { DataSpineProvider } from '@/lib/store/dataSpineContext';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Geo Demand Engine',
  description: 'Weather-responsive geo MMM and budget-investment decisioning for media agencies.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <DataSpineProvider>
          <div className="flex min-h-screen flex-col md:flex-row">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopHeader />
              <main className="flex-1 p-5 sm:p-6">{children}</main>
            </div>
          </div>
        </DataSpineProvider>
      </body>
    </html>
  );
}
