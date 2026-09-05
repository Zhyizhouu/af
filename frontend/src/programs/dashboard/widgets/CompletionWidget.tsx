import { useCallback, useEffect, useState } from 'react';
import { AFHint, AFPanel } from '../../../components/AF';
import { useSession } from '../../../app/session';
import { completionOver, listHabits } from '../../habits/store';

export function CompletionWidget() {
  const { revision } = useSession();
  const [hasHabits, setHasHabits] = useState(false);
  const [completion, setCompletion] = useState<number[]>([]);

  const reload = useCallback(async () => {
    setHasHabits((await listHabits()).length > 0);
    setCompletion((await completionOver('week')).map((day) => day.fraction));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  // Each day renders as a track with a bar inside it, rather than a bare
  // bar. At zero a bare bar is a 2px sliver and the chart reads as broken;
  // the track keeps seven days visible and says "none of them" — which is
  // information, where an empty box is not.
  return (
    <AFPanel label="Completion" count="7 days">
      {hasHabits ? (
        <div className="dash__spark" role="img" aria-label="Completion over seven days">
          {[...completion].reverse().map((fraction, index) => (
            <span key={index} className="dash__spark-slot">
              <span className="dash__spark-bar" style={{ height: `${Math.max(fraction * 100, 2)}%` }} />
            </span>
          ))}
        </div>
      ) : (
        <AFHint>Add a habit and this fills in.</AFHint>
      )}
    </AFPanel>
  );
}
