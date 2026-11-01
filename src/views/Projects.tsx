import { useEntries } from '../hooks';
import InitiativeTable from '../components/InitiativeTable';

export default function Projects() {
  const entries = useEntries();
  return (
    <div className="view">
      <div className="card card-pad">
        <InitiativeTable entries={entries} variant="full" />
      </div>
    </div>
  );
}
