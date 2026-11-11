import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="adm-login">
      <section className="adm-login-card" aria-labelledby="adm-not-found-title">
        <p className="adm-login-tagline">Back Office</p>
        <h1 className="adm-login-title" id="adm-not-found-title">
          Not found
        </h1>
        <p className="adm-login-copy">That page doesn&apos;t exist in the back office.</p>
        <Link className="adm-btn adm-btn--primary" href="/admin">
          Back to the overview
        </Link>
      </section>
    </main>
  );
}
