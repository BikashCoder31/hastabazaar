import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { LoyaltyCycleProgress } from '@/lib/incentives/types';

export function WeeklyRewardCycle({
  weeklyPoints,
  cycle,
  dailyPoints,
  claimedToday,
  statusKnown,
  graceEnabled,
  startsNextClaim,
}: {
  weeklyPoints: readonly number[];
  cycle: LoyaltyCycleProgress;
  dailyPoints: number;
  claimedToday: boolean;
  statusKnown: boolean;
  graceEnabled: boolean;
  startsNextClaim: boolean;
}) {
  return (
    <section aria-label="Weekly rewards" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">
          {statusKnown
            ? `Day ${cycle.day} of 7`
            : 'Refresh to check your progress.'}
        </p>
        <p className="text-sm text-muted-foreground">
          {weeklyPoints.reduce((total, points) => total + points, 0)} points in
          7 days
        </p>
      </div>
      <ol
        aria-label="7-day reward schedule"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4"
      >
        {weeklyPoints.map((points, index) => {
          const day = index + 1;
          const current = statusKnown && day === cycle.day;
          const label = !statusKnown
            ? 'Check status'
            : current
              ? startsNextClaim
                ? 'Next claim'
                : claimedToday
                  ? 'Claimed today'
                  : 'Today'
              : day < cycle.day
                ? 'Completed'
                : 'Upcoming';
          return (
            <li key={day} aria-current={current ? 'step' : undefined}>
              <Card size="sm" className="h-full">
                <CardHeader>
                  <CardTitle>Day {day}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <p className="font-semibold">
                    {current && claimedToday && !startsNextClaim
                      ? dailyPoints
                      : points}{' '}
                    points
                  </p>
                  <Badge variant={current ? 'default' : 'outline'}>
                    {label}
                  </Badge>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
      {statusKnown && startsNextClaim ? (
        <p>
          {dailyPoints} points collected today. New rewards start at your next
          check-in.
        </p>
      ) : null}
      {statusKnown && claimedToday && cycle.day === 7 ? (
        <p>Next check-in: Day 1 · {weeklyPoints[0]} points.</p>
      ) : null}
      {statusKnown && cycle.resetReason === 'missed_day' ? (
        <p>Restarted at Day 1 after a missed day.</p>
      ) : null}
      {statusKnown && cycle.resetReason === 'cycle_complete' ? (
        <p>7 days complete. Back to Day 1.</p>
      ) : null}
      {statusKnown && cycle.graceApplied ? (
        <p>Grace day used. Your streak continues.</p>
      ) : null}
      {graceEnabled || !statusKnown || cycle.resetReason !== 'missed_day' ? (
        <p className="text-sm text-muted-foreground">
          {graceEnabled
            ? statusKnown && cycle.graceUsed
              ? cycle.graceApplied
                ? 'Another missed day resets to Day 1.'
                : 'Grace used. Another missed day resets to Day 1.'
              : 'One grace day per cycle. Missed days earn no points.'
            : 'Missed days reset to Day 1.'}
        </p>
      ) : null}
    </section>
  );
}
