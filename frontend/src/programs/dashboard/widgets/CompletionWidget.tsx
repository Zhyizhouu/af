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

  return (
    <AFPanel label="Completion" count="7 days">
      {hasHabits ? (
        <div className="dash__spark" role="img" aria-label="Completion over seven days">
          {[...completion].reverse().map((fraction, index) => (
            <span key={index} className="dash__spark-bar" style={{ height: `${Math.max(fraction * 100, 3)}%` }} />
          ))}
        </div>
      ) : (
        <AFHint>Add a habit and this fills in.</AFHint>
      )}
    </AFPanel>
  );
}
