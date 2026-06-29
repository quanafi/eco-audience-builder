import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Audience Builder — eco',
  description: 'Marketing segmentation over the Eco Plumbers customer warehouse (read-only).',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Open Sans + Work Sans, matching the legacy app. Loaded via <link> (not
            next/font) so the build never depends on a font fetch; falls back to the
            system stack if unavailable. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400&family=Work+Sans:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
