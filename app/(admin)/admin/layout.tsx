import type { Metadata } from "next";
import { MotionProvider } from "@/components/admin/MotionProvider";
import "./admin.css";

export const metadata: Metadata = {
  title: { default: "Back Office | Bueno Leisure", template: "%s | Bueno Back Office" },
  robots: { index: false, follow: false },
  icons: { icon: "/images/favicon.webp" },
};

/** Root layout for /admin. Fonts are declared in admin.css and served locally. */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="adm-body">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
