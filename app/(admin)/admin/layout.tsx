import type { Metadata } from "next";
import { MotionProvider } from "@/components/admin/MotionProvider";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Back Office | Bueno Leisure", template: "%s | Bueno Back Office" },
  robots: { index: false, follow: false },
  icons: { icon: "/images/favicon.webp" },
};

/** Root layout for /admin: no site CSS, Webflow, GSAP, loading screen or custom cursor. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Cormorant+Garamond:ital,wght@1,400;1,500&family=Montserrat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="adm-body">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
