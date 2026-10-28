import { useEffect, useState } from 'react';
import { elapsed, type Stopwatch } from '../exercises/singleNote';
import { useI18n } from '../i18n/context';

/** Chronomètre de la note en cours (mode chronométré). Les pauses sont exclues, comme dans les mesures. */
export function LiveTimer({ stopwatch }: { readonly stopwatch: Stopwatch }) {
  const { seconds } = useI18n();
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    if (stopwatch.runningSince === null) return;
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [stopwatch.runningSince]);

  return <span className="live-timer">{seconds(elapsed(stopwatch, now))}</span>;
}
