import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'PYR — Puppy Yoga Retreat',
  description: 'Business automation platform for Puppy Yoga Retreat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background antialiased">
        <div className="flex min-h-screen">
          <aside className="hidden w-64 border-r bg-sidebar-background lg:block">
            <div className="flex h-16 items-center border-b px-6">
              <h1 className="text-lg font-semibold text-sidebar-foreground">
                PYR
              </h1>
            </div>
            <nav className="space-y-1 p-4">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/guests">Guests</NavLink>
              <NavLink href="/bookings">Bookings</NavLink>
              <NavLink href="/events">Events</NavLink>
              <NavLink href="/calendar">Calendar</NavLink>
              <NavLink href="/inbox">Inbox</NavLink>
              <NavLink href="/settings">Settings</NavLink>
            </nav>
          </aside>
          <main className="flex-1 overflow-auto">
            <div className="container mx-auto p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      {children}
    </Link>
  );
}
