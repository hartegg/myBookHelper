import type { Metadata } from 'next';
import './globals.css';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';
import 'react-image-crop/dist/ReactCrop.css'; // Added CSS for react-image-crop

export const metadata: Metadata = {
  title: 'ComposeWrite',
  description: 'Your personal book writing assistant',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,700;1,7..72,400&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Belleza&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">{children}</body>
    </html>
  );
}
