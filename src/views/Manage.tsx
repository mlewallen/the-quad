import { useEntries, useWorkspace } from '../hooks';
import InitiativeTable from '../components/InitiativeTable';

export default function Manage() {
  const entries = useEntries();
  const labels = useWorkspace()!.config.labels;
  return (
    <div className="view">
      <div className="view-head">
        <h1>Manage</h1>
        <span className="muted small">All {labels.initiatives.toLowerCase()} this quarter. Click a row to open, shift-click checkboxes to select a range.</span>
      </div>
      <div className="card card-pad">
        <InitiativeTable entries={entries} variant="full" />
      </div>
    </div>
  );
}
