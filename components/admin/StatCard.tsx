export default function StatCard({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <section className="adm-card adm-stat" aria-label={label}>
      <span className="adm-stat-label">{label}</span>
      <span className="adm-stat-value">{value}</span>
      {foot !== undefined && <span className="adm-stat-foot">{foot}</span>}
    </section>
  );
}
