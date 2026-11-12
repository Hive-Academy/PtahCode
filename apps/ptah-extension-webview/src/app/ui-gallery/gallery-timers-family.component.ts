import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PtahCountdownComponent, PtahRelativeTimeComponent, PtahTimerComponent } from '@ptah-extension/ui';
import { GallerySectionComponent } from './gallery-section.component';

/** Fixed sample times keep each state stable for the life of the gallery. */
@Component({
  selector: 'ptah-gallery-timers-family',
  standalone: true,
  imports: [GallerySectionComponent, PtahTimerComponent, PtahCountdownComponent, PtahRelativeTimeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ptah-gallery-section id="timer-running" title="Timer: running">
      <ptah-timer [startedAt]="startedAt" />
    </ptah-gallery-section>
    <ptah-gallery-section id="timer-frozen" title="Timer: frozen">
      <ptah-timer [startedAt]="startedAt" [endedAt]="endedAt" />
    </ptah-gallery-section>
    <ptah-gallery-section id="timer-compact" title="Timer: compact">
      <ptah-timer [startedAt]="startedAt" format="compact" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-running" title="Countdown: running">
      <ptah-countdown [deadline]="runningDeadline" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-urgent" title="Countdown: urgent">
      <ptah-countdown [deadline]="urgentDeadline" [urgentBelowMs]="86400000" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-expired" title="Countdown: expired">
      <ptah-countdown [deadline]="expiredDeadline" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-boxed-sm" title="Countdown: boxed, sm">
      <ptah-countdown [deadline]="runningDeadline" layout="boxed" size="sm" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-boxed-md" title="Countdown: boxed, md">
      <ptah-countdown [deadline]="runningDeadline" layout="boxed" size="md" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-boxed-lg" title="Countdown: boxed, lg">
      <ptah-countdown [deadline]="runningDeadline" layout="boxed" size="lg" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-boxed-urgent" title="Countdown: boxed, urgent">
      <ptah-countdown [deadline]="urgentDeadline" [urgentBelowMs]="86400000" layout="boxed" />
    </ptah-gallery-section>
    <ptah-gallery-section id="countdown-boxed-expired" title="Countdown: boxed, expired">
      <ptah-countdown [deadline]="expiredDeadline" layout="boxed" />
    </ptah-gallery-section>
    <ptah-gallery-section id="relative-past" title="Relative time: past">
      <ptah-relative-time [value]="pastTime" />
    </ptah-gallery-section>
    <ptah-gallery-section id="relative-future" title="Relative time: future">
      <ptah-relative-time [value]="futureTime" />
    </ptah-gallery-section>
  `,
})
export class GalleryTimersFamilyComponent {
  private readonly referenceNow = Date.now();
  public readonly startedAt = this.referenceNow - 185_000;
  public readonly endedAt = this.referenceNow - 65_000;
  public readonly runningDeadline = this.referenceNow + 604_800_000;
  public readonly urgentDeadline = this.referenceNow + 43_200_000;
  public readonly expiredDeadline = this.referenceNow - 30_000;
  public readonly pastTime = this.referenceNow - 300_000;
  public readonly futureTime = this.referenceNow + 604_800_000;
}
