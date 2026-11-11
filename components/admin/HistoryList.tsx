export interface HistoryEntry {
  id: string;
  when: string;
  who: string;
  summary: string;
}

export default function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="adm-history">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className="adm-history-when">
            {entry.when}
            <span className="adm-history-who">{entry.who}</span>
          </span>
          <span>{entry.summary}</span>
        </li>
      ))}
    </ol>
  );
}
