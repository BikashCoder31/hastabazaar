'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { HomepageOccasionCarousel } from '@/components/homepage/homepage-occasion-carousel';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { BusinessSettingVersion } from '@/lib/db/repositories/business-settings';
import {
  addHomepageOccasionSlide,
  moveHomepageOccasionSlide,
  removeHomepageOccasionSlide,
  setHomepageOccasionSlideEnabled,
} from '@/lib/homepage/occasion-editor';
import {
  assertHomepageOccasionPublicationReady,
  homepageOccasionIcons,
  homepageOccasionThemes,
  validateHomepageOccasionDraft,
  type HomepageOccasionCard,
  type HomepageOccasionSlide,
  type HomepageOccasionSlides,
} from '@/lib/homepage/occasion-slides';

type OccasionVersion = BusinessSettingVersion<'homepage_occasion_slides'>;

function clone(slides: HomepageOccasionSlides): HomepageOccasionSlide[] {
  return slides.map((slide) => ({
    ...slide,
    cards: slide.cards.map((card) => ({ ...card })) as [
      HomepageOccasionCard,
      HomepageOccasionCard,
    ],
  }));
}

function optional(value: string): string | null {
  return value.trim() ? value : null;
}

function isPublicationReady(slides: HomepageOccasionSlides): boolean {
  try {
    assertHomepageOccasionPublicationReady(
      validateHomepageOccasionDraft(slides),
    );
    return true;
  } catch {
    return false;
  }
}

function versionLabel(version: OccasionVersion, now: number): string {
  if (version.status === 'draft') return 'Draft';
  if (version.status !== 'published')
    return version.status.replaceAll('_', ' ');
  if ((version.effectiveFrom ?? 0) > now) return 'Scheduled';
  if (version.effectiveUntil !== null && version.effectiveUntil <= now)
    return 'Superseded';
  return 'Current';
}

export function HomepageOccasionManager({
  initialSlides,
  history,
  asOf,
}: {
  initialSlides: HomepageOccasionSlides;
  history: readonly OccasionVersion[];
  asOf: number;
}) {
  const [slides, setSlides] = useState<HomepageOccasionSlide[]>(() =>
    clone(initialSlides),
  );
  const [previewId, setPreviewId] = useState(initialSlides[0]?.id ?? '');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop',
  );
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const readiness = useMemo(() => {
    try {
      const validated = validateHomepageOccasionDraft(slides);
      try {
        assertHomepageOccasionPublicationReady(validated);
        return {
          draftValid: true,
          publicationReady: true,
          message: `${validated.filter((slide) => slide.enabled).length} enabled slides are ready to publish.`,
        };
      } catch (error) {
        return {
          draftValid: true,
          publicationReady: false,
          message:
            error instanceof Error ? error.message : 'Slides are incomplete.',
        };
      }
    } catch (error) {
      return {
        draftValid: false,
        publicationReady: false,
        message:
          error instanceof Error ? error.message : 'Slide draft is invalid.',
      };
    }
  }, [slides]);
  const preview = slides.some((slide) => slide.enabled);

  function apply(operation: () => HomepageOccasionSlide[]) {
    try {
      const next = operation();
      setSlides(next);
      if (!next.some((slide) => slide.id === previewId))
        setPreviewId(next[0]?.id ?? '');
      setMessage('');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'The slide could not be changed.',
      );
    }
  }

  function updateSlide(id: string, patch: Partial<HomepageOccasionSlide>) {
    setSlides((current) =>
      current.map((slide) =>
        slide.id === id ? { ...slide, ...patch } : slide,
      ),
    );
  }

  function updateCard(
    slideId: string,
    index: number,
    patch: Partial<HomepageOccasionCard>,
  ) {
    setSlides((current) =>
      current.map((slide) => {
        if (slide.id !== slideId) return slide;
        const cards = slide.cards.map((card, cardIndex) =>
          cardIndex === index ? { ...card, ...patch } : card,
        ) as [HomepageOccasionCard, HomepageOccasionCard];
        return { ...slide, cards };
      }),
    );
  }

  async function saveDraft() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/business-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'homepage_occasion_slides',
          value: slides,
          reason,
          requestId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(result?.error || 'Gifting draft could not be saved.');
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Gifting draft could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeVersion(
    version: OccasionVersion,
    action: 'publish' | 'reverse',
  ) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/admin/business-settings/changes/${encodeURIComponent(version.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            expectedRevision: version.revision,
            effectiveFrom:
              action === 'publish' && effectiveFrom
                ? new Date(effectiveFrom).getTime()
                : undefined,
            reason,
            requestId: crypto.randomUUID(),
          }),
        },
      );
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(
          result?.error || 'Gifting change could not be recorded.',
        );
      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Gifting change could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="occasion-slides" className="space-y-6 border-t pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Customer homepage</p>
          <h2 className="mt-2 font-heading text-4xl tracking-tight">
            Gifting slides
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Add, edit, order, preview, schedule, and restore the gifting
            carousel. Drafts remain private until publication becomes effective.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={slides.length >= 8}
          onClick={() =>
            apply(() => addHomepageOccasionSlide(slides, crypto.randomUUID()))
          }
        >
          <Plus /> Add slide ({slides.length}/8)
        </Button>
      </div>

      <Card className={readiness.publicationReady ? 'ring-emerald-600/30' : ''}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">
              {readiness.publicationReady
                ? 'Ready to publish'
                : 'Draft needs attention'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {readiness.message}
            </p>
          </div>
          <p className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {slides.filter((slide) => slide.enabled).length} enabled ·{' '}
            {slides.length} total
          </p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {slides.map((slide, index) => (
          <SlideEditor
            key={slide.id}
            slide={slide}
            index={index}
            total={slides.length}
            onPreview={() => setPreviewId(slide.id)}
            onChange={(patch) => updateSlide(slide.id, patch)}
            onCardChange={(cardIndex, patch) =>
              updateCard(slide.id, cardIndex, patch)
            }
            onMove={(direction) =>
              apply(() =>
                moveHomepageOccasionSlide(slides, slide.id, direction),
              )
            }
            onEnabled={(enabled) =>
              apply(() =>
                setHomepageOccasionSlideEnabled(slides, slide.id, enabled),
              )
            }
            onRemove={() =>
              apply(() => removeHomepageOccasionSlide(slides, slide.id))
            }
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>
            This is the actual public carousel layout using the private draft in
            this browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={previewMode === 'desktop' ? 'secondary' : 'outline'}
              onClick={() => setPreviewMode('desktop')}
            >
              Desktop preview
            </Button>
            <Button
              type="button"
              variant={previewMode === 'mobile' ? 'secondary' : 'outline'}
              onClick={() => setPreviewMode('mobile')}
            >
              Mobile preview
            </Button>
          </div>
          {preview ? (
            <div
              data-occasion-preview={previewMode}
              className={
                previewMode === 'mobile'
                  ? 'mx-auto max-w-[390px] overflow-hidden rounded-xl border'
                  : 'overflow-hidden rounded-xl border'
              }
            >
              <HomepageOccasionCarousel
                slides={slides}
                initialSlideId={previewId}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Save and publish</CardTitle>
          <CardDescription>
            Saving creates a private version. Publishing applies from the
            selected time and never rewrites retained history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="occasion-change-reason">
              Reason and expected impact
            </Label>
            <Textarea
              id="occasion-change-reason"
              value={reason}
              maxLength={1000}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="occasion-effective-from">
              Publication effective date
            </Label>
            <Input
              id="occasion-effective-from"
              type="datetime-local"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>
          {message ? (
            <output className="block text-sm font-medium">{message}</output>
          ) : null}
          <Button
            type="button"
            disabled={busy || !readiness.draftValid || reason.trim().length < 8}
            onClick={() => void saveDraft()}
          >
            Save private draft
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
          <CardDescription>
            Preview retained versions or create a new prospective restoration
            draft.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length ? (
            history.map((version) => (
              <div key={version.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      Version {version.version} · {versionLabel(version, asOf)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {version.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSlides(clone(version.value));
                        setPreviewId(version.value[0]?.id ?? '');
                      }}
                    >
                      Preview / edit copy
                    </Button>
                    {version.status === 'draft' ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busy ||
                          !effectiveFrom ||
                          reason.trim().length < 8 ||
                          !isPublicationReady(version.value)
                        }
                        onClick={() => void changeVersion(version, 'publish')}
                      >
                        Publish / schedule
                      </Button>
                    ) : null}
                    {version.status === 'published' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || reason.trim().length < 8}
                        onClick={() => void changeVersion(version, 'reverse')}
                      >
                        Create restoration draft
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No saved versions yet. The two displayed slides are the safe code
              default.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function SlideEditor({
  slide,
  index,
  total,
  onPreview,
  onChange,
  onCardChange,
  onMove,
  onEnabled,
  onRemove,
}: {
  slide: HomepageOccasionSlide;
  index: number;
  total: number;
  onPreview: () => void;
  onChange: (patch: Partial<HomepageOccasionSlide>) => void;
  onCardChange: (index: number, patch: Partial<HomepageOccasionCard>) => void;
  onMove: (direction: 'up' | 'down') => void;
  onEnabled: (enabled: boolean) => void;
  onRemove: () => void;
}) {
  const field = (
    name:
      | 'eyebrow'
      | 'headingLead'
      | 'highlightedPhrase'
      | 'headingTail'
      | 'supportingNote',
    label: string,
    maximum: number,
    nullable = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={`${slide.id}-${name}`}>{label}</Label>
      <Input
        id={`${slide.id}-${name}`}
        name={name}
        value={(slide[name] as string | null) ?? ''}
        maxLength={maximum}
        onChange={(event) =>
          onChange({
            [name]: nullable
              ? optional(event.target.value)
              : event.target.value,
          })
        }
      />
    </div>
  );

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Slide {index + 1}</CardTitle>
            <CardDescription>
              <code>{slide.id}</code>
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={slide.enabled}
                onChange={(event) => onEnabled(event.target.checked)}
              />{' '}
              Enabled
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onPreview}
            >
              Preview
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={index === 0}
              onClick={() => onMove('up')}
              aria-label={`Move slide ${index + 1} up`}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={index === total - 1}
              onClick={() => onMove('down')}
              aria-label={`Move slide ${index + 1} down`}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={onRemove}
              aria-label={`Remove slide ${index + 1}`}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          {field('eyebrow', 'Eyebrow', 60)}
          {field('headingLead', 'Heading lead', 90)}
          {field(
            'highlightedPhrase',
            'Highlighted phrase (optional)',
            70,
            true,
          )}
          {field('headingTail', 'Heading tail (optional)', 90, true)}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${slide.id}-body`}>Body</Label>
          <Textarea
            id={`${slide.id}-body`}
            name="body"
            value={slide.body}
            maxLength={260}
            onChange={(event) => onChange({ body: event.target.value })}
          />
        </div>
        {field('supportingNote', 'Supporting note (optional)', 120, true)}
        <div className="grid gap-4 xl:grid-cols-2">
          {slide.cards.map((card, cardIndex) => (
            <ActionCardEditor
              key={cardIndex}
              slideId={slide.id}
              index={cardIndex}
              card={card}
              onChange={(patch) => onCardChange(cardIndex, patch)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActionCardEditor({
  slideId,
  index,
  card,
  onChange,
}: {
  slideId: string;
  index: number;
  card: HomepageOccasionCard;
  onChange: (patch: Partial<HomepageOccasionCard>) => void;
}) {
  const prefix = `${slideId}-card-${index + 1}`;
  return (
    <fieldset className="space-y-3 rounded-xl border p-4">
      <legend className="px-2 text-sm font-semibold">
        Action card {index + 1}
      </legend>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-kicker`}>Kicker</Label>
        <Input
          id={`${prefix}-kicker`}
          name="kicker"
          value={card.kicker}
          maxLength={60}
          onChange={(event) => onChange({ kicker: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-title`}>Title</Label>
        <Input
          id={`${prefix}-title`}
          name="title"
          value={card.title}
          maxLength={60}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-destination`}>
          Safe internal destination
        </Label>
        <Input
          id={`${prefix}-destination`}
          name="destination"
          value={card.destination}
          maxLength={200}
          placeholder="/shop?sort=newest"
          onChange={(event) => onChange({ destination: event.target.value })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${prefix}-icon`}>Approved icon</Label>
          <select
            id={`${prefix}-icon`}
            name="icon"
            value={card.icon}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) =>
              onChange({
                icon: event.target.value as HomepageOccasionCard['icon'],
              })
            }
          >
            {homepageOccasionIcons.map((icon) => (
              <option key={icon} value={icon}>
                {icon}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${prefix}-theme`}>Approved theme</Label>
          <select
            id={`${prefix}-theme`}
            name="theme"
            value={card.theme}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) =>
              onChange({
                theme: event.target.value as HomepageOccasionCard['theme'],
              })
            }
          >
            {homepageOccasionThemes.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}
