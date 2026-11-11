import type { Metadata } from "next";
import Link from "next/link";
import "./(admin)/admin/admin.css";

// The back office owns the only root layout, so unmatched URLs outside /admin render here.
export const metadata: Metadata = {
  title: "Page Not Found | Bueno Back Office",
  robots: { index: false, follow: false },
  icons: { icon: "/images/favicon.webp" },
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="adm-body">
        <main className="adm-login">
          <section className="adm-login-card" aria-labelledby="adm-global-not-found-title">
            <p className="adm-login-tagline">Back Office</p>
            <h1 className="adm-login-title" id="adm-global-not-found-title">
              Not found
            </h1>
            <p className="adm-login-copy">There&apos;s nothing at this address.</p>
            <Link className="adm-btn adm-btn--primary" href="/admin">
              Go to the back office
            </Link>
          </section>
        </main>
      </body>
    </html>
  );
}
