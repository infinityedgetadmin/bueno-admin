import type { Timeline } from "@/lib/admin/season-view";

export default function SeasonTimeline({ timeline }: { timeline: Timeline }) {
  const summary = timeline.bars.length === 0 ? "no seasons in this period" : timeline.bars.map((bar) => bar.name).join(", ");
  return (
    <div className="adm-timeline" role="img" aria-label={`Season calendar: ${summary}`}>
      <div className="adm-timeline-track">
        {timeline.bars.map((bar) => (
          <span
            key={bar.id}
            className="adm-timeline-bar"
            style={{ left: `${bar.leftPercent}%`, width: `${bar.widthPercent}%` }}
            title={bar.name}
          />
        ))}
        <span className="adm-timeline-today" style={{ left: `${timeline.todayPercent}%` }} />
      </div>
      <div className="adm-timeline-months" aria-hidden="true">
        {timeline.months.map((month) => (
          <span key={month.key} className="adm-timeline-month">
            {month.label}
          </span>
        ))}
      </div>
    </div>
  );
}
